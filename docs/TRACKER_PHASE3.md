# PMTracking — Feature Tracker (Phase 3)

## Status key
- [ ] Not started
- [~] In progress
- [x] Done
- [!] Blocked

---

## Confirmed decisions
- **Task status:** Three values — Open / In Progress / Done. Done also sets `completedAt`. Status badge shown on card (Open badge hidden to reduce noise).
- **Task attachments:** Files uploaded to the same `pmtracking-files` container as assistant files. Task title and SOW ID passed as `taskHint`/`sowHint` to classifier for better folder placement. Attachment file IDs stored on the task; files also appear in the assistant file repository.
- **Collapsible bucket columns:** Horizontal collapse — collapsed column shrinks to a 36px vertical strip with rotated label. Open columns expand via `flex:1`. Drag-and-drop still works on collapsed columns (they act as drop targets).
- **CSV import deduplication:** By ID — existing records with matching IDs are skipped on import. New records are appended.
- **Fixed-price SOWs:** Step-chart burndown (not a curve). Milestone invoices define the steps. "FIXED PRICE" badge shown on chart. KPI row shows milestone total vs drawn.
- **Per-source drawdown bars:** Each budget source row in the funding panel shows a thin fill bar and "X used" amount derived from time entries tagged to that source.
- **AI refile action:** AI can suggest `refile_file` actions by referencing `storageName` exactly from the file list in the system prompt. Each refile card must be confirmed individually. After confirm, `reloadData()` is called to refresh the folder tree.
- **Folder tree:** Built from the `folder` field on `ProjectFile`. Slash-separated paths (e.g. `"Purview/Meeting Notes"`) create nested folders. Folders are collapsible. Root-level files (no folder) appear at the top level.

---

## Completed this phase

### PH3-1 — Fixed-price SOW support
**Files:** `app/src/types/index.ts`, `app/src/views/Dashboard.tsx`, `app/src/views/Settings.tsx`, `app/src/utils/calculations.ts`
**Change:**
- Added `pricingType: 'tm' | 'fixed'` to SOW type
- Added `MilestoneInvoice { id, label, amount, date, completed }` type
- Added `milestoneInvoices: MilestoneInvoice[]` to SOW
- Settings: pricing type toggle per SOW; milestone invoice editor (label/date/amount/tick to complete)
- Dashboard: fixed-price SOWs render a step burndown chart with FIXED PRICE badge; T&M SOWs unchanged
- Calculations: `sowForecastCost` and `sowActualCost` have fixed-price branches
- Added `Planned` to SOW lifecycle statuses
**Status:** [x]

### PH3-2 — Per-source drawdown bars on funding panel
**Files:** `app/src/views/Dashboard.tsx`
**Change:**
- `BudgetSourceBar` now accepts `timeEntries` prop
- Calculates `drawnBySource` from time entries tagged to each budget source
- Each source row shows a thin fill bar and "X used" amount (red if over budget)
- Replaces the previous flat list of source names and amounts
**Status:** [x]

### PH3-3 — Burndown series pre-start fix
**Files:** `app/src/utils/calculations.ts`
**Change:**
- `generateBurndownSeries` now extends back to the earliest time entry date
- Math.min applied to prevent dip bug when actual series is shorter than forecast
- Holds last known cumulative value rather than dropping to zero
**Status:** [x]

### PH3-4 — Task status field
**Files:** `app/src/types/index.ts`, `app/src/views/Tasks.tsx`
**Change:**
- Added `TaskStatus = 'Open' | 'In Progress' | 'Done'` type
- Added required `status: TaskStatus` field to `Task` interface
- Task card: status badge (Open badge hidden, In Progress = cyan, Done = green)
- Task panel: Status dropdown; setting to Done also sets `completedAt`
- Filter bar: status filter added
**Status:** [x]

### PH3-5 — Task file attachments
**Files:** `app/src/types/index.ts`, `app/src/views/Tasks.tsx`, `api/src/functions/files.ts`
**Change:**
- Added required `attachments: string[]` (ProjectFile ids) to `Task` interface
- Task panel: "Attach file" button uploads via `/api/files` with `taskHint` and `sowHint`
- Uploaded files stored in `pmtracking-files`, appear in assistant file repository
- Task card: paperclip badge shows attachment count
- `classifyFile` API function accepts optional `taskHint` and `sowHint` params for context-aware classification
**Status:** [x]

### PH3-6 — Horizontally collapsible bucket columns
**Files:** `app/src/views/Tasks.tsx`
**Change:**
- `BucketColumn` accepts `isCollapsed` and `onToggle` props
- Collapsed: `flex: 0 0 36px`, vertical strip with `writing-mode: vertical-rl` rotated label + task count badge
- Expanded: `flex: 1`, full column content with inline collapse toggle in the header
- Drag-and-drop works on collapsed columns
- `collapsedBuckets: Set<TaskBucket>` state in main Tasks view
- Removed the separate header row — column headers are now inside each `BucketColumn`
**Status:** [x]

### PH3-7 — CSV export/import for tasks
**Files:** `app/src/views/Tasks.tsx`
**Change:**
- Export: downloads `tasks-YYYY-MM-DD.csv` with all task fields stringified
- Import: reads CSV, deduplicates by ID, appends new rows
- Helpers: `escapeCsv`, `downloadCsv`, `parseCsvRows` (module-level, not exported)
- Export/Import buttons in Tasks view header alongside New Task
**Status:** [x]

