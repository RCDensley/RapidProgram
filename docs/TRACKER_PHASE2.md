# PMTracking — Feature Tracker (Phase 2)

## Status key
- [ ] Not started
- [~] In progress
- [x] Done
- [!] Blocked

---

## Confirmed decisions
- **Model:** `gpt-5.4-mini` via Azure AI Foundry Responses API
- **Chat persistence:** Transient (session-only, not saved to blob)
- **Foundry wiring:** Isolated in `api/_lib/providers/foundry.ts` — nothing outside calls Foundry directly
- **Tasks:** Draggable cards with tilt/shadow on drag, bucket and sowId auto-update on drop
- **Recurrence:** Auto-generates next task on completion, same bucket
- **Risk → Issue promotion:** One-click promote, carries title/description, records linkage both ways
- **Risk mitigation:** When status = Mitigated, enter mitigation score (1–25) which subtracts from raw score to give residual risk rating
- **Risk history:** Full audit log of status changes, score changes, and comments — same pattern as task comments
- **File classification:** Synchronous on upload — classify immediately in the upload request, metadata returned with the response
- **AI file lookup:** User references files inline with `/filename` syntax in chat. The API detects these references, fetches the matching blob, injects full text into context for that message.

---

## Open questions
- None — all confirmed, ready to build.

---

## Data model changes

### DM-4 — Task model
**File:** `app/src/types/index.ts`, `app/src/utils/defaultData.ts`
**Change:** Add `Task` interface and `tasks: Task[]` to `AppData`.
```
Task {
  id, title, description
  sowId: string | null          — null = program-level
  bucket: 'today' | 'this-week' | 'this-month' | 'backlog'
  priority: 'low' | 'medium' | 'high'
  effort: { value: number; unit: 'hours' | 'days' | 'weeks' }
  recurrence: null | { type: 'daily' | 'weekly' | 'monthly'; interval: number }
  links: { id, label, url }[]
  comments: { id, text, timestamp }[]
  completedAt?: string
  createdAt: string
  order: number                 — for drag ordering within bucket
}
```
**Status:** [x]

### DM-5 — RAID model
**File:** `app/src/types/index.ts`, `app/src/utils/defaultData.ts`
**Change:** Add `Risk`, `Issue`, `Decision` interfaces and arrays to `AppData`.
```
Risk {
  id, sowId: string | null, title, description
  likelihood: 1–5    — 1=Rare … 5=Almost Certain
  impact: 1–5        — 1=Negligible … 5=Critical
  score: number      — likelihood × impact (computed, max 25)
  status: 'Open' | 'Mitigated' | 'Closed'
  mitigation?: string
  mitigationScore?: number      — 1–25, subtracted from score for residual rating
  residualScore?: number        — score − mitigationScore (computed)
  owner: string
  history: { id, timestamp, type: 'comment'|'status_change'|'score_change', text }[]
  promotedToIssueId?: string
  createdAt: string
}

Issue {
  id, sowId: string | null, title, description
  impact: 'Low' | 'Medium' | 'High' | 'Critical'
  status: 'Open' | 'In Progress' | 'Resolved'
  owner: string
  raisedFromRiskId?: string     — set if promoted from a Risk
  createdAt: string
}

Decision {
  id, sowId: string | null, title, description
  rationale: string
  decidedBy: string
  date: string
}
```
**Status:** [x]

### DM-6 — File metadata model
**File:** `app/src/types/index.ts`, `app/src/utils/defaultData.ts`
**Change:** Add `ProjectFile` interface and `projectFiles: ProjectFile[]` to `AppData`.
```
ProjectFile {
  id, name (original filename), storageName (blob key)
  sowId: string | null          — AI-classified
  folder: string                — AI-classified folder path e.g. 'Purview/Meeting Notes'
  size: number, uploadedAt: string
  classifiedAt?: string
  mimeType: string
  description?: string          — AI-generated one-line summary
  classificationStatus: 'pending' | 'classified' | 'failed'
}
```
**Note:** File binary content stored in `pmtracking-files` blob container. `projectFiles` metadata array lives in `appdata.json` as usual.
**Status:** [x]

