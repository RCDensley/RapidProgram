# PMTracking — Development Tracker

## Status key
- [ ] Not started
- [~] In progress
- [x] Done
- [!] Blocked

---

## Confirmed decisions
- **RE-1:** Resource allocation = days per week only. No full time / part time distinction.
- **DM-2:** SOW `budget` = sum of all `budgetSources`. If one source, that is the budget. If two, they add up. Budget sources also affect timesheet drawdown — see TS-1.
- **SE-1 / PP bidirectional sync:** Single data source. Settings and Project Plan read/write the same phase objects. No duplication, no sync problem.
- **Miro:** Not kept updated for this app. Tracker lives in this file only.

---

## Bug fixes

### BF-1 — API 404 on first load
**File:** `api/src/functions/data.ts`
**Issue:** GET /api/data returns HTTP 404 when no blob exists yet. Browser logs a console error on every cold start.
**Fix:** Return HTTP 200 with `{}` instead of 404 when blob does not exist. Client merges with defaults on load.
**Status:** [x]

---

## Data model changes
*All views depend on these. Must be done before any view work.*

### DM-1 — Phase engagement model (replaces date-range allocations)
**File:** `app/src/types/index.ts`, `app/src/utils/defaultData.ts`
**Change:** Remove `startDate`/`endDate` from `ResourceAllocation`. Add `engagedPhases: PhaseName[]`. Dates become derived from the SOW phases the resource is engaged on. Days per week stays as the only manual input.
**Reason:** Resources screen says "Chris is on Automation Champion for Deliver and Handover at 2.5d/wk" rather than asking for manual date entry.
**Status:** [x]

### DM-2 — Budget sources per SOW
**File:** `app/src/types/index.ts`, `app/src/utils/defaultData.ts`
**Change:** Add `BudgetSource { id, label, amount, color }` interface. Add `budgetSources: BudgetSource[]` to SOW. Remove the standalone `budget` field — total budget is computed as `sum(budgetSources.map(s => s.amount))`. Pre-seed with IntoWork funding breakdown:
- SOW 1 (Automation Champion): MS MCI $70,000 / RC co-invest $15,000 / Rate discount $10,000
- SOW 2 (Shared Services): IntoWork direct $50,000
- SOW 3 (Purview): IntoWork direct $95,000
- SOW 4 (Orchestry): IntoWork direct $52,050 + licensing TBC
**Status:** [x]

### DM-3 — Milestones
**File:** `app/src/types/index.ts`, `app/src/utils/defaultData.ts`
**Change:** Add `Milestone { id, sowId: string | null, label, date: string, color?: string }` interface. Add `milestones: Milestone[]` to `AppData`. `sowId: null` = program-level milestone spanning full canvas height. Pre-seed with known IntoWork milestones:
- MS approval checkpoint — ~20 Jun 2026 (program-level, amber)
- MS funding deadline — 30 Jun 2026 (program-level, red)
- Tony Henderson joins — 26 May 2026 (program-level, sky)
- Purview kick-off — 1 May 2026 (SOW 3)
- Orchestry kick-off, pending licensing — 1 May 2026 (SOW 4)
**Status:** [x]

---

## Calculations update

### CA-1 — Derived allocation dates
**File:** `app/src/utils/calculations.ts`
**Change:** Add `derivedAllocationDates(alloc, sow)` — returns `{ startDate, endDate }` from the earliest start and latest end of `alloc.engagedPhases` within the SOW's phase list. Update `allocationForecastHours`, `allocationForecastCost`, and `generateBurndownSeries` to use derived dates.
**Depends on:** DM-1
**Status:** [x]

### CA-2 — Current phase helper
**File:** `app/src/utils/calculations.ts`
**Change:** Add `getCurrentPhase(sow): Phase | null` — returns the phase whose date range contains today. Returns null if today is outside the SOW range or falls between phases.
**Status:** [x]

### CA-3 — SOW team members helper
**File:** `app/src/utils/calculations.ts`
**Change:** Add `getSowTeamMembers(sowId, data): Resource[]` — returns resources with at least one allocation against the SOW.
**Depends on:** DM-1
**Status:** [x]

### CA-4 — SOW total budget helper
**File:** `app/src/utils/calculations.ts`
**Change:** Add `sowTotalBudget(sow): number` — returns `sum(sow.budgetSources.map(s => s.amount))`. Replace all direct `sow.budget` references with this function.
**Depends on:** DM-2
**Status:** [x]

---

## Project Plan view

### PP-1 — Infinite / dynamic months
**File:** `app/src/views/ProjectPlan.tsx`
**Change:** Replace `monthsBetween(progStart, progEnd)` with a dynamic calculation. Visible months = `[progStart, max(progEnd, panOffset + containerWidthInMonths + 3)]`. Months array grows as you pan right — no hard stop at the last SOW end date.
**Status:** [x]

