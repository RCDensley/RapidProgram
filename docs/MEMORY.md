# PMTracking — Project Memory (updated May 2026)

## Purpose
Internal PM and budget tracking tool for Rapid Circle's IntoWork engagement.
Built and maintained by Chris Densley (RC Senior Consultant).
Replaces the Blackmores Excel burndown tracker.

---

## Live deployment
- **URL:** https://proud-ocean-0339de800.7.azurestaticapps.net
- **Auth:** GitHub OAuth (RCDensley account) — any GitHub login, no team restriction
- **Repo:** https://github.com/RCDensley/RapidProgram
- **SWA resource:** `proud-ocean-0339de800` (Azure Static Web Apps)
- **Storage account:** `saintoworkpmtrack`
- **Blob containers:** `pmtracking` (appdata.json), `pmtracking-files` (uploaded files)
- **AI:** Azure AI Foundry — deployment `gpt-5.4-mini`, Responses API

---

## Tech stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Backend:** Azure Functions v4 (Node.js + TypeScript)
- **Storage:** Azure Blob Storage — single `appdata.json` blob, plus `pmtracking-files` container for uploads
- **Auth:** GitHub OAuth via SWA Easy Auth

---

## Local dev startup (run in order)
```powershell
# Terminal 1 — Azurite (blob storage emulator)
azurite --skipApiVersionCheck

# Terminal 2 — Azure Functions API
cd C:\Users\ChrisDensley\Projects\PMTracking\api
npm start          # runs prestart (tsc) then func start — do NOT use func start directly

# Terminal 3 — React app
cd C:\Users\ChrisDensley\Projects\PMTracking\app
npm run dev
```
App: http://localhost:5173 — API proxied at /api → localhost:7071

---

## Deployment
CI/CD via GitHub Actions: `.github/workflows/azure-static-web-apps-proud-ocean-0339de800.yml`
- `app_location: "/app"`, `api_location: "/api"`, `output_location: "/dist"`
- Build: `tsc && vite build` — TypeScript errors will silently break the deploy (SWA serves source files)
- Push to `main` → auto-deploys in ~3 minutes

### Common deploy failures
- **White screen / main.tsx MIME error:** Browser cache issue from new deploy. Fix: Ctrl+Shift+R (hard refresh) or clear site data in DevTools.
- **`BadRequest: No matching Static Web App`:** Deployment token expired. Fix: Azure Portal → SWA → Manage deployment token → regenerate → update `AZURE_STATIC_WEB_APPS_API_TOKEN_PROUD_OCEAN_0339DE800` in GitHub repo secrets.
- **TypeScript errors cause blank deploy:** SWA serves raw source files when build output is missing. Check GitHub Actions logs for the exact `tsc` error. Fix: resolve the TS error and push again.
- **Auth white screen:** GitHub OAuth session expired. Fix: navigate to `/.auth/logout` then log back in.

### Azure App Settings (required)
```
AZURE_STORAGE_CONNECTION_STRING = <storage account connection string>
FOUNDRY_ENDPOINT                = <Azure AI Foundry endpoint URL>
FOUNDRY_KEY                     = <API key>
FOUNDRY_DEPLOYMENT              = gpt-5.4-mini
FOUNDRY_API_VERSION             = 2025-04-01-preview
```

---

## API structure
```
api/src/
  _lib/providers/
    foundry.ts      — Foundry Responses API (streaming + non-streaming, vision)
    index.ts        — AIProvider interface + getAIProvider()
  functions/
    data.ts         — GET/POST appdata.json
    files.ts        — GET/POST/DELETE file storage; classifyFile with taskHint/sowHint context
    ai.ts           — POST /api/ai — streaming chat, /filename injection, vision, buildSystemPrompt
    write.ts        — POST /api/write — create_task/risk/issue/decision/refile_file actions
  index.ts          — registers all 4 functions
```

### Foundry API notes
- Endpoint: `${FOUNDRY_ENDPOINT}/openai/responses?api-version=${FOUNDRY_API_VERSION}`
- Auth: `api-key` header (not Bearer)
- Body: `input` array (not `messages`), `max_output_tokens` (not `max_tokens`)
- Streaming events: `response.output_text.delta` (text chunk), `response.completed` (done)

---

## App structure
```
app/src/
  types/index.ts          — all TypeScript types
  utils/
    defaultData.ts        — 5 SOWs, resources, allocations, milestones (IntoWork seed data)
    calculations.ts       — budget/forecast/burndown helpers
    csvParser.ts          — ConnectWise CSV parser
    storage.ts            — Azure Blob API calls
    taskUtils.ts          — task completion, recurrence, move helpers
  views/
    Dashboard.tsx         — SOW selector, burndown (program + per-SOW), funding panel with per-source drawdown bars, internal/client toggle, fixed-price step chart
    ProjectPlan.tsx       — drag/drop Gantt with phase lanes and milestones
    Resources.tsx         — phase engagement editor
    Tasks.tsx             — kanban board (horizontally collapsible bucket columns, status field, file attachments, CSV export/import)
    RAID.tsx              — risks/issues/decisions (5×5 matrix, promote risk to issue, CSV export/import per tab)
    Timesheets.tsx        — CSV upload, per-row SOW+budget source dropdowns, notes with hover tooltip
    Settings.tsx          — SOW config (T&M/Fixed pricing type, milestone invoices, status lifecycle)
    Assistant.tsx         — AI chat + file repo (collapsible folder tree, refile action, /filename autocomplete, file preview)
  App.tsx                 — AppContext (data, setData, updateData, save, reloadData, saving, saveError)
```