---

## API additions

### AI-1 — Foundry provider
**Files:** `api/src/_lib/providers/foundry.ts`, `api/src/_lib/providers/index.ts`
**Change:** Implement the Foundry Responses API as an isolated provider module.
- Endpoint: `${FOUNDRY_ENDPOINT}/openai/responses?api-version=${FOUNDRY_API_VERSION}`
- Auth: `api-key` header (not Bearer)
- Body: `input` array (not `messages`), `max_output_tokens` (not `max_tokens`)
- Streaming events: `response.output_text.delta` (text chunk) and `response.completed` (done)
- Env vars: `FOUNDRY_ENDPOINT`, `FOUNDRY_KEY`, `FOUNDRY_DEPLOYMENT`, `FOUNDRY_API_VERSION` (default `2025-04-01-preview`)
- Export `AIProvider` interface with `stream()` and `complete()` methods
**Status:** [x]

### AI-2 — File storage API
**File:** `api/src/functions/files.ts`
**Change:** Three endpoints for file management.
- `GET /api/files` — list all blobs in `pmtracking-files` container, return metadata array
- `POST /api/files` — receive multipart upload, store binary in `pmtracking-files`, trigger classification call to Foundry, update `projectFiles` in `appdata.json`
- `DELETE /api/files/:name` — delete blob from `pmtracking-files`, remove from `projectFiles` in `appdata.json`
**Status:** [x]

### AI-3 — AI chat proxy
**File:** `api/src/functions/ai.ts`
**Change:** Streaming endpoint for the assistant chat.
- `POST /api/ai` — receives `{ messages: {role, content}[], selectedFileNames?: string[] }`
- Assembles system prompt: full `appdata.json` context (SOWs, phases, budget, resources, allocations, tasks, risks, milestones) + `projectFiles` metadata (names, folders, descriptions)
- If `selectedFileNames` provided: fetches those blobs from `pmtracking-files`, injects full text into context
- Streams response back using Foundry streaming events
**Status:** [x]

---

## App views

### TK-1 — Tasks view
**File:** `app/src/views/Tasks.tsx`
**Change:** Full task management interface.

**Layout:**
- Top bar: filter by SOW, filter by priority, filter by effort, hide completed toggle
- Rows: one collapsible row per project (Program + each SOW) — collapsed by default
- Columns: Today / This Week / This Month / Backlog — fixed four-column grid within each row

**Cards:**
- Show: title, priority colour dot, effort badge (e.g. "2h", "1d"), recurrence icon if set
- Hover: subtle lift shadow, slight scale
- Drag: card tilts ~3°, drop shadow deepens, cursor = grabbing
- On drop into different bucket: `bucket` field auto-updates
- On drop into different project row: `sowId` auto-updates
- On drop into same position: no-op

**Detail panel (slide-out from right, not a modal):**
- Editable title and description
- Effort selector (number + unit toggle: hours / days / weeks)
- Priority selector (low / medium / high)
- Recurrence selector (none / daily / weekly / monthly + interval)
- Links section (add URL + label, renders as clickable chips)
- Comments section (append-only, timestamped)
- Complete / Reopen button

**Depends on:** DM-4
**Status:** [x]

### TK-2 — Recurrence engine
**File:** `app/src/utils/taskUtils.ts` (new file)
**Change:** `completeTask(task, data)` — marks task complete, and if `task.recurrence` is set, generates a new task with the same fields (except id, completedAt, createdAt, order) placed into the same bucket.
**Depends on:** DM-4
**Status:** [x]

### RD-1 — RAID view
**File:** `app/src/views/RAID.tsx`
**Change:** Three-tab view for Risks, Issues, and Decisions.

