# PM Tracker — Feature Issues
## Activity Monitoring & Enhanced Planning

**Legend:** `[ ]` Not Started · `[~]` In Progress · `[x]` Complete · `[!]` Blocked

---

## Phase 1 — Phase Exit Criteria

### Issue 1 · Phase exit criteria — types & data model
**System:** PMTracking · **Status:** `[x]`
**Depends on:** nothing

Add `PhaseCriterion` interface and `criteria` field to `Phase` — the type foundation all other Phase 1 issues build on.

**Files to change:**
- `app/src/types/index.ts` — add `PhaseCriterion`, extend `Phase`

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in `/app`
- [ ] Existing app loads with no console errors (backward compat — phases without `criteria` field load as `[]`)
- [ ] `AppContext.data.sows[0].phases[0].criteria` is `undefined` or `[]`, not throwing

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 2 · Phase exit criteria — Settings UI
**System:** PMTracking · **Status:** `[x]`
**Depends on:** #1

Edit and tick off exit criteria per phase, inline in the existing Settings SOW section.

**Files to change:**
- `app/src/views/Settings.tsx` — criteria editor per phase

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Settings → SOW → phase section shows criterion input + Add button
- [ ] Adding a criterion appends it to the list
- [ ] Checkbox marks `done`; unchecking reverts — both persist after refresh
- [ ] Editing criterion text inline persists after refresh
- [ ] Deleting one criterion does not affect others
- [ ] Criteria on two different phases of the same SOW are independent

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 3 · Phase exit criteria — Dashboard surface
**System:** PMTracking · **Status:** `[x]`
**Depends on:** #1, #2

Show current-phase exit criteria directly on the Dashboard per-SOW panel (read + write).

**Files to change:**
- `app/src/views/Dashboard.tsx` — criteria list in phase panel

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Criteria added in Settings appear on Dashboard for that SOW
- [ ] Progress count is correct (e.g. `1 / 3 complete`)
- [ ] Ticking a criterion on Dashboard persists after refresh
- [ ] SOW with no criteria for current phase → no criteria section shown (no empty box)

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 4 · Phase exit criteria — AI system prompt
**System:** PMTracking (API) · **Status:** `[x]`
**Depends on:** #1, #2

Inject phase exit criteria into the AI system prompt so it can prioritise work and answer "what should I focus on today".

**Files to change:**
- `api/src/functions/ai.ts` — extend `buildSystemPrompt` phase lines

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in `/api`
- [ ] Ask "What are the outstanding exit criteria for [SOW]?" → AI names unticked criteria correctly
- [ ] Ask "What should I focus on today for [SOW]?" → AI references outstanding criteria and open tasks
- [ ] SOW with no criteria → AI response makes no mention of criteria (no empty bracket noise in output)

**Notes:**
> _Add implementation notes here as work progresses_

---

## Phase 2 — Saved Chat Threads

### Issue 5 · Saved chat threads — types & storage
**System:** PMTracking · **Status:** `[x]`
**Depends on:** nothing (parallel to Phase 1)

Add `ChatMessage`, `ChatThread`, `ThreadType` interfaces and `threads: ChatThread[]` to `AppData`.

**Files to change:**
- `app/src/types/index.ts` — add thread types
- `app/src/utils/defaultData.ts` — add `threads: []`
- `app/src/utils/storage.ts` — add `threads` to merge

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] App loads with existing blob data (no `threads` field) → no error, `data.threads` is `[]`
- [ ] `AppContext.data.threads` is an array in DevTools

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 6 · Saved chat threads — Assistant sidebar & thread list
**System:** PMTracking · **Status:** `[x]`
**Depends on:** #5

Refactor Assistant to add a left sidebar with thread list, grouped by day, with New Thread button.

**Files to change:**
- `app/src/views/Assistant.tsx` — major refactor, add sidebar

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Sidebar visible with "New Thread" button on first load
- [ ] Click "New Thread" → empty thread created, active, chat clears
- [ ] Send a message → thread appears in sidebar with truncated title
- [ ] Navigate away and back → thread list still populated
- [ ] Click between two threads → messages switch correctly, no cross-contamination
- [ ] Pin a thread → floats above unpinned threads of the same day
- [ ] File repository still accessible (moved to toggle or right panel)

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 7 · Saved chat threads — chat saves to active thread
**System:** PMTracking · **Status:** `[ ]`
**Depends on:** #5, #6

