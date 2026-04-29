# PMTracking — Project Memory

## Purpose
Internal PM and budget tracking tool for Rapid Circle's IntoWork engagement. Replaces the Blackmores Excel burndown tracker.

## Tech stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + Recharts
- **Backend:** Azure Functions v4 (Node.js + TypeScript)
- **Storage:** Azure Blob Storage — single `appdata.json` blob in `pmtracking` container
- **Auth:** Anonymous (internal tool, deploy behind Azure SWA authentication if needed)

## Local dev
```powershell
# Terminal 1 — Azurite (blob storage emulator)
azurite --skipApiVersionCheck

# Terminal 2 — Azure Functions API
# IMPORTANT: use 'npm start', NOT 'func start' directly.
# 'npm start' triggers the prestart hook which compiles TypeScript first.
cd api
npm install       # first time only
npm start         # compiles TS → dist/ then runs func start

# Terminal 3 — React app
cd app
npm install       # first time only
npm run dev
```
App runs at http://localhost:5173. API proxy at /api → localhost:7071.

## Common mistakes
- Running 'func start' directly skips the npm prestart hook → TypeScript is never compiled → 'dist/ not found' error.
  Fix: always use 'npm start' in the api directory.
- Running 'npm install' then 'func start' has the same problem for the same reason.
- If you get TypeScript compile errors on 'npm start', read the tsc output before the func start line.

## CSV format (ConnectWise export)
Columns expected: Date, Member, Company, Project, Location, Group, Service #, Hours, Notes, Status, Billable, Work Role, Work Type, Agreement, Approver, Agreement Type

Date format: DD/MM/YYYY H:MM
Member: initials matching resource records (e.g. CDensley, THenderson)
Company filter: set to "IntoWork" on the Timesheets page to filter to IntoWork entries only

## IntoWork program data (seeded as defaults)
4 SOWs:
- SOW 1: Automation Champion — $95,000 — May–Oct 2026
- SOW 2: Shared Services — $50,000 — May–Oct 2026
- SOW 3: Purview Uplift — $95,000 — May–Sep 2026
- SOW 4: Orchestry/IM — $52,050 — May–Jul 2026

Resources seeded: Chris Densley, Tony Henderson, Peter Varitimidis, Ian Culliver, Don Taylor

## Rate card
Consultant: $195/hr
Senior Consultant: $215/hr
Senior Project Management: $215/hr
Project Manager: $195/hr
Principal Consultant: $230/hr
Architect/Strategic: $250/hr
Business Lead: $250/hr
CTO: $285/hr

## Open items
- [ ] ConnectWise project code values for IntoWork SOWs — confirm with KC once CW is configured
- [ ] Tony Henderson, Peter V, Ian Culliver, Don Taylor weekly hours — confirm and update allocations
- [ ] Azure subscription and resource group for production deploy — confirm with Chris
- [ ] SWA authentication (Easy Auth) — add if board needs to be locked down
- [ ] Export to PDF/CSV report — future feature

## Known issues / decisions
- The blob client in the Function has a bug: getContainerClient() is called on the BlobClient not the BlobServiceClient — fix before deploy. The correct call is: svc.getContainerClient(CONTAINER).createIfNotExists() then upload.
- Buffer draw is calculated as cost exceeding deliverable budget (budget × (1 - bufferPct)). Adjust bufferPct per SOW in Settings if needed.

## Architecture
```
Browser (SWA)
  └── /api/* → Azure Functions v4
                └── Azure Blob Storage (pmtracking container, appdata.json)
```

## Deployment to Azure

### One-time Azure setup (do this once)

**1. Create a Resource Group** (if not already one for IntoWork)
```
az group create --name rg-intowork-tools --location australiaeast
```

**2. Create a Storage Account** for blob persistence
```
az storage account create \
  --name saintoworkpmtracking \
  --resource-group rg-intowork-tools \
  --location australiaeast \
  --sku Standard_LRS
```
Then create the container:
```
az storage container create \
  --name pmtracking \
  --account-name saintoworkpmtracking
```
Get the connection string and save it — you will need it in step 4:
```
az storage account show-connection-string \
  --name saintoworkpmtracking \
  --resource-group rg-intowork-tools
```

**3. Create the Static Web App**
- Go to Azure Portal → Create resource → Static Web App
- Name: swa-intowork-pmtracking
- Region: East Asia (closest to AU with SWA available) or Australia East when available
- Plan: Free (sufficient for internal tool)
- Source: GitHub → connect your repo → branch: main
- Build preset: Custom
  - App location: app
  - API location: api
  - Output location: dist
- Click Review + Create

Azure will automatically add the GitHub Actions secret `AZURE_STATIC_WEB_APPS_API_TOKEN` to your repo.

**4. Add Application Settings to the SWA**
In Azure Portal → your Static Web App → Configuration → Application settings, add:
```
AZURE_STORAGE_CONNECTION_STRING = <connection string from step 2>
```
Also add the AAD app registration values if locking down with auth:
```
AZURE_CLIENT_ID     = <your AAD app client ID>
AZURE_CLIENT_SECRET = <your AAD app client secret>
```

**5. AAD App Registration** (for Easy Auth login)
- Azure Portal → Azure Active Directory → App registrations → New
- Name: PMTracking
- Redirect URI: https://<your-swa-url>/.auth/login/aad/callback
- Note the Client ID, create a Client Secret under Certificates & Secrets
- Add these to SWA application settings (step 4)

### Every deploy after that
Just push to `main` — the GitHub Actions workflow builds and deploys automatically.
Pull requests get a staging environment URL automatically.

### If you want auth off (internal Rapid Circle network only)
Remove the `routes` and `auth` sections from `app/staticwebapp.config.json` and just keep:
```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/*.{css,js,png,jpg,svg,ico,json}"]
  }
}
```
Anyone with the URL can access it — fine for an internal tool behind a non-public URL.