### PH3-8 — CSV export/import for RAID log
**Files:** `app/src/views/RAID.tsx`
**Change:**
- Context-aware: Export/Import operates on whichever tab is currently active (risks/issues/decisions)
- Export: separate files per type (`risks-*.csv`, `issues-*.csv`, `decisions-*.csv`)
- Import: deduplicates by ID per tab
- Same CSV helpers as Tasks (duplicated — module-level in each file)
- Export/Import buttons in RAID view header alongside Add button
**Status:** [x]

### PH3-9 — Collapsible folder tree in file browser
**Files:** `app/src/views/Assistant.tsx`
**Change:**
- `buildTree(files)` parses `folder` field as `/`-separated path into nested `TreeNode` objects
- `FolderNode` component: collapsible (click header), shows chevron + folder icon + file count
- `FileLeaf` component: indented by depth, thumbnail for images, click to preview
- Root-level files (no folder / "Uncategorised") shown at top level without parent folder
- `collapsed: Set<string>` state keyed by folder path
- Replaces previous flat `FileRow` list
**Status:** [x]

### PH3-10 — AI refile_file action
**Files:** `api/src/functions/write.ts`, `api/src/functions/ai.ts`, `app/src/views/Assistant.tsx`, `app/src/App.tsx`
**Change:**
- `write.ts`: new `refile_file` case — updates `folder` and optionally `sowId` on a `ProjectFile`; matches by `storageName`, `name`, or `id`
- `ai.ts`: file list in system prompt now includes `storageName` field for precise targeting; refile action documented in system prompt
- `Assistant.tsx`: `refile_file` added to `ACTION_META`; after confirm calls `onRefileConfirm()` which calls `reloadData()`
- `App.tsx`: `reloadData()` function added to `AppContext` — re-fetches blob without saving
- **Bug fixed:** `reloadData` was not accessible inside the `Message` component (closure issue) — fixed by passing it as `onRefileConfirm` prop to `Message`
**Status:** [x]

### PH3-11 — SWA assets MIME type hotfix
**Files:** `app/staticwebapp.config.json`
**Change:**
- Added `/assets/*` to `navigationFallback.exclude`
- Without this, Vite's hashed JS bundles in `/assets/` were caught by the SWA fallback and served as `index.html` with `application/octet-stream` MIME type, breaking the app entirely
**Status:** [x]

### PH3-12 — TypeScript strict mode fixes
**Files:** `app/src/views/Tasks.tsx`, `app/src/views/RAID.tsx`, `app/src/views/Assistant.tsx`
**Change:**
- CSV export: all numeric fields explicitly converted with `String()` to satisfy `string[][]` type
- `setData` calls: replaced `setData(prev => ...)` pattern (invalid — context setter is not a React state function) with `setData({ ...data, ... })`
- `reloadData` in `Message` component: was referenced in closure without access — fixed by passing as `onRefileConfirm` prop
**Status:** [x]

---

## Open items for Phase 4

### PH4-1 — Task filter persistence
Currently all filters (priority, status, SOW, hide completed) reset on navigation. Consider saving to `sessionStorage` or `localStorage`.

### PH4-2 — Timesheet notes column
Notes column was added with truncation and hover tooltip — but the column heading may need width adjustment on smaller screens.

### PH4-3 — Program-level task SOW display
Tasks with `sowId: null` (program-level) show no project label on the card. Could add a subtle "Program" chip for clarity.

### PH4-4 — Dashboard program burndown null chartSowId
When `chartSowId` is null, the burndown shows the program-level chart. Pills filter the chart independently of the selected SOW card. This behaviour is intentional but could confuse new users — consider a tooltip or label.

### PH4-5 — Tony Henderson handover brief
Program-level task T43 — due 15 May. Separate from the app but worth tracking here.

### PH4-6 — ConnectWise project codes
Once KC Ong configures CW, update `projectCodes` array on each SOW in Settings.

### PH4-7 — Orchestry Pro vs Enterprise licensing
~$25k delta unresolved. Update SOW 4 budget once decided.

### PH4-8 — File preview for task attachments
Currently attachment files in the task panel link by ID but don't have an inline preview. Could add the same preview modal used in the assistant.

---

## Architecture notes for next session

### Starting a fresh conversation
1. Read `docs/MEMORY.md` — deployment details, startup commands, tech stack
2. Read `docs/TRACKER_PHASE3.md` (this file) — what was built and known issues
3. Run locally: Azurite → `api/npm start` → `app/npm run dev`
4. Check GitHub Actions for any failed deploys before making changes

### Key patterns to preserve
- **Single blob:** All app state in `pmtracking/appdata.json`. Never split into multiple blobs.
- **Context `setData` is not a React setter:** Always `setData({ ...data, ... })`, never `setData(prev => ...)`.
- **TS strict mode:** All fields in object literals must match the interface exactly. Numbers in string arrays must be `String(n)`.
- **`reloadData()`:** Use when server state changes outside of `setData` (e.g. after API write actions). Exposed on `AppContext`.
- **CSV helpers:** Duplicated in Tasks.tsx and RAID.tsx (module-level). Not shared via a utility to keep each view self-contained.
- **File classification context:** Always pass `taskHint` and `sowHint` when uploading from a task context. The classifier uses these to produce better folder assignments.
