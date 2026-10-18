# PromptBox Cross-Device Sync with Firebase

A resilient, privacy-preserving cross-device synchronization architecture for PromptBox using Firebase Authentication (Google Sign-In only) and Cloud Firestore.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design decisions have been incorporated into this plan based on your guidance:
> - **Authentication Scope**: Google Sign-In only via popup (`signInWithPopup`). No email/password or anonymous auth.
> - **Data Scope**: Synchronize prompts only (`/users/{userId}/prompts/{promptId}`). **OpenRouter API keys and AI settings remain strictly in local storage on each device.**
> - **First-Time Sync Dialog**: Explicit 3-option confirmation modal before any cloud sync begins, with automatic local backup before destructive actions.
> - **Sample Prompt Protection**: Built-in sample prompts (IDs "1", "2", "3", "4") are identified and excluded from cloud sync unless modified or explicitly included by the user.
> - **Conflict Resolution**: Stable prompt IDs (`id`) identify documents. A **Last-Modified-Wins** policy resolves conflicts based on the most recent ISO timestamp (`lastUsed` or `createdAt`).

---

### Confirmed Decisions Summary

- **Sign-In Method**: Google Sign-In only (`GoogleAuthProvider` via popup).
- **Initial Sync Strategy**: Confirmation modal presenting three clear choices:
  1. **Merge both libraries** (Recommended): Combines local and cloud prompts, using stable IDs.
  2. **Use the cloud library on this device**: Replaces local prompt store with cloud prompts (with local backup created first).
  3. **Replace the cloud library with this device's library**: Overwrites cloud library with current local prompts (with cloud snapshot taken first).
- **Conflict Resolution**: Stable prompt IDs (`id`) identify documents. If conflicting edits occur on the same ID across devices, a **Last-Modified-Wins** policy resolves conflicts based on the most recent ISO timestamp (`lastUsed` or `createdAt`).
- **AI Settings Privacy**: `promptForgeAiSettings` (containing OpenRouter API key) is never uploaded to Firestore or transmitted off-device.

---

## 1. Overview & Core Concept

PromptBox currently saves all prompts to `localStorage` under `promptForgePrompts`. This plan enables users to sign in with their Google account to automatically synchronize their prompt collection across phones, tablets, and laptops in real time using Cloud Firestore, while preserving offline access, local-only AI keys, and existing import/export capabilities.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              PromptBox App                             │
├────────────────────────────────────────────────────────────────────────┤
│  Header: Title | AI Lab | Import/Export | Theme | AI Settings | Auth   │
│                                                          ▲             │
│                                                          │             │
│                                                   Google Sign-In       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        Local Storage Layer                             │
│  - promptForgeAiSettings (API Key, Model)   <-- STRICTLY LOCAL ONLY    │
│  - theme, pf_sort, pf_selectedTag           <-- Device Preferences     │
│  - promptForgePrompts_backup                <-- Auto-backup snapshot   │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                       (When Signed In & Confirmed)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                    Firestore Synchronization Layer                     │
│  - Collection: /users/{userId}/prompts/{promptId}                      │
│  - Offline Persistence Enabled (persistentLocalCache)                  │
│  - Realtime onSnapshot listener for instant updates across devices    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. First-Time Synchronization & Conflict Resolution

### 2.1 First-Time Sync Confirmation Modal

When a user signs in with Google on a device that already has local prompts:
1. The app queries the user's Firestore collection `/users/{userId}/prompts` once.
2. If the cloud collection already contains prompts **and** the local device contains prompts that are not yet in sync, a **First-Time Sync Dialog** appears:
   - **Merge both libraries (Recommended)**: Uploads unique local prompts to Firestore, downloads cloud prompts, and combines both.
   - **Use cloud library on this device**: Replaces the local prompt list with the user's cloud library. An automatic local backup is saved to `localStorage.getItem('promptForgePrompts_backup_<timestamp>')` before replacement.
   - **Replace cloud library with this device's library**: Deletes extraneous cloud prompts and uploads the current device's local prompts.
