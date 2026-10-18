# PromptBox — Mobile UX Cleanup Plan

A focused plan to deliver a clean, ergonomic mobile experience for PromptBox across viewport widths from 320px to 430px, eliminating horizontal overflow at its source while preserving full desktop functionality and Firebase real-time sync.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Preserving Desktop vs. Mobile Streamlining**
> - **Desktop (≥ 768px)**: Preserves the existing top-bar layout with quick-action buttons for AI Lab, Import/Export, Theme Toggle, Settings, and direct Google Auth / Account Avatar.
> - **Mobile (< 768px)**: Streamlines the sticky header to Brand Title + Sync Indicator + Theme Toggle + Settings Gear. Sign In/Out, Import/Export, and AI Lab are neatly organized inside the Settings view under three dedicated sections.
> - **Zero Backend / Sync Disruption**: No changes will be made to Firestore rules, data schemas, sync reconciliation algorithms, or local storage keys.

---

## 1. Analysis of Horizontal Overflow Causes

Rather than relying on `overflow-x: hidden` as a band-aid, the plan addresses the specific root causes of horizontal overflow across small mobile viewports (320px, 360px, 390px, 430px):

```
┌────────────────────────────────────────────────────────────────────────┐
│                        IDENTIFIED OVERFLOW CAUSES                      │
├────────────────────────────────┬───────────────────────────────────────┤
│ Component / File               │ Exact Root Cause                      │
├────────────────────────────────┼───────────────────────────────────────┤
│ Header                         │ Combined width of title (~160px) and  │
│ src/components/Header.tsx      │ all action buttons (~280px-330px)     │
│ src/style.css (.header)        │ with 40px padding exceeds 320px-430px.│
├────────────────────────────────┼───────────────────────────────────────┤
│ Controls & Filters             │ .controlsRow uses 2 columns (1fr 1fr) │
│ src/components/ControlsSection │ down to 360px. At 360px-430px, Tag and│
│ src/style.css (.controlsRow)   │ Sort labels + selects push past edge. │
├────────────────────────────────┼───────────────────────────────────────┤
│ Prompt Cards & Action Buttons  │ Four action buttons (Use, Duplicate,  │
│ src/components/PromptCard.tsx  │ Export, Edit) with 10px 18px padding  │
│ src/style.css (.prompt-actions)│ in a 248px-wide card inner container. │
├────────────────────────────────┼───────────────────────────────────────┤
│ Modal Footers & Text Breaks    │ .modal-footer lacks flex-wrap: wrap.  │
│ src/components/*Modal.tsx      │ Long unbroken strings in title or     │
│ src/style.css (.modal-footer)  │ prompt content lack word-break rules. │
└────────────────────────────────┴───────────────────────────────────────┘
```

1. **Header Item Congestion (`src/components/Header.tsx`, `src/style.css:81-125`)**:
   - The desktop header renders: Brand icon + Title ("PromptBox"), Sync status badge, AI Lab button, Import/Export button, Theme toggle, Settings button, and either a Google Sign In button (~110px) or User Avatar + Sign Out button (~72px).
   - At 320px–430px, `.header-content` needs over 460px to display all these inline items without wrapping or pushing against viewport edges.
2. **Filter & Sort Grid Breakpoint (`src/style.css:725-755`)**:
   - `.controlsRow` is configured with `grid-template-columns: 1fr 1fr; gap: 12px;`.
   - The responsive media query only stacks them at `max-width: 360px`. Between 360px and 430px (e.g., iPhone 13/14 at 390px, Galaxy S20 at 360px), the two columns cram the select inputs and `.sort-label` with `white-space: nowrap`, causing clipping and lateral push.
3. **PromptCard Action Cluster (`src/components/PromptCard.tsx`, `src/style.css:429-450`)**:
   - Each card hosts 4 action buttons: "Use", "Duplicate", "Export", "Edit".
   - On a 320px screen (`main-container` 16px padding on both sides = 288px; card 20px padding on both sides = 248px inner width), four buttons with `padding: 10px 18px` exceed the available width.