---

## Data model summary

### SOW
```
id, name, shortName, color, status, pricingType ('tm'|'fixed')
budgetSources: { id, label, amount, color }[]
phases: { name, startDate, endDate }[]
projectCodes: string[]
bufferPct: number
milestoneInvoices: { id, label, amount, date, completed }[]   — for fixed-price SOWs
```

### Task
```
id, title, description, sowId (null = program), bucket, priority
status: 'Open'|'In Progress'|'Done'
effort, recurrence, links, comments
attachments: string[]    — ProjectFile ids linked to this task
completedAt?, createdAt, order
```

### Risk
```
id, sowId, title, description, likelihood (1-5), impact (1-5)
status, owner, mitigation?, mitigationScore?
history: { id, timestamp, type, text }[]
promotedToIssueId?, createdAt
```

### Issue
```
id, sowId, title, description, impact, status, owner
raisedFromRiskId?, createdAt
```

### Decision
```
id, sowId, title, description, rationale, decidedBy, date
```

### ProjectFile
```
id, name, storageName (blob key), sowId, folder (AI path e.g. 'Purview/Meeting Notes')
size, uploadedAt, mimeType, description (AI summary)
classificationStatus: 'pending'|'classified'|'failed'
```

### TimeEntry (parsed from ConnectWise CSV)
```
date, memberId, memberName, company, projectName, hours
notes, billable ('Billable'|'Non-Billable')
sowId, budgetSourceId    — assigned during import
resolvedCost             — hours × member rate
```

---

## SOW IDs (seeded)
| ID      | Name                        | Budget   |
|---------|-----------------------------|----------|
| sow-1a  | Automation Champion (AC)    | $95,000  |
| sow-1b  | AC — Recruitment Workflow   | $20,000  |
| sow-2   | Shared Services Optimisation| $50,000  |
| sow-3   | Purview Uplift              | $95,000  |
| sow-4   | Orchestry / IM              | $52,050  |

---

## IntoWork rate card
| Role                     | Rate     |
|--------------------------|----------|
| Consultant               | $195/hr  |
| Senior Consultant        | $215/hr  |
| Senior Project Management| $215/hr  |
| Project Manager          | $195/hr  |
| Principal Consultant     | $230/hr  |
| Architect/Strategic      | $250/hr  |
| Business Lead            | $250/hr  |
| CTO                      | $285/hr  |

---

## ConnectWise CSV format
Expected columns: Date, Member, Company, Project, Location, Group, Service #, Hours, Notes, Status, Billable, Work Role, Work Type, Agreement, Approver, Agreement Type
Date format: DD/MM/YYYY H:MM — Member: initials matching resource records (e.g. CDensley)
Filter Company to "IntoWork" on the Timesheets page before importing.

---

## Seed script
```powershell
# Run against production (set connection string first)
$env:AZURE_STORAGE_CONNECTION_STRING = "DefaultEndpointsProtocol=https;AccountName=saintoworkpmtrack;..."
node scripts/seed-raid.js

# Run against local Azurite (start app first to create the blob)
node scripts/seed-raid.js
```
The script must be run from the project root. It uses `api/node_modules/@azure/storage-blob`.

---

## staticwebapp.config.json — key setting
```json
"navigationFallback": {
  "rewrite": "/index.html",
  "exclude": ["/api/*", "/assets/*", "/*.{css,js,png,jpg,svg,ico,json,woff,woff2,ttf}"]
}
```
`/assets/*` MUST be excluded — Vite outputs hashed JS bundles there and the SWA will serve index.html for them (wrong MIME type) without this exclusion.

---

## Known issues / gotchas
- `setData` in the context takes `AppData` directly — it is NOT a React state setter function. Do not call `setData(prev => ...)`.
- CSV export rows must use `String()` on all numeric fields — TypeScript strict mode rejects `(string | number)[]` where `string[]` is expected.
- `reloadData()` is exposed on AppContext for cases where data changes server-side (e.g. refile_file) and the UI needs to re-fetch without saving.
- The `Message` component in Assistant.tsx is a standalone function that cannot close over `reloadData` from the parent — pass it via an `onRefileConfirm` prop instead.
- Task `status` and `attachments` are required fields on the `Task` type — existing blob data without these fields will still load fine at runtime (JS is lenient) but any code constructing `Task` objects explicitly must include them.