Every sent/received message is appended to the active thread and persisted immediately via `setData`.

**Files to change:**
- `app/src/views/Assistant.tsx` — `sendMessage` writes to thread

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Send a message → hard-refresh → message still present in thread
- [ ] Two threads maintain independent histories
- [ ] AI receives thread message history as context (can reference earlier messages in same thread)
- [ ] No active thread → send auto-creates one, appears in sidebar

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 8 · Saved chat threads — auto-title
**System:** PMTracking · **Status:** `[ ]`
**Depends on:** #5, #6, #7

Thread title derived from first user message via a silent AI one-shot call.

**Files to change:**
- `app/src/views/Assistant.tsx` — fire-and-forget title call after first message

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] First message sent → sidebar title updates within a few seconds (e.g. "Purview risk review")
- [ ] Title update does not disrupt active conversation
- [ ] Short/ambiguous first message → falls back to truncated message text, not blank or "undefined"
- [ ] Title persists after refresh
- [ ] Check-in threads (`type: 'checkin'`) are titled by daemon — no AI call fires for these

**Notes:**
> _Add implementation notes here as work progresses_

---

## Phase 3 — Activity API

### Issue 9 · Activity API — types & daemon authentication
**System:** PMTracking (API) · **Status:** `[ ]`
**Depends on:** nothing (parallel to Phases 1 and 2)

Define `ActivityEntry` / `ActivityBatch` types and `DAEMON_API_KEY` pre-shared key auth.

**Files to change:**
- `api/src/types/activity.ts` (new) — interfaces
- `api/src/functions/activity.ts` (new stub) — `validateDaemonKey` helper
- `api/local.settings.json` — add `DAEMON_API_KEY`
- `docs/MEMORY.md` — document required Azure App Setting

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in `/api`
- [ ] `curl -X POST .../api/activity -H "X-Daemon-Key: wrong"` → HTTP 401
- [ ] `curl -X POST .../api/activity -H "X-Daemon-Key: [correct]"` → not 401 (may be 400 for missing body)

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 10 · Activity API — POST /api/activity
**System:** PMTracking (API) · **Status:** `[ ]`
**Depends on:** #9

Append incoming `ActivityBatch` to daily blob `activity-log/YYYY-MM-DD.json`.

**Files to change:**
- `api/src/functions/activity.ts` — `POST /api/activity` handler
- `api/src/index.ts` — register function

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in `/api`
- [ ] POST valid batch with correct key → HTTP 200, returns `{ ok: true, count: N }`
- [ ] POST second batch same day → both entries present in blob (append, not overwrite)
- [ ] Azurite shows `activity-log/YYYY-MM-DD.json` as valid JSON array
- [ ] POST with wrong key → HTTP 401, nothing written to blob

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 11 · Activity API — GET /api/activity + AI system prompt
**System:** PMTracking (API) · **Status:** `[ ]`
**Depends on:** #9, #10

Return today's activity log via GET and inject it into the AI system prompt.

**Files to change:**
- `api/src/functions/activity.ts` — `GET /api/activity` handler
- `api/src/functions/ai.ts` — read today's log into `buildSystemPrompt`

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in `/api`
- [ ] POST batches then ask "What have I been working on today?" → AI references the activity entries
- [ ] `GET /api/activity` (no param) → today's log as JSON array
- [ ] `GET /api/activity?date=YYYY-MM-DD` → that date's log (or `[]`)
- [ ] No activity logged today → AI works normally, no error, no mention of missing data
- [ ] Activity log with audio transcript → AI can reference transcript when asked

**Notes:**
> _Add implementation notes here as work progresses_

---

## Phase 4 — Python Daemon (Core)

### Issue 12 · Python daemon — project setup & config
**System:** Python Daemon · **Status:** `[ ]`
**Depends on:** nothing

Project scaffold: `pyproject.toml`, `config.toml` (gitignored), `config.example.toml`, main loop.