4. **Modal Footers & Content Wrapping (`src/components/PromptDetailModal.tsx`, `src/style.css:564-571`)**:
   - `.modal-footer` uses `display: flex; justify-content: flex-end; gap: 8px;` without `flex-wrap: wrap`. In `PromptDetailModal`, 4 buttons ("Copy Prompt", "Duplicate", "Edit", "Delete") overflow the 240px available width of a 90%-width modal on 320px screens.
   - `.modal-prompt-content` lacks `overflow-wrap: break-word` and `word-break: break-word`, so long strings (URLs, continuous code, file hashes) force modal width expansion.

---

## 2. Proposed Mobile Header & Settings Organization

### A. Compact Mobile Header (< 768px)
- **Left**: Compact brand title (`PromptBox` with hammer icon, scaled cleanly to 1.15rem).
- **Right**:
  - Compact Sync Indicator: Dot + icon (with tooltip accessible on tap).
  - Theme Toggle (`#theme-toggle-btn`): Instant switch between AMOLED Dark and Light.
  - Settings Button (`#settings-btn`): Highlighted gear icon that serves as the single entry point for preferences, account, data, and AI.
- **Desktop (≥ 768px)**: Unchanged. Keeps direct buttons for AI Lab, Import/Export, and direct Sign In/Avatar in the header.

### B. Settings View Organization
The Settings modal (`src/components/AiSettingsModal.tsx` upgraded into a unified `src/components/SettingsModal.tsx`) will be structured into three logical, clearly separated sections:

```
┌────────────────────────────────────────────────────────┐
│                        SETTINGS                        │
├────────────────────────────────────────────────────────┤
│ 1. ACCOUNT & SYNC                                      │
│    • Signed in: User avatar, name, email, Sign Out CTA │
│    • Signed out: "Sign in with Google" card            │
│    • Real-time sync status indicator & explanation    │
├────────────────────────────────────────────────────────┤
│ 2. PROMPT DATA                                         │
│    • Export Prompts (JSON bundle with optional AI key) │
│    • Import Prompts (Merge, Overwrite, or Replace All) │
│    • Library stats: Active prompts count               │
├────────────────────────────────────────────────────────┤
│ 3. AI TOOLS                                            │
│    • "Open AI Prompt Lab" action launcher              │
│    • OpenRouter API Key configuration                  │
│    • Model selector with dynamic fetching & FREE flags │
│    • Custom system enhancement prompt textarea         │
└────────────────────────────────────────────────────────┘
```

1. **Section 1: Account & Sync**:
   - **Signed In State**: Displays user photo/avatar, display name, email, sync status badge ("Connected to cloud"), and a dedicated "Sign Out" button.
   - **Signed Out State**: Explains cross-device synchronization benefits, shows "Local Storage Only" status, and provides the "Sign in with Google" button.
   - Connects directly to existing `handleSignIn` and `handleSignOut` handlers.
2. **Section 2: Prompt Data**:
   - **Export Prompts**: Action button opening the Export flow (`onOpenExport`).
   - **Import Prompts**: Action button opening the Import flow (`onOpenImport`).
   - Displays current prompt count and library status.
3. **Section 3: AI Tools**:
   - **AI Prompt Lab Launcher**: Direct button to launch the AI Prompt Lab assistant modal (`onOpenAiAssistant`).
   - **AI Settings Form**: Retains all existing fields:
     - OpenRouter API key input with link to openrouter.ai.
     - Model selector with live fetching from OpenRouter and `FREE` badges.
     - System enhancement prompt textarea.
     - "Save Settings" button with feedback toast.

---

## 3. Smallest Set of Files to Modify

Only **4 files** will be modified, ensuring tight containment and zero regression risks:

1. `src/components/Header.tsx`:
   - Introduce responsive utility classes or CSS hooks so secondary actions (`ai-assistant-btn`, `import-export-btn`, auth buttons) are hidden on mobile (`< 768px`) and visible on desktop (`≥ 768px`).
   - Maintain full desktop layout and accessibility attributes.
