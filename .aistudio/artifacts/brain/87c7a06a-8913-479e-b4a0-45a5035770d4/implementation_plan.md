# PromptBox Cross-Device Sync & Reliability Implementation Plan (Final Revision)

A robust, hardened, privacy-preserving synchronization architecture for PromptBox that protects local data during startup, provides cross-device deletion tombstones, handles offline initial synchronization safely, guarantees idempotent live-sync conflict resolution, and structures Vite production assets cleanly.

## User Review & Critical Decisions

> [!IMPORTANT]
> This final revision addresses all 6 architectural and operational requirements:
> 1. **Cross-Device Deletion Tombstones**: Deletions are stored in Firestore under `/users/{userId}/tombstones/{promptId}` and never auto-pruned. Offline or stale devices consult this collection before merging, preventing resurrecting deleted prompts.
> 2. **Offline Initial Sync Deferral**: If the initial server fetch fails, cloud state is treated as *unknown* (not empty). Local prompts remain completely untouched; no overwriting, seeding, or replacement occurs until the server confirms cloud contents.
> 3. **Vite Production Assets (`public/`)**: All root static assets (`service-worker.js`, `offline.html`, `manifest.json`, `icons/`, `robots.txt`) are organized in Vite's `public/` directory so they are cleanly emitted to `dist/` with exact root URLs.
> 4. **Live-Sync Idempotent Conflict Resolution**: Live snapshot reconciliation compares `updatedAt` (with legacy fallback to `createdAt`). Concurrent divergent edits generate a deterministic conflict copy ID to prevent duplicate copies on repeated snapshots.
> 5. **Firestore Document Integrity & Console Verification**: Enforces `incoming().id == promptId` in security rules for prompts and tombstones on the named database `ai-studio-promptbox-87c7a06a-8913-479e-b4a0-45a5035770d4`. Explicit manual Firebase Console checks are defined.
> 6. **Full Validation Matrix**: Preserves local-only AI keys, PWA installability, and themes, backed by automated unit tests and manual cross-device testing.

---

## 1. Cross-Device Deletion Tombstones

### 1.1 Architecture & Schema
Instead of a device-only `localStorage` deletion log, deletions are persisted in Firestore so all devices share the deletion history:

- **Collection Path**: `/users/{userId}/tombstones/{promptId}`
- **Tombstone Document Schema**:
  ```typescript
  export interface PromptTombstone {
    id: string;        // ID of the deleted prompt (matches document ID)
    deletedAt: string; // ISO 8601 timestamp
    userId: string;    // Owner UID
  }
  ```

### 1.2 Synchronization Rules
- **On Deletion**:
  A Firestore batch write simultaneously deletes `/users/{userId}/prompts/{promptId}` and creates `/users/{userId}/tombstones/{promptId}`.
- **On Merging / Reconnection**:
  Before any device uploads or restores a local prompt, it queries `/users/{userId}/tombstones`. If a tombstone exists for that `id` with `deletedAt >= prompt.updatedAt`, the prompt is recognized as deleted and purged from the local device without uploading.
- **No Automatic Pruning**:
  Tombstones are never automatically pruned after 30 days, guaranteeing that devices offline for months will not resurrect deleted prompts.
- **Intentional Recreation**:
  If a user explicitly recreates or imports a prompt with the same ID, its new `updatedAt` is greater than `deletedAt`. In that case, the tombstone document is deleted and the new prompt is accepted.

---

## 2. Offline Initial Synchronization (Safe Deferral)

### 2.1 The Problem
If a user signs in while offline or with an unstable network connection, an initial query to Firestore might fail or return an empty cache. Assuming the cloud is "empty" would cause local prompts to overwrite the cloud or trigger an erroneous sync choice.

### 2.2 Safe Deferral Logic
1. When authentication is confirmed, the app requests cloud prompts and tombstones specifically from the server:
   ```typescript
   try {
     const cloudPrompts = await getDocsFromServer(collection(db, 'users', userId, 'prompts'));
     const tombstones = await getDocsFromServer(collection(db, 'users', userId, 'tombstones'));
     // Proceed to evaluate sync choice with verified server data
   } catch (error) {
     // Network failure: treat cloud library as UNKNOWN
     setSyncState('SYNC_DEFERRED_OFFLINE');
     // Do NOT attach live onSnapshot
     // Do NOT show FirstTimeSync modal
     // Do NOT wipe or overwrite local prompts
   }
   ```
2. While in `SYNC_DEFERRED_OFFLINE`:
   - All local prompts remain fully available and editable.
   - The Header status indicator displays **"Offline"** with tooltip *"Offline - changes will sync when connected"*.
   - A window `online` listener and reconnection retry automatically re-attempt the server query once connectivity is re-established.

---

## 3. Vite Production Assets & PWA Compatibility