**Files to create:**
- `activity-daemon/pyproject.toml`
- `activity-daemon/config.example.toml`
- `activity-daemon/daemon.py`
- `activity-daemon/README.md`
- `activity-daemon/.gitignore`

**Test criteria:**
- [ ] `pip install -e .` (or `uv sync`) succeeds on clean Python 3.11+
- [ ] `python daemon.py` with valid `config.toml` starts and logs "Daemon started"
- [ ] Missing `config.toml` → clear error message, not a traceback
- [ ] `config.toml` with bad `api_url` → warns on startup, does not crash

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 13 · Python daemon — app/window focus tracker
**System:** Python Daemon · **Status:** `[ ]`
**Depends on:** #12

Poll foreground window every 30s, aggregate consecutive identical windows into timed entries.

**Files to create/change:**
- `activity-daemon/capture/apps.py`
- `activity-daemon/daemon.py` — start app tracking loop

**Test criteria:**
- [ ] `python -c "from capture.apps import get_active_window; print(get_active_window())"` → returns `{ appName, windowTitle, timestamp }`
- [ ] Run 2 min, switch apps → stdout shows entries for both apps with non-zero durations
- [ ] Lock screen and unlock → lock entries excluded from batch
- [ ] Stay on same window 5 min → one entry with `durationSeconds ≈ 300`, not five 60s entries
- [ ] Rapid app switching → sensible aggregated entries, no 1-second noise

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 14 · Python daemon — activity batcher & uploader
**System:** Python Daemon · **Status:** `[ ]`
**Depends on:** #9, #10, #12, #13

Collect entries from all streams, POST to `/api/activity` every 15 min. Retry queue for failures.

**Files to create/change:**
- `activity-daemon/uploader.py`
- `activity-daemon/daemon.py` — schedule flush

**Test criteria:**
- [ ] After 15 min with API running → `GET /api/activity` shows entries in today's log
- [ ] API down during flush → `pending-batches.jsonl` grows; API restart → queue drains on next flush
- [ ] Wrong daemon key → 401 logged, batch queued, no crash
- [ ] Long run → no memory growth; batches older than 24h pruned from pending queue

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 15 · Hourly check-in card — PM Tracker side
**System:** PMTracking · **Status:** `[ ]`
**Depends on:** #7, #8, #9, #11

New `/api/checkin` endpoint: reads activity + project state, calls AI, saves result as a `checkin` thread. Assistant renders check-in threads with distinct styling and action buttons.

**Files to change:**
- `api/src/functions/checkin.ts` (new)
- `api/src/index.ts` — register
- `app/src/views/Assistant.tsx` — check-in thread rendering

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in both `/app` and `/api`
- [ ] `POST /api/checkin -H "X-Daemon-Key: ..."` → returns `{ threadId }`
- [ ] After POST → `📋` check-in thread appears in sidebar with correct timestamp title
- [ ] Check-in message references today's activity and relevant SOWs/phases
- [ ] User can type follow-up messages within a check-in thread
- [ ] Two check-ins same day → two separate threads, both preserved

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 16 · Python daemon — hourly check-in trigger & Windows notification
**System:** Python Daemon · **Status:** `[ ]`
**Depends on:** #14, #15

Schedule `POST /api/checkin` every hour. Fire a Windows toast notification on success linking to the Assistant tab.

**Files to change:**
- `activity-daemon/daemon.py` — hourly scheduler + notification

**Test criteria:**
- [ ] Set interval to 2 min for testing → toast notification appears at interval
- [ ] Click notification → browser opens/focuses on Assistant tab
- [ ] API down at check-in time → error logged, no notification, no crash, retries next interval
- [ ] Run 3 hours → exactly 3 check-in threads in Assistant (no duplicates, no gaps)

**Notes:**
> _Add implementation notes here as work progresses_

---

## Phase 5 — Audio

### Issue 17 · Python daemon — audio capture with VAD + Whisper
**System:** Python Daemon · **Status:** `[ ]`
**Depends on:** #13, #14

Mic → silero-vad filter → Whisper small → transcript chunks added to activity batch.