### PP-2 — Vertical lane stacking for overlapping phases
**File:** `app/src/views/ProjectPlan.tsx`
**Change:** Add `assignLanes(blocks)` — greedy interval scheduling algorithm assigns each phase/pause block to a lane (0, 1, 2...). SOW row height expands to `SOW_ROW_H * numLanes`. Each block renders vertically offset by its lane index. Prevents phase bars overlapping when Plan and Deliver run concurrently.
**Status:** [x] — Collapsible resource rows
**File:** `app/src/views/ProjectPlan.tsx`
**Change:** Add `expandedSOWs: Set<string>` state, defaulting to empty (all collapsed). SOW label row gets a chevron toggle. Resource rows only render when `expandedSOWs.has(sow.id)`.
**Depends on:** DM-1, CA-1
**Status:** [x]

### PP-4 — Milestone rendering
**File:** `app/src/views/ProjectPlan.tsx`
**Change:** Render milestones after grid lines, before phase blocks (so phase blocks sit on top). Diamond SVG marker at the x-position for the date. Program-level milestones span full canvas height with a coloured label above the header band. SOW-level milestones render within the SOW row. "Add milestone" button in toolbar (same pattern as "Add wait"). Click to edit label/date/delete. Labels truncate at low zoom. Today line already renders — milestone markers use same x-calculation approach.
**Depends on:** DM-3
**Status:** [x]

---

## Resources view

### RE-1 — Phase engagement editor
**File:** `app/src/views/Resources.tsx`
**Change:** Replace start/end date inputs with a phase engagement editor. Checkboxes for Discover / Plan / Deliver / Handover — each shows the actual phase date range as a sub-label (derived from project plan). `daysPerWeek` input stays. Derived dates update automatically when phases are ticked/unticked. Gantt bars update live.
**Depends on:** DM-1, CA-1
**Status:** [x]

---

## Dashboard view

### DA-1 — SOW selector with dynamic detail panel
**File:** `app/src/views/Dashboard.tsx`
**Change:** Add `selectedSowId: string | null` state. SOW cards become clickable — selected card highlighted with a border. Right column switches between:
- Program summary (burndown across all SOWs, totals) when nothing selected
- SOW detail when selected: team members (from CA-3), current phase (from CA-2, colour-highlighted), start/end months, SOW-specific burndown (forecast + actual lines), budget sources breakdown
**Depends on:** CA-2, CA-3, CA-4
**Status:** [x]

### DA-2 — Data source explanation banner
**File:** `app/src/views/Dashboard.tsx`
**Change:** Add a subtle info banner explaining that numbers are forecast-only until ConnectWise CSV timesheets are uploaded via the Timesheets page. Dismissible (sessionStorage flag so it reappears on next session but not during the same one).
**Status:** [x]

---

## Timesheets view

### TS-1 — Budget source drawdown selector on import
**File:** `app/src/views/Timesheets.tsx`
**Change:** During the CSV preview/import step, add a per-SOW budget source selector. After parsing, for each SOW that has entries in the CSV, the user selects which budget source the hours are drawn against (e.g. "Microsoft MCI" vs "IntoWork direct"). This selection is stored on the time entries and used to track drawdown per source in the Dashboard. If a SOW has only one budget source the selection is automatic and not shown. If it has multiple, the selector is shown as a required step before import can be confirmed.
**Depends on:** DM-2
**Status:** [x]

### SE-1 — Month/half-month date selectors
**File:** `app/src/views/Settings.tsx`
**Change:** Replace all `<input type="date">` with a reusable `MonthHalfPicker` component. Two-part selector: month dropdown (pulled from program date range) + half toggle ("1st" = YYYY-MM-01, "15th" = YYYY-MM-15). Uses same snap logic as Project Plan. Phase dates edited in Settings are the same objects rendered in Project Plan — no sync needed, single source.
**Status:** [x]

### SE-2 — Budget sources per SOW
**File:** `app/src/views/Settings.tsx`
**Change:** Add budget sources section per SOW. List of sources (label, amount, colour chip). Add/remove sources inline. Running total shown. Pre-populated with IntoWork funding breakdown from defaultData.
**Depends on:** DM-2
**Status:** [x]

---

## Execution order

```
BF-1   Fix 404                                    api/src/functions/data.ts
DM-1   Phase engagement model                     types + defaultData
DM-2   Budget sources                             types + defaultData
DM-3   Milestones                                 types + defaultData
CA-1   Derived allocation dates                   calculations.ts
CA-2   Current phase helper                       calculations.ts
CA-3   Team members helper                        calculations.ts
CA-4   SOW total budget helper                    calculations.ts
PP-1   Infinite months                            ProjectPlan.tsx
PP-2   Vertical lane stacking                     ProjectPlan.tsx
PP-3   Collapsible resources                      ProjectPlan.tsx
PP-4   Milestone rendering                        ProjectPlan.tsx
RE-1   Phase engagement editor                    Resources.tsx
DA-1   SOW selector + detail panel                Dashboard.tsx
DA-2   Data source banner                         Dashboard.tsx
TS-1   Budget source drawdown on import           Timesheets.tsx
SE-1   Month/half-month pickers                   Settings.tsx
SE-2   Budget sources in settings                 Settings.tsx
```

**Total: 18 items across 7 files + API**