3. If the cloud collection is empty:
   - If the local prompts are only the default built-in sample prompts, the cloud library is initialized empty (or user is prompted whether to upload sample prompts).
   - If the local library contains custom user prompts, the user is offered a one-click "Upload local prompts to cloud" prompt.

### 2.2 Distinguishing Sample Data from User Content

The original app seeds four default sample prompts (`id: "1", "2", "3", "4"`).
- We maintain a list of default sample prompt signatures (`SAMPLE_PROMPT_IDS = new Set(['1', '2', '3', '4'])`).
- If an item has an ID in `SAMPLE_PROMPT_IDS` and matches the default sample text without modifications, it is flagged as `isSample: true`.
- During initial sync, default unmodified sample prompts are **not** automatically uploaded to Firestore, ensuring a user's cloud collection remains clean and personal.

### 2.3 Conflict Resolution Policy (Concurrent or Offline Edits)

- Every prompt has a stable string `id` (e.g. `uuid` or legacy string ID) used as the Firestore document ID: `/users/{userId}/prompts/{prompt.id}`.
- If edits happen simultaneously or while offline:
  - Firestore's built-in offline cache queues writes and synchronizes on reconnect.
  - When comparing conflicting versions of the same prompt ID, the version with the newer timestamp (`lastUsed || createdAt`) takes precedence (**Last-Modified-Wins**).
  - If titles or contents differ and cannot be safely merged, the secondary version is preserved as a duplicate with `(Copy)` appended to the title so no content is lost.

---

## 3. Security & Privacy Rules

### Firestore Security Rules (`firestore.rules`)