**Files to create/change:**
- `activity-daemon/capture/audio.py`
- `activity-daemon/pyproject.toml` — add `sounddevice`, `torch`, `openai-whisper`

**Test criteria:**
- [ ] Speaking clearly → transcript appears in next uploaded batch
- [ ] Music playing through speakers for 5 min → no `audio_transcript` entries in batch (VAD filtered)
- [ ] After upload, ask Assistant "What did I discuss today?" → AI references transcript content
- [ ] No microphone connected → warning logged, audio disabled, app tracking continues normally

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 18 · Python daemon — screen capture & AI visual tagging
**System:** Python Daemon · **Status:** `[ ]`
**Depends on:** #13, #14

Screenshot every 10 min → AI describes what's on screen → text description stored in batch (no raw image stored).

**Files to create/change:**
- `activity-daemon/capture/screen.py`
- `activity-daemon/pyproject.toml` — add `mss`, `Pillow`

**Test criteria:**
- [ ] `python -c "from capture.screen import capture_screen; open('test.jpg','wb').write(capture_screen())"` → legible screenshot at reduced resolution
- [ ] With VS Code open → AI description contains "code editor" or similar
- [ ] Activity batch contains `screen_context` text entries, no base64 image data
- [ ] Screen locked at capture time → no entry, no error
- [ ] AI vision call fails → warning logged, entry skipped, daemon continues

**Notes:**
> _Add implementation notes here as work progresses_

---

## Phase 6 — Timesheet Generator

### Issue 19 · Timesheet generator — weekly activity rollup
**System:** PMTracking (API) · **Status:** `[ ]`
**Depends on:** #9, #10, #11

`POST /api/timesheet/generate` reads Mon–Fri activity logs, uses AI to map to SOW project codes, saves draft to blob.

**Files to change:**
- `api/src/functions/timesheet.ts` (new)
- `api/src/index.ts` — register

**Test criteria:**
- [ ] `npx tsc --noEmit` passes in `/api`
- [ ] POST with `weekStart` and activity logs present → JSON array of line items returned
- [ ] Line items reference actual SOW shortNames and project codes (not hallucinated)
- [ ] Day with no activity log → no entries for that day, no error
- [ ] Second call for same week → overwrites draft (idempotent)

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 20 · Timesheet generator — review UI
**System:** PMTracking · **Status:** `[ ]`
**Depends on:** #5, #19

Editable draft table in Timesheets view. Week picker, Generate button, editable rows.

**Files to change:**
- `app/src/views/Timesheets.tsx` — "Generate from Activity" panel

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Panel visible (collapsed) in Timesheets view
- [ ] Select week, click Generate → spinner then populated table
- [ ] Hours, SOW, Notes cells editable
- [ ] Regenerate prompts confirmation (edited values would be lost)
- [ ] Week with no activity → "No activity recorded" message, not blank/broken table

**Notes:**
> _Add implementation notes here as work progresses_

---

### Issue 21 · Timesheet generator — CSV export
**System:** PMTracking · **Status:** `[ ]`
**Depends on:** #19, #20

Export reviewed draft as ConnectWise-format CSV that can be re-imported via the existing Timesheets import flow.

**Files to change:**
- `app/src/views/Timesheets.tsx` — Export button + CSV generation

**Test criteria:**
- [ ] `npx tsc --noEmit` passes
- [ ] Click Export → `.csv` file downloads named `timesheet-{weekStart}.csv`
- [ ] CSV columns match ConnectWise format; dates in `DD/MM/YYYY H:MM`; no blank required fields
- [ ] Import the exported CSV via existing Timesheets import → entries parse without errors
- [ ] Export with 0 rows → downloads header-only CSV, no error

**Notes:**
> _Add implementation notes here as work progresses_

---

## Dependency Map

```
#1 ──► #2 ──► #3
  └──► #4
#5 ──► #6 ──► #7 ──► #8
               └──────────────► #15 ──► #16
#9 ──► #10 ──► #11 ──────────► #15
  └──────────────────► #14 ──► #16
#12 ──► #13 ──► #14
#11 ──► #19 ──► #20 ──► #21
```
