# PM Tracker — Feature Context & Design Record
## Activity Monitoring, Saved Threads, Phase Criteria & Timesheet Generation

This file tracks design decisions, cross-issue impacts, codebase patterns, and learnings as issues are worked through. **Update this file whenever a decision is made that affects another issue.** Cross-reference the affected issue numbers so `issues.md` can be updated in parallel.

---

## 1. Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Local Python Daemon  (activity-daemon/)                     │
│                                                              │
│  capture/apps.py    → app/window focus every 30s            │
│  capture/audio.py   → mic → silero-vad → Whisper chunks     │
│  capture/screen.py  → screenshot every 10 min → AI text tag │
│                                                              │
│  uploader.py        → batches entries, POST every 15 min    │
│  daemon.py          → scheduler, hourly check-in trigger    │
└────────────────────────┬────────────────────────────────────┘
                         │  X-Daemon-Key header
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Azure Functions  (api/)                                     │
│                                                              │
│  POST /api/activity  → appends to activity-log/YYYY-MM-DD   │
│  GET  /api/activity  → returns daily log                    │
│  POST /api/checkin   → AI summary → saves as ChatThread     │
│  POST /api/timesheet/generate → weekly rollup + AI mapping  │
│                                                              │
│  /api/ai  ← reads today's activity log into system prompt   │
└────────────────────────┬────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────────┐
│  Azure Blob Storage  (saintoworkpmtrack)                     │
│                                                              │
│  pmtracking/appdata.json          ← SOWs, tasks, threads…  │
│  pmtracking/activity-log/YYYY-MM-DD.json  ← daily batches  │
│  pmtracking/timesheet-drafts/{weekStart}.json               │
│  pmtracking-files/*               ← uploaded documents      │
└─────────────────────────────────────────────────────────────┘
```

**Key principle:** `appdata.json` stays as the single source of truth for user-facing project state (SOWs, tasks, risks, threads, etc.). Activity logs and timesheet drafts live as separate daily blobs to avoid bloating the main document.

---

## 2. Design Decisions

### D1 — Phase criteria are optional on the `Phase` interface
**Rationale:** Existing blobs don't have a `criteria` field. Making it `criteria?: PhaseCriterion[]` means existing data loads without migration. All consumers use `phase.criteria ?? []`.
**Affects:** #1, #2, #3, #4
**Pattern to follow:** Same approach used for `pricingType` on SOW (optional for backward compat).

---

### D2 — Chat threads stored in `appdata.json`, not separate blobs
**Rationale:** Simple — uses the existing save/load mechanism. Text messages are small (~500 bytes each). 90 days × 8 check-ins/day × 2KB = ~1.4MB worst case, well within blob limits.
**Risk:** If threads grow very large (many months, long transcripts), consider archiving threads older than 90 days to a separate blob. Add a note to `issues.md #5` if this becomes relevant.
**Affects:** #5, #7, #8, #15
**Watch for:** The `setData` call after every message triggers a full blob write. If streaming responses are very long, defer the final save to after the stream completes (not after each SSE delta).

---

### D3 — Thread history: only the active thread is sent to `/api/ai`
**Rationale:** Sending all threads would flood the context and mix unrelated conversations. The AI gets the active thread's messages as its history, plus the full system prompt (project state + today's activity).
**Affects:** #7, #15
**Implementation note:** In the `/api/ai` POST body, `messages` array = `[...activeThread.messages.map(...), { role: 'user', content: currentInput }]`.

---

### D4 — Auto-title is a fire-and-forget AI call, not blocking
**Rationale:** Titling should not delay the user's first message being sent. The call is made async after the first user message is sent. If it fails, fall back to first 40 chars of the message.
**Affects:** #8
**Implementation note:** Use a non-streaming call to `/api/ai` with `messages: [{ role: 'user', content: 'Give a 4-6 word thread title (no punctuation) for this message: [text]' }]`. Update `thread.title` when resolved.

---

### D5 — Check-in threads are created server-side by `/api/checkin`, not client-side
**Rationale:** The daemon triggers the check-in; the PM Tracker app may not be open. Creating the thread server-side means it appears in the sidebar whenever the user next opens the app, even if they weren't looking when it fired.
**Affects:** #15, #16
**Implementation note:** `/api/checkin` reads appdata.json, constructs the `ChatThread`, appends to `data.threads`, writes back. Returns `{ threadId }` so the daemon can optionally link to it in the notification.

---

### D6 — Daemon API key: `X-Daemon-Key` header, `DAEMON_API_KEY` env var
**Rationale:** SWA Easy Auth (GitHub OAuth) works for browsers but not for the Python daemon. A pre-shared key is the simplest secure approach for a single-user internal tool.
**Affects:** #9, #10, #11, #14, #15, #16, #19
**Security note:** `DAEMON_API_KEY` must be added to Azure App Settings (not just `local.settings.json`). Never commit the actual key — `config.example.toml` in the daemon repo uses `"your-key-here"`.

---

### D7 — Activity logs are daily append-only blobs, not rows in appdata.json
**Rationale:** Activity data is high-volume (entries every 30s over a full working day). Appending to a dedicated daily blob avoids making appdata.json writes compete with activity writes, and keeps the main document lean.
**Affects:** #10, #11, #19
**Blob path:** `pmtracking/activity-log/YYYY-MM-DD.json` (array of `ActivityBatch` objects).
**Note:** The `pmtracking` container already exists. No new container needed.

---

### D8 — Screen captures: AI text description only, never raw images stored
**Rationale:** Raw screenshots could contain sensitive client data, credentials, or personal information. Only the AI's text description (`"User is in a Teams call, presentation visible"`) is stored in the activity batch. Images are sent directly to `/api/ai` vision endpoint and discarded.
**Affects:** #18
**Privacy benefit:** Activity log blobs contain no visual data — only structured text.

---

### D9 — Audio: silero-vad pre-filter → Whisper small → `no_speech_prob` post-filter
**Rationale:** Three-layer defence against music/noise transcription:
1. silero-vad (fast, runs on CPU) discards chunks with speech probability < 0.6
2. Whisper called with biasing prompt `"Business meeting notes about project management."` to reduce music-lyric transcription
3. Whisper's `no_speech_prob > 0.7` on returned segments → discard
Music with singing is the hard case — VAD will sometimes pass it. The Whisper prompt bias and `no_speech_prob` filter handle the residual.
**Affects:** #17
**Model choice:** `whisper-small` (244M params) — fast enough on CPU for 30s chunks, ~1-2s processing per chunk. Upgrade to `medium` if accuracy is insufficient after testing.

---

### D10 — Timesheet draft saved to blob, not appdata.json
**Rationale:** Timesheet drafts are ephemeral working documents, not part of the canonical project state. Saving to `timesheet-drafts/{weekStart}.json` keeps them isolated and easy to delete without affecting project data.
**Affects:** #19, #20
**Note:** The review UI (Issue 20) loads from this blob. On "Confirm & Export", the draft can be deleted.

---

### D11 — RAID filter defaults to `'active'` (hides Closed/Resolved)
**Decision made:** Already implemented in current codebase (commit `b3d4163`).
**'active' means:** Risks where `status !== 'Closed'`; Issues where `status !== 'Resolved'`.
**Affects:** Any future RAID-related changes — the default assumption is that closed/resolved items are hidden.

---

### D12 — Issue history follows the same pattern as Risk history
**Decision made:** Already implemented in current codebase (commit `b3d4163`).
`Issue.history: RaidHistoryEntry[]` — same type as `Risk.history`. Status changes logged automatically via `setStatus()` in the modal. Comments added manually.
**Affects:** Any future work on issues — history is always available as `issue.history ?? []`.

---

## 3. Codebase Patterns to Follow

### Data persistence
- `setData(d)` → updates React state AND saves to blob immediately. Use for user edits.
- `updateData(d)` → updates React state ONLY. Use for drag previews and live interactions to avoid flooding blob with partial states.
- `data.reports ?? []`, `data.threads ?? []` etc. — always use `?? []` fallback when reading new optional array fields.

### Azure Functions
- Register every new function in `api/src/index.ts`.
- All functions share the same `getStorageClient()` → `BlobServiceClient` pattern.
- `readBlob(svc, container, name)` returns `string | null` — null means blob doesn't exist (graceful).
- Streaming AI responses use SSE: `data: {...}\n\n` lines, `data: [DONE]\n\n` to close.

### AI system prompt
- Built in `api/src/functions/ai.ts` → `buildSystemPrompt(appData)`.
- Each section is a clearly labelled `==SECTION==` block.
- New sections should be appended without disrupting existing ones — the prompt is additive.
- Keep each entry concise (one line per item where possible) — the prompt is already large.

### Action cards
- AI can create items via fenced code blocks: `` ```action:create_task {...}``` ``
- Types available: `create_task`, `create_risk`, `create_issue`, `create_decision`, `refile_file`
- Frontend parses these in `Assistant.tsx` → renders `ActionCard` → calls `POST /api/write` on confirm.
- Any new writeable action type must be added to both the system prompt (instruction) and `api/src/functions/write.ts` (handler).

### TypeScript in `/api`
- Run `npx tsc --noEmit` from `/api` — separate `tsconfig.json` from the frontend.
- Types shared between frontend and API should be duplicated (not imported across boundaries) — they're deployed independently.

### UI style
- All views use CSS variables (`var(--text-1)`, `var(--border)`, etc.) — no hardcoded colours except in SVG.
- Inline styles throughout (no Tailwind classes in JSX) — consistent with existing views.
- `className="no-print"` hides from PDF export. `className="print-only"` shows only in print.

---

## 4. Cross-Issue Impact Log

Update this table whenever a decision in one issue affects another.

| Decision | Source Issue | Impacted Issues | Impact |
|---|---|---|---|
| `criteria?: PhaseCriterion[]` optional | #1 | #2, #3, #4 | Always use `phase.criteria ?? []` |
| Threads in `appdata.json` | #5 | #7, #8, #15 | `setData` on every message; watch blob write frequency |
| Active thread only sent to AI | #5, #7 | #15 | Check-in threads should still send their thread history |
| Auto-title is fire-and-forget | #8 | #15 | Check-in threads set title in the daemon/API, not via auto-title |
| Server-side thread creation | #15 | #6 | Sidebar must handle threads created externally (poll or rely on refresh) |
| `DAEMON_API_KEY` env var | #9 | #10, #11, #14, #15, #16, #19 | Must be set in Azure App Settings before deploying daemon-dependent features |
| Daily blobs for activity | #10 | #11, #15, #19 | All readers use `activity-log/YYYY-MM-DD.json` path format |
| No raw images stored | #18 | #10, #11 | `screen_context` entries are text strings, not base64 |
| Timesheet draft in separate blob | #19 | #20, #21 | Draft not in `appdata.json`; load separately in UI |

---

## 5. Open Questions & Risks

### OQ1 — Thread storage growth
At high check-in frequency (8/day) with detailed transcripts, `appdata.json` may grow significantly over months. **Decision deferred:** implement a rolling 60-day prune of check-in threads in a future issue if blob size becomes a problem. Monitor after Issue 15 is live.

### OQ2 — silero-vad false positives for singing
The user sings along to music while working — VAD may classify some singing as speech. The Whisper prompt bias and `no_speech_prob` filter are the second/third defence. **Decision:** accept some lyric transcription as an acceptable false positive rate. The AI will discard nonsensical transcript content when generating check-in summaries.

### OQ3 — Daemon auth for browser-callable endpoints
`GET /api/activity` should also be callable from the browser (for the Timesheets UI). The `validateDaemonKey` helper should be optional — if no `X-Daemon-Key` header is present, fall back to checking SWA Easy Auth (the existing browser auth mechanism). Clarify this in Issue 11.

### OQ4 — Check-in threads visible in sidebar before user opens the app
If the user has the app open in a browser tab while a check-in fires, the new thread won't appear until they refresh. **Option:** poll `/api/checkin/latest` every 5 minutes and append new threads to `data.threads` in-memory (without overwriting full state). **Decision deferred** until Issue 15 is complete and the user can evaluate whether auto-refresh is needed.

### OQ5 — Python daemon distribution
The daemon needs to run on startup. On Windows 11 this can be done via Task Scheduler or a startup script. **Decision deferred** to Issue 12 README — document both options, don't auto-install.

### OQ6 — Which resource record maps to the daemon user for timesheet export
The timesheet CSV needs a `Member` initials field. The daemon doesn't know who is running it. **Proposed:** add `daemonMemberInitials` to `config.toml` (e.g. `"CDensley"`), matched against `data.resources` for rate/role lookup. Raise in Issue 19 before implementing.

---

## 6. Learnings Log

_Add entries here as issues are completed. Note anything surprising, any pattern that should be reused, or any gotcha that would catch future work._

| Date | Issue | Learning |
|---|---|---|
| 2026-05-11 | #1 | `criteria?: PhaseCriterion[]` optional field — no defaultData change needed. All consumers must use `phase.criteria ?? []`. Pattern mirrors `pricingType?` on SOW. |
| 2026-05-11 | #2 | `PhaseCriteriaEditor` is a self-contained component with local `input` state for the add field. Text editing uses `defaultValue` + `onBlur` (not `value` + `onChange`) to avoid a blob write per keystroke. Each phase row is now wrapped in a card `div` (`var(--card)` background) to visually separate phases and give the criteria section a clean home. |