### 3.1 Asset Directory Structure
Move static files from the repository root into `public/` so Vite automatically copies them verbatim into `dist/` during `npm run build`:

```
public/
├── service-worker.js
├── offline.html
├── manifest.json
├── robots.txt
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

### 3.2 Service Worker Modernization (`public/service-worker.js`)
- **Cache Name**: `promptbox-cache-v5`
- **Precaching**: Precache only static root shell assets:
  ```javascript
  const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/offline.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
  ];
  ```
  *(Obsolete `/style.css` and `/script.js` references are removed)*.
- **Activation Event**:
  Iterate all cache names in `caches.keys()`. Delete any cache that is not `promptbox-cache-v5` (`promptbox-cache-v4`, etc.). Call `self.clients.claim()`.
- **Fetch Strategy**:
  - Requests to OpenRouter (`openrouter.ai`) and Firebase (`*.firebaseio.com`, `firestore.googleapis.com`, `identitytoolkit.googleapis.com`): Bypass service worker entirely.
  - Hashed Vite bundles (`/assets/*`): Cache-first with network fallback.
  - Page navigation: Network-first, falling back to cached `/index.html` or `/offline.html`.

---

## 4. Live-Sync Conflict Resolution & Legacy Migration

### 4.1 Timestamp Invariant (`updatedAt`)
- Every prompt has:
  - `createdAt`: Set once on creation; immutable.
  - `updatedAt`: Set on creation, and refreshed whenever title, content, or tags change.
  - `lastUsed`: Updated only when copied/used (does not affect `updatedAt`).

### 4.2 Legacy Cloud Migration
- If a cloud document lacks `updatedAt`, the client safely defaults:
  `updatedAt = data.updatedAt || data.createdAt || new Date().toISOString()`.

### 4.3 Idempotent Conflict Resolution During Live Sync
When a remote snapshot arrives for an existing prompt ID that also has uncommitted local edits:
1. If `tombstones.has(prompt.id)`: The prompt is deleted locally.
2. If `remote.updatedAt > local.updatedAt`: The remote version replaces the local version.
3. If `local.updatedAt > remote.updatedAt`: The local version is retained and will push to Firestore.
4. If contents differ and both were edited concurrently:
   - The version with the higher timestamp retains the original `id`.
   - The other version is preserved as a conflict copy with a **deterministic ID**:
     `conflictId = `${prompt.id}_conflict_${remote.updatedAt.replace(/[:.]/g, '-')}`;`
   - Using a deterministic ID ensures repeated snapshots from Firestore do **not** generate duplicate conflict copies.
   - Title is labeled: `"${prompt.title} (Conflict Copy)"`.

---

## 5. Firestore Document Integrity & Security Rules

### 5.1 Document Integrity
- Prompt document path: `/users/{userId}/prompts/{promptId}`
- Tombstone document path: `/users/{userId}/tombstones/{promptId}`
- Invariant: `incoming().id == promptId` and `incoming().userId == userId`.

### 5.2 Updated `firestore.rules`

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if false;
    }

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    function isValidId(id) {
      return id is string && id.size() <= 128 && id.matches('^[a-zA-Z0-9_\\-]+$');
    }

    function incoming() {
      return request.resource.data;
    }

    function existing() {
      return resource.data;
    }

    function isValidPrompt(data, userId) {
      return data.keys().hasAll(['id', 'title', 'content', 'tags', 'createdAt', 'updatedAt', 'useCount'])
        && data.keys().hasOnly(['id', 'title', 'preview', 'content', 'tags', 'createdAt', 'updatedAt', 'lastUsed', 'useCount', 'userId'])
        && data.id is string && data.id.size() <= 128
        && data.title is string && data.title.size() <= 500
        && (!('preview' in data) || data.preview == null || (data.preview is string && data.preview.size() <= 1000))
        && data.content is string && data.content.size() <= 100000
        && data.tags is list && data.tags.size() <= 50
        && data.createdAt is string && data.createdAt.size() <= 50
        && data.updatedAt is string && data.updatedAt.size() <= 50
        && (!('lastUsed' in data) || data.lastUsed == null || (data.lastUsed is string && data.lastUsed.size() <= 50))
        && data.useCount is number && data.useCount >= 0
        && (!('userId' in data) || data.userId == userId || data.userId == request.auth.uid);
    }

    function isValidTombstone(data, userId) {
      return data.keys().hasAll(['id', 'deletedAt', 'userId'])
        && data.keys().hasOnly(['id', 'deletedAt', 'userId'])
        && data.id is string && data.id.size() <= 128
        && data.deletedAt is string && data.deletedAt.size() <= 50
        && data.userId == userId;
    }

    // Prompts Collection
    match /users/{userId}/prompts/{promptId} {
      allow get, list: if isOwner(userId);
      allow create: if isOwner(userId) && isValidId(promptId) && incoming().id == promptId && isValidPrompt(incoming(), userId);
      allow update: if isOwner(userId) && isValidId(promptId) && incoming().id == promptId
        && isValidPrompt(incoming(), userId)
        && incoming().createdAt == existing().createdAt;
      allow delete: if isOwner(userId) && isValidId(promptId);
    }

    // Deletion Tombstones Collection
    match /users/{userId}/tombstones/{promptId} {
      allow get, list: if isOwner(userId);
      allow create, update: if isOwner(userId) && isValidId(promptId) && incoming().id == promptId && isValidTombstone(incoming(), userId);
      allow delete: if isOwner(userId) && isValidId(promptId); // Permitted for intentional prompt recreation
    }
  }
}
```

### 5.3 Firebase Console Manual Verification Steps
1. **Firestore Database Verification**:
   - Open Firebase Console > **Firestore Database**.
   - Verify the database ID: `ai-studio-promptbox-87c7a06a-8913-479e-b4a0-45a5035770d4`.
   - Confirm the location and that database mode is active.
2. **Rules Verification**:
   - In Firestore Database, click the **Rules** tab.
   - Confirm the rules match the specification above.
3. **Authentication Verification**:
   - Navigate to **Authentication > Sign-in method**.
   - Confirm **Google** is Enabled with the Web client ID matching `firebase-applet-config.json`.
4. **Authorized Domains**:
   - Under **Authentication > Settings > Authorized domains**, confirm the app preview URL domain is present.

---

## 6. Exact Files to Change

| File | Planned Changes |
| :--- | :--- |
| **`public/`** *(New Directory)* | Relocate `service-worker.js`, `offline.html`, `manifest.json`, `robots.txt`, and `icons/` into `public/`. |
| **`public/service-worker.js`** | Update to `promptbox-cache-v5`, purge old caches, and precache clean root assets. |
| **`index.html`** | Verify manifest, icons, and service-worker registration point to root paths. |
| **`src/types.ts`** | Add `updatedAt` to `Prompt`; add `PromptTombstone` and `BackupResult` interfaces. |
| **`src/utils/importExport.ts`** | Normalize `updatedAt` with fallback to `createdAt`; update import reconciliation. |
| **`src/utils/sampleData.ts`** | Add initial `updatedAt` to sample prompts. |
| **`src/firebase/syncService.ts`** | Implement tombstone CRUD (`saveTombstone`, `fetchTombstones`); add `updatedAt` support; implement validated `backupLocalPrompts`; enforce mandatory backup checks; implement deterministic conflict copying. |
| **`src/App.tsx`** | Implement offline sync deferral (`SYNC_DEFERRED_OFFLINE`); update save handlers to touch `updatedAt`; update delete handler to write tombstones; wire idempotent live conflict resolution. |
| **`firestore.rules`** | Add tombstone validation rules and enforce `updatedAt` and `id == promptId`. |
| **`firebase-blueprint.json`** | Add `Prompt` `updatedAt` property and document `tombstones` collection. |
| **`tests/import_export.test.js`** | Add automated test suites for `updatedAt` normalization, legacy migration, and conflict idempotency. |

---

## 7. Testing & Verification Specification

### 7.1 Automated Tests (`npm test`)
1. **Legacy Import Migration**: Importing a v1/v2 payload without `updatedAt` assigns `updatedAt = createdAt` without throwing.
2. **`updatedAt` Integrity**: Editing title or content refreshes `updatedAt`, while copying only updates `lastUsed` and `useCount`.
3. **Deterministic Conflict Resolution**: Reconciling two divergent prompts with identical timestamps produces an idempotent conflict copy ID; repeated passes do not generate multiple copies.
4. **Tombstone Precedence**: A prompt whose ID exists in the tombstone list with `deletedAt >= updatedAt` is discarded during merge.

### 7.2 Production Build Verification (`npm run build`)
- Check that `dist/service-worker.js`, `dist/offline.html`, `dist/manifest.json`, and `dist/icons/` exist directly in `dist/`.
- Ensure TypeScript compilation and Vite bundling complete with 0 errors.

### 7.3 Manual Firebase Cross-Device Tests
1. **Offline Initial Sign-In**: Disconnect network, sign in. Verify app enters `SYNC_DEFERRED_OFFLINE` with no data loss and no premature sync prompt. Reconnect network; verify cloud query runs cleanly.
2. **Cross-Device Deletion & Stale Reconnection**: Create prompt on Device A and B. Delete prompt on Device A. Disconnect Device B, reconnect hours later. Verify Device B purges the prompt instead of re-uploading it.
3. **Intentional Re-creation**: Create a prompt with the same ID after deletion. Verify the tombstone is deleted and the prompt persists.