2. `src/components/SettingsModal.tsx` (renamed/expanded from `src/components/AiSettingsModal.tsx`):
   - Add the three distinct sections: **Account & Sync**, **Prompt Data**, and **AI Tools**.
   - Wire existing `onSignIn`, `onSignOut`, `onOpenImportExport`, and `onOpenAiAssistant` props.
3. `src/App.tsx`:
   - Pass user auth state, sync status, and modal opening callbacks into the updated Settings modal component.
4. `src/style.css`:
   - Refactor `.controlsRow` breakpoint to collapse to 1 column at `max-width: 640px` (or `480px`).
   - Add `flex-wrap: wrap` and touch-target sizing (`min-height: 44px`) to `.prompt-actions`, `.modal-footer`, and `.form-actions`.
   - Add `overflow-wrap: break-word` and `word-break: break-word` to `.prompt-title`, `.prompt-preview`, and `.modal-prompt-content`.
   - Style the new Settings modal sections cleanly using the existing theme variables (`--bg-secondary`, `--bg-tertiary`, `--border`, `--text-primary`).

---

## 4. Architecture & Data Flow

```
                      ┌────────────────────────┐
                      │        App.tsx         │
                      │ (Auth, Sync, Prompts)  │
                      └───────────┬────────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│    Header.tsx    │    │ControlsSection.ts│    │ SettingsModal.ts │
│                  │    │                  │    │                  │
│ Mobile:          │    │ • Search Input   │    │ 1. Account & Sync│
│  [Logo] [Status] │    │ • 1-Col Mobile   │    │ 2. Prompt Data   │
│  [Theme] [Gear]  │    │   Tag & Sort     │    │ 3. AI Tools & Key│
│ Desktop:         │    │                  │    │                  │
│  Full Bar + Auth │    │                  │    │                  │
└──────────────────┘    └──────────────────┘    └──────────────────┘
```

---

## 5. Responsive Verification & Test Checklist

### Viewport Width Checks
- [ ] **320px (Small Mobile, iPhone SE 1st Gen / Fold Inner)**:
  - Header fits without horizontal scrollbar.
  - Tag filter and Sort select stack vertically with readable labels.
  - PromptCard buttons wrap cleanly; prompt titles wrap without overflowing card bounds.
  - Modals (Settings, Prompt Detail, Edit Prompt) fit within 90% width with wrap-enabled footers.
- [ ] **360px (Standard Android / Galaxy S20)**:
  - Header title and actions fit comfortably.
  - Card actions wrap into two balanced rows.
  - Settings modal sections display without text clipping.
- [ ] **390px (iPhone 12 / 13 / 14 / 15)**:
  - Natural thumb reach for Search, Settings, and New Prompt.
  - No horizontal scrolling anywhere on the page.
- [ ] **430px (iPhone Pro Max / Plus)**:
  - Proper padding alignment; search and filters maintain proportions.
- [ ] **Desktop (≥ 1024px)**:
  - Header displays full navigation: Sync Status, AI Lab, Import/Export, Theme Toggle, Settings, and Google Sign In / Account Avatar.
  - Prompts grid displays multi-column responsive layout.

### Functional Integrity Checks
- [ ] **Google Sign In & Sign Out**:
  - Sign in works from Settings modal (and from desktop header).
  - Sign out terminates session and updates sync status to Local Cache cleanly.
- [ ] **Import / Export**:
  - Triggering Export from Settings modal downloads the JSON prompt bundle.
  - Triggering Import from Settings modal opens import dialog and parses file correctly.
- [ ] **AI Lab Access & AI Settings**:
  - Launching AI Lab from Settings opens the AI Assistant modal.
  - Modifying API Key, Model, and Enhancement Prompt saves to `localStorage` and triggers notifications.
- [ ] **Prompt Operations**:
  - Create, Edit, Delete, Duplicate, and Copy (Use) function across all viewports.
- [ ] **PWA & Asset Verification**:
  - All icons (`/icons/icon-192.png`, `/assets/icons/icon-192.png`) load without 404 or manifest warnings.