**Risks tab:**
- Interactive 5×5 heat map at top — 25 cells colour-graded: 1–4 green, 5–9 yellow, 10–14 amber, 15–19 orange, 20–25 red
- Clicking a cell filters the table to risks at that likelihood/impact intersection
- Risk table: filterable by SOW, status, score
- Each row: title, SOW, likelihood × impact = score (shown as e.g. "4×3=12"), residual score if mitigated, owner, status badge
- Add/edit risk → modal with:
  - Clickable 5×5 matrix as the likelihood/impact selector (visual, not dropdowns)
  - When status = Mitigated: mitigation text field + mitigation score selector (same 5×5 matrix, labelled "How much does the mitigation reduce the risk?")
  - History/audit log at the bottom of the modal (status changes, score changes, comments — append-only with timestamps)
  - "Promote to Issue" button — creates a linked Issue, sets `promotedToIssueId`, marks risk as Mitigated

**Issues tab:**
- Filterable table by SOW, status, impact
- Impact colour-coded: Low=green, Medium=amber, High=orange, Critical=red
- Inline status updates
- If raised from a risk, shows a linked risk chip

**Decisions tab:**
- Chronological list, filterable by SOW
- Each decision: title, rationale, decided by, date
- Add/edit via modal

**Depends on:** DM-5
**Status:** [x]

### AS-1 — Assistant view
**File:** `app/src/views/Assistant.tsx`
**Change:** AI project assistant with file library and chat.

**Layout:** Two-column — file library left (280px), chat right

**File library (left):**
- Drag-to-upload zone at the top
- File list: name, folder (AI-classified), SOW chip, size, classification status
- Each file has a checkbox — checked files are included as full-text context in the next message
- Classification status indicator: pending spinner → classified tick → failed warning
- Delete button per file

**Chat (right):**
- Suggested prompts on empty state: "What do I need to do this week?", "What's at risk on Purview?", "Summarise the program status", "What's the forecast vs budget on Automation Champion?", "What's missing from the scope?"
- Message input at the bottom
- Streaming response — text appears as it arrives
- Messages styled: user right-aligned, assistant left-aligned with a subtle avatar
- Session-only — refreshing the page starts a fresh conversation
- The system prompt always includes: all SOW/phase/budget/resource/task/risk/milestone data from `appdata.json`, plus `projectFiles` metadata (names, folders, one-line descriptions)
- Checked files from the library have their full text appended to the next user message

**Depends on:** DM-6, AI-1, AI-2, AI-3
**Status:** [x]

---

## Navigation update

### NV-1 — Add three new nav items
**File:** `app/src/App.tsx`
**Change:** Add Tasks, RAID, and Assistant to the sidebar nav array.
```
{ to: '/tasks',     label: 'Tasks',     icon: CheckSquare }
{ to: '/raid',      label: 'RAID Log',  icon: ShieldAlert }
{ to: '/assistant', label: 'Assistant', icon: Bot }
```
Add corresponding routes pointing to the new view components.
**Depends on:** TK-1, RD-1, AS-1
**Status:** [x]

---

## Execution order

```
DM-4   Task model                    types/index.ts + defaultData.ts
DM-5   RAID model                    types/index.ts + defaultData.ts
DM-6   File metadata model           types/index.ts + defaultData.ts
AI-1   Foundry provider              api/src/_lib/providers/
AI-2   File storage API              api/src/functions/files.ts
AI-3   AI chat proxy                 api/src/functions/ai.ts
TK-2   Recurrence engine             app/src/utils/taskUtils.ts
TK-1   Tasks view                    app/src/views/Tasks.tsx
RD-1   RAID view                     app/src/views/RAID.tsx
AS-1   Assistant view                app/src/views/Assistant.tsx
NV-1   Navigation                    app/src/App.tsx
```

**Total: 11 items across 8 files + 3 new API functions + 1 new blob container**

---

## Azure setup required before AS-1
- New blob container: `pmtracking-files` in the existing storage account
- New SWA Application Settings:
  - `FOUNDRY_ENDPOINT` — Azure AI Foundry endpoint URL
  - `FOUNDRY_KEY` — API key
  - `FOUNDRY_DEPLOYMENT` — deployment name (e.g. `gpt-5.4-mini`)
  - `FOUNDRY_API_VERSION` — default `2025-04-01-preview`