Each authenticated user has access **only** to their own document subtree:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Default-deny catch-all
    match /{document=**} {
      allow read, write: if false;
    }

    // User prompts collection
    match /users/{userId}/prompts/{promptId} {
      // Users can only read and write their own prompts
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Privacy & API Key Protection
- The OpenRouter API key and prompt enhancement settings (`promptForgeAiSettings`) are stored **exclusively** in browser `localStorage`.
- No settings collection is created in Firestore; API keys never leave the local client.

---

## 4. Offline Support & Existing Features Preservation

1. **Firestore Offline Persistence**:
   - Initialized with `persistentLocalCache` and `persistentMultipleTabManager` from `@firebase/firestore`.
   - All prompt queries, creations, and edits succeed instantly while offline and push to the cloud seamlessly upon reconnecting.
2. **Signed-Out State**:
   - When signed out, PromptBox continues to read and write directly to `localStorage` (`promptForgePrompts`), functioning exactly as it does today.
3. **Account Switching & Clean Sign-Out**:
   - When a user signs out, all active Firestore snapshot listeners (`onSnapshot`) are immediately detached.
   - In-memory prompts state is cleared of the previous user's cloud data and restored to the local device's unauthenticated state (or default prompts), preventing data cross-contamination.
4. **Existing PWA & Import/Export**:
   - The JSON export/import v2 format (`promptbox.export`) remains 100% identical.
   - PWA caching (`service-worker.js`) and theme settings remain intact.

---

## 5. Technical Architecture & Component Structure

```
src/
├── firebase/
│   ├── config.ts            # Firebase app initialization, Auth, and Firestore with offline cache
│   └── syncService.ts       # Firestore CRUD, onSnapshot listener, batch sync, and backup utils
├── components/
│   ├── Header.tsx           # Updated with User Avatar / Sign-In / Sign-Out button
│   ├── SyncConfirmModal.tsx # First-time sync choice modal (Merge, Cloud-only, Local-only)
│   └── ... (existing modals & cards unchanged)
├── types.ts                 # Extended with UserProfile, SyncStatus, SyncChoice types
└── App.tsx                  # Coordinates auth state, sync listeners, and local fallback
```

---

## 6. Exact Files to Change

| File | Change Description |
| :--- | :--- |
| **`package.json`** | Add `firebase` dependency (`^11.0.0` or compatible). |
| **`src/firebase/config.ts`** *(New)* | Initializes Firebase App, Auth (`GoogleAuthProvider`), and Firestore with `persistentLocalCache`. |
| **`src/firebase/syncService.ts`** *(New)* | Implements Firestore sync methods: `subscribeToUserPrompts`, `savePromptToCloud`, `deletePromptFromCloud`, `mergeLibraries`, `backupLocalPrompts`, and sample prompt filter. |
| **`src/types.ts`** | Add types for `SyncChoice`, `SyncModalState`, and `AuthUser`. |
| **`src/components/Header.tsx`** | Add Google Sign-In button when unauthenticated, or user photo/email and Sign-Out dropdown when signed in. |
| **`src/components/SyncConfirmModal.tsx`** *(New)* | Modal rendering the 3 first-time sync choices with plain-language explanations, warnings, and backup confirmations. |
| **`src/App.tsx`** | Wire `onAuthStateChanged`, manage Firestore snapshot subscription, trigger sync confirmation modal when needed, and maintain local fallback when signed out. |
| **`firestore.rules`** *(New)* | Enforces strict per-user document isolation (`request.auth.uid == userId`). |

---

## 7. Firebase Console Setup Steps (Manual)

Before running the application with cloud sync, these steps are completed once in the [Firebase Console](https://console.firebase.google.com):

1. **Create or Select Project**:
   - Go to [Firebase Console](https://console.firebase.google.com) and create or select your project.
2. **Enable Authentication**:
   - In the left sidebar, navigate to **Build > Authentication > Get started**.
   - Under the **Sign-in method** tab, click **Google**.
   - Enable the provider, select your project support email, and click **Save**.
3. **Configure Authorized Domains**:
   - Under **Authentication > Settings > Authorized domains**, ensure your app domain is listed:
     - `localhost` (default)
     - The AI Studio development / shared URL (e.g. `ais-dev-*.run.app` or custom domain).
4. **Create Cloud Firestore Database**:
   - Navigate to **Build > Firestore Database > Create database**.
   - Choose a location (e.g., `nam5 (us-central)` or closest to your region).
   - Start in **Production mode** (the application will deploy the strict rules).
5. **Register Web App**:
   - In Project Overview, click the **Web icon (`</>`)** to add a web app (e.g. `PromptBox Web`).
   - Copy the `firebaseConfig` keys (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
   - Place these in `firebase-applet-config.json` (or `.env` / config module).

---

## 8. Verification & Test Plan

1. **First Sign-In with Local Prompts**:
   - Create 2 custom local prompts while signed out.
   - Click Google Sign-In. Verify the Sync Confirmation Modal appears with 3 clear options.
   - Choose "Merge both libraries (Recommended)". Verify local prompts upload to Firestore and remain visible in the UI.
2. **First Sign-In with No Local Prompts**:
   - Clear local storage. Sign in on a new device. Verify cloud prompts download immediately without prompting.
3. **Sample Prompts Exclusion**:
   - Launch app on clean browser with default 4 sample prompts.
   - Sign in. Verify default sample prompts are not pushed to Firestore as user-created data.
4. **Deletion Sync**:
   - Delete a prompt on Device A. Verify it disappears in real time on Device B via the Firestore `onSnapshot` listener.
5. **Offline Edits & Reconnection**:
   - Disconnect network on Device A. Edit a prompt and create a new prompt.
   - Reconnect network. Verify changes automatically sync to Firestore and appear on Device B.
6. **Sign-Out & Account Switching**:
   - Sign out of Account A. Verify Account A's prompts are cleared from the active view and snapshot listener is cancelled.
   - Sign in as Account B. Verify only Account B's prompts load.
7. **Security Rules Isolation**:
   - Attempt to read or write `/users/OTHER_USER_ID/prompts/...` with authenticated user token. Verify permission denied.
8. **Regression & Import/Export Tests**:
   - Run `npm test` to verify all existing unit tests in `tests/import_export.test.js` continue to pass 100%.
