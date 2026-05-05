/**
 * seed-raid.js — one-off seed for tasks, risks, issues, decisions
 * Run locally against Azurite, or against production by setting
 * AZURE_STORAGE_CONNECTION_STRING before running.
 *
 * Usage (local dev — Azurite must be running):
 *   node scripts/seed-raid.js
 *
 * Usage (production):
 *   AZURE_STORAGE_CONNECTION_STRING="DefaultEndpointsProtocol=https;..." node scripts/seed-raid.js
 */

const { BlobServiceClient } = require('@azure/storage-blob')

const CONN      = process.env.AZURE_STORAGE_CONNECTION_STRING || 'UseDevelopmentStorage=true'
const CONTAINER = 'pmtracking'
const BLOB      = 'appdata.json'

async function run() {
  const svc  = BlobServiceClient.fromConnectionString(CONN)
  const blob = svc.getContainerClient(CONTAINER).getBlockBlobClient(BLOB)

  if (!await blob.exists()) {
    console.error('ERROR: appdata.json not found. Start the app first so it creates the blob, then re-run.')
    process.exit(1)
  }

  const dl = await blob.download()
  const chunks = []
  for await (const chunk of dl.readableStreamBody) chunks.push(chunk)
  const appData = JSON.parse(Buffer.concat(chunks).toString('utf8'))

  // ─── SOW mapping ─────────────────────────────────────────────────────────
  const sowMap = {
    'IntoWork - AC':                       'sow-1a',
    'IntoWork - AC Rapid Build':           'sow-1a',
    'IntoWork - AC Recruitment':           'sow-1b',
    'AC - Rapid Build':                    'sow-1a',
    'AC - ACM Core':                       'sow-1a',
    'AC - Recruitment Workflow':           'sow-1b',
    'AC':                                  'sow-1a',
    'SS Opt':                              'sow-2',
    'Orchestry':                           'sow-4',
    'Purview':                             'sow-3',
    'IntoWork - Program':                  null,
    'Program':                             null,
    'Powercor':                            null,
    'DocuWorx':                            null,
    'Internal RC':                         null,
    'Internal RC - Automation Champions':  null,
    'IntoWork - DMS':                      null,
    'IntoWork - DEWR Governance':          null,
  }

  function bucket(dueDate, status) {
    if (status === 'In Progress') return 'today'
    const d    = new Date(dueDate)
    const now  = new Date('2026-05-05')
    const diff = Math.ceil((d - now) / 86400000)
    if (diff <= 0)  return 'today'
    if (diff <= 5)  return 'this-week'
    if (diff <= 27) return 'this-month'
    return 'backlog'
  }

  // ─── Tasks ────────────────────────────────────────────────────────────────
  const taskRows = [
    ['T28','Powercor','Pull Powercor Intune context','Gather context on Powercor Intune environment for recommendation drafting','Chris','Open','Med','2026-05-06'],
    ['T29','IntoWork - AC','Prepare quote drafts for Wed 6 Katie','Quote drafts ready for Wed 6 Katie program check-in','Chris','Open','High','2026-05-06'],
    ['T30','DocuWorx','DocuWorx alternative architecture - PP/SPO unpack','Architecture comparison: agentic custom build vs Power Platform / SharePoint','Chris','Open','Med','2026-05-08'],
    ['T31','Internal RC','Fri internal - Adam neurodivergent + Fixy quote process','Internal team meeting prep covering Adam neurodivergent session + Fixy quote process','Chris','Open','High','2026-05-08'],
    ['T32','IntoWork - AC Rapid Build','Rapid Build RAIC pathway clarified','Confirm RAIC pathway for Rapid Build delivery','Chris','Open','High','2026-05-08'],
    ['T33','IntoWork - Program','Update Wed 6 Katie agenda','Refine Wed 6 Katie agenda based on this week outcomes','Chris','Open','High','2026-05-05'],
    ['T34','Internal RC','KC Ong catch-up - timesheeting + costing','KC catch-up on timesheeting, costing methodology, PM bucket tracking','Chris','Open','High','2026-05-08'],
    ['T35','Powercor','Powercor Intune regulatory + controls review','Regulatory and controls review for Powercor Intune recommendations','Chris','Open','Med','2026-05-07'],
    ['T36','IntoWork - DMS','Nishant catch-up - Gemba','Outreach to Nishant on Gemba context','Chris','Open','Med','2026-05-08'],
    ['T37','Orchestry','Confirm Orchestry licensing procurement with Katie','Confirm Pro vs Enterprise tier (~$25k delta), procurement pathway','Chris','Open','High','2026-05-08'],
    ['T38','Orchestry','Ian global admin account - chase provisioning','Chase IntoWork IT for Ian GA account provisioning','Chris','Open','High','2026-05-08'],
    ['T39','Purview','Purview scope unpack with Katie (discovery vs rollout)','Clarify Purview production rollout scope - pilot cohort vs whole org','Chris','Open','High','2026-05-08'],
    ['T41','IntoWork - Program','Funding drawdown method + client endorsement','Define hybrid funding model; secure Katie endorsement','Chris','In Progress','High','2026-05-08'],
    ['T42','IntoWork - Program','Draft 6 program charters for Wed Katie meeting','Charters for AC overall, RapidBuild, Recruitment MVP, SS Opt, Orchestry, Purview','Chris','Open','High','2026-05-06'],
    ['T43','IntoWork - Program','Tony Henderson handover brief','Handover brief covering scope and program PM transition','Chris','Open','Med','2026-05-15'],
    ['T44','Internal RC','Internal alignment call with Adam (retrospective time + mobilisation gap)','Internal alignment - retrospective time and mobilisation gap with Adam','Chris','In Progress','High','2026-05-08'],
    ['T46','IntoWork - AC','Discovery-only proposals - Legal Doc Review + Finance Opt','Position Legal Doc Review + Finance Opt as discovery-only inside AC envelope','Chris','Open','Med','2026-05-15'],
    ['T47','IntoWork - AC Rapid Build','Rapid Build budget review - $15k vs actual day rate','Validate $15k Rapid Build budget against realistic effort (config + SRA + handover)','Chris','Open','High','2026-05-08'],
    ['T48','IntoWork - AC','AC sub-project validation matrix','Validation matrix for AC sub-projects - in/out gate criteria','Chris','Open','High','2026-05-08'],
    ['T49','Purview','Negotiate Purview SOW window extension contingency','Negotiate 2-week extension of Purview SOW window to 15 Oct as contingency','Chris','Open','Med','2026-05-22'],
    ['T50','IntoWork - AC Recruitment','Identify build resource for Recruitment MVP + RAG agent','Identify build resource (rate, availability) for Recruitment Workflow MVP + Foundry/RAG agent','Chris','Open','High','2026-05-15'],
    ['T51','IntoWork - Program','Confirm EV countersignature actual status','SOW docs say countersig confirmed; risk register treats as open. Confirm with Katie today.','Chris','Open','High','2026-05-05'],
    ['T52','Orchestry','Margaux MS - early-June Orchestry pilot insights commitment','Confirm framing back to Margaux - early-June insights = Orchestry Phase 1 Discovery output','Chris','Open','High','2026-05-08'],
    ['T53','IntoWork - AC','Good News Stories SOW review + send to Fixy','Re-review Good News Stories SOW draft, send to Fixy for approval','Chris','Open','High','2026-05-07'],
    ['T54','Internal RC','Draft agenda for next fortnightly IntoWork x RC internal sync','Build 30-min decision-focused agenda for next fortnightly with pre-read template','Chris','Open','Med','2026-05-15'],
    ['T55','IntoWork - DEWR Governance','Review Adam DEWR AI Governance draft (v0.2 from Reason Group)','Review Reason Group DEWR AI Governance draft, provide feedback to Adam','Chris','Open','High','2026-05-07'],
    ['T56','Internal RC','Partner with neurodivergent group for MS neurodivergent presentation','Partner outreach for MS neurodivergent presentation - shortlist partners','Chris','Open','Med','2026-05-12'],
    ['T57','Internal RC','Book MS neurodivergent presentation session','Book partner-led session at time that suits IntoWork - confirm IntoWork host with Katie','Chris','Open','Med','2026-05-15'],
    ['T58','Internal RC - Automation Champions','Peter V agentic governance session - 1hr prep + 1hr delivery','Reach out to Peter V to deliver 1hr agentic governance session using agentic-lite framework','Chris','Open','High','2026-05-12'],
    ['T59','IntoWork - AC Rapid Build','Rapid Build SRA / risk assessment - internal kickoff','Get started on risk assessment / SRA for Rapid Build internally at IntoWork (RAIC pre-req)','Chris','Open','High','2026-05-15'],
    ['T60','Internal RC','Strategic positioning paper - Power Platform vs agentic engineering','Pros/cons paper showing strategic positioning between Power Platform and agentic engineering','Chris','Open','Med','2026-05-22'],
    ['T61','Internal RC','Showcase program tracker to Dan + KC','Set up time with Dan and KC Ong to walk them through program tracker / PMTracking app','Chris','Open','Med','2026-05-15'],
    ['T62','Internal RC','Add Don project + timelines to tracker','Time with Don Taylor to capture his project + timelines into program tracker for visibility','Chris','Open','Med','2026-05-15'],
    ['T63','IntoWork - Program','Dashboard CSV upload - tasks/risks/issues/decisions','30-min slot today: upload tasks/risks/issues/decisions to PMTracking dashboard','Chris','Open','High','2026-05-05'],
  ]

  const tasks = taskRows.map(([id, project, title, description, , status, priority, due], i) => ({
    id:         id.toLowerCase(),
    title,
    description,
    sowId:      sowMap[project] ?? null,
    bucket:     bucket(due, status),
    priority:   priority === 'High' ? 'high' : priority === 'Med' ? 'medium' : 'low',
    effort:     { value: 1, unit: 'hours' },
    recurrence: null,
    links:      [],
    comments:   [],
    createdAt:  new Date('2026-05-05').toISOString(),
    order:      i,
  }))

  // ─── Risks ────────────────────────────────────────────────────────────────
  const riskRows = [
    ['R1', 'Program',               'Chris single point of failure',         'Whole program coordination dependent on one person; no backup if Chris unavailable. Tony Henderson handover in flight will partially mitigate.',        'Adam',            3, 4],
    ['R2', 'Program',               'EV countersignature status unclear',     'Orchestry and Purview SOW docs state countersig confirmed (20 Apr); risk register still treats as open. Need explicit confirmation from Katie.',        'Chris',           3, 3],
    ['R3', 'Program',               'PM bucket adequacy',                     '$25k AC PM bucket = 14.5 days = 4.5 hrs/week across 26 weeks. May be under-cooked for whole-program PM. Drawn $7,848 already (~one third) by week 1.', 'Chris',           4, 3],
    ['R4', 'Program',               'Build resource not named',               'Recruitment Workflow + Foundry/RAG agent both need a build resource. None identified or costed. Recruitment Workflow scope does not close without one.', 'Chris',           4, 4],
    ['R5', 'AC',                    'Recruitment Workflow scope vs budget',   '$20k = 11.6 days; SOW must-haves (email trigger, doc upload + validation, admin visibility, SP storage) realistically 15-25 days for clean MVP.',      'Chris',           4, 3],
    ['R6', 'AC',                    'AC sub-project scope tension',           'All four sub-projects (Rapid Build, Legal Doc, Recruitment, Finance Opt) on tight budgets; scope discipline required to stay within envelope.',        'Chris',           3, 3],
    ['R7', 'AC - Rapid Build',      'Rapid Build under-provisioned',          '$15k = 8.7 days; if SRA evidence pack is in scope, may not cover discovery + config + handover.',                                                      'Chris',           3, 3],
    ['R8', 'AC - ACM Core',         'Champion network capability',            'Network at Stage 1 (Prompt User) maturity; uplift to autonomous champion operation requires sustained coaching across program window.',                'Chris',           3, 3],
    ['R9', 'SS Opt',                'T&M cap exposure',                       '$50k T&M capped - scope creep risk. No PM line scoped within SOW; oversight comes from AC PM bucket.',                                                 'Chris',           3, 3],
    ['R10','Orchestry',             'Licensing decision blocking kick-off',   'Pro vs Enterprise tier (~$25k delta) not yet decided by IntoWork; blocks all downstream activity.',                                                     'Katie / IntoWork',4, 4],
    ['R11','Orchestry',             'Zero-slack between phases',              '5-7 week SOW with 5 phases + 2-week hypercare; any phase slip cascades into Purview start window.',                                                     'Chris',           3, 4],
    ['R12','Purview',               'Production rollout sizing undefined',    'SOW wording generic - pilot cohort vs whole-org rollout not specified. Cannot scope effort accurately until Orchestry data lands.',                     'Chris / Peter',   3, 4],
    ['R13','Purview',               'SOW window vs delivery timing',          'Stage 3 buffer hits 18 Sep against 30 Sep cap. Negotiating 2-week extension to 15 Oct as contingency.',                                                'Chris',           3, 3],
  ]

  const risks = riskRows.map(([id, project, title, description, owner, likelihood, impact]) => ({
    id,
    sowId:      sowMap[project] ?? null,
    title,
    description,
    likelihood,
    impact,
    status:     'Open',
    owner,
    history:    [{ id: `${id}-h1`, timestamp: new Date('2026-05-05').toISOString(), type: 'comment', text: 'Logged at program inception.' }],
    createdAt:  new Date('2026-05-05').toISOString(),
  }))

  // ─── Issues ───────────────────────────────────────────────────────────────
  const issueRows = [
    ['I1','Orchestry',               'Ian GA account not provisioned',               'Blocks Orchestry kick-off; Ian cannot run Discovery without GA access.',                                                                'High',   'In progress','Ian Culliver'],
    ['I2','Orchestry',               'Licensing tier not selected',                  'Blocks kick-off; ~$25k delta between Pro and Enterprise unresolved.',                                                                   'High',   'Open',       'Chris'],
    ['I3','Program',                 'Countersig confirmation needed',               'SOW docs and risk register disagree; need Katie confirmation today.',                                                                   'Medium', 'Open',       'Chris'],
    ['I4','AC - Recruitment Workflow','Build resource not identified',               'Cannot deliver Recruitment Workflow MVP within $20k envelope without a build resource.',                                                'High',   'Open',       'Chris'],
    ['I5','Program',                 'PM bucket spending faster than allocation rate','$7,848 drawn against $25k by Tue Wk 1 (~32%); allocation rate sustains for ~6 weeks at current burn.',                               'High',   'Open',       'Chris'],
    ['I6','Purview',                 'Margaux MS commitment to confirm',             'Margaux ask: pilot insights early-June. Need to confirm framing back to her - Orchestry Phase 1 output, not Purview.',                'Medium', 'In progress','Chris'],
  ]

  const issues = issueRows.map(([id, project, title, description, impact, status, owner]) => ({
    id,
    sowId:     sowMap[project] ?? null,
    title,
    description,
    impact,
    status,
    owner,
    createdAt: new Date('2026-05-05').toISOString(),
  }))

  // ─── Decisions ────────────────────────────────────────────────────────────
  const decisionRows = [
    ['D1', 'Apr','AC treated as one program with sub-projects (not separate projects)',                                               'Chris + Estelle Mon endorsement'],
    ['D2', 'Apr','"Solution-fits-need" framing as program operating principle',                                                      'Endorsed Estelle Mon'],
    ['D3', 'Apr','"Katie Gate from ideation" - no build before Katie agreement',                                                     'Chris + Katie'],
    ['D4', 'Apr','Orchestry-first sequencing - Purview consumes Orchestry data outputs',                                             'Chris (program design)'],
    ['D5', 'May','MS MCI funding treated as present/unconstrained - not a planning gate',                                            'Chris'],
    ['D6', 'May','Orchestry program-end = mid-July 2026 (active engagement)',                                                        'Chris'],
    ['D7', 'May','Purview = waiting work until Orchestry data lands; few hours Peter charge for estimation only pre-data',           'Chris'],
    ['D8', 'May','Staggered resource ramp: Chris FT now, Ian FT mid-Jun (Orchestry), Peter FT mid-Jul (Purview)',                    'Chris'],
    ['D9', 'May','Tony Henderson takes over program PM coordination on arrival',                                                     'Chris + Adam'],
    ['D10','May','Hybrid funding model: pre-gate RC-internal absorption (Option 2); post-gate SOW PM reserves (Option 1)',           'Chris'],
    ['D11','May','Stage 0 Mobilisation (5-22 May) funded RC-internally',                                                            'Chris'],
    ['D12','May','Buffer + sub-week task discipline: 1-week buffer per stage; sub-week task scope',                                  'Chris'],
    ['D13','May','AC sub-project budget split: Rapid Build $15k, PM $25k, Legal $20k, Recruitment $20k, Finance $15k',              'Chris'],
    ['D14','May','PM allocation method: value x duration weighted split across sub-projects',                                       'Chris (proposed for sync confirmation)'],
    ['D15','May','Margaux early-June pilot insights = Orchestry Phase 1 Discovery output (29 May sign-off), not Purview',           'Chris'],
    ['D16','May','Legal Doc Review + Finance Opt = discovery-only inside AC envelope; if validated separate SOWs for build',        'Chris'],
    ['D17','May','Standing fortnightly internal sync norms: written status pre-read 24h prior, meeting = decisions only',          'Chris (proposed for sync today)'],
  ]

  const decisions = decisionRows.map(([id, period, title, decidedBy]) => ({
    id,
    sowId:      null,
    title,
    description:'',
    rationale:  '',
    decidedBy,
    date:       period === 'Apr' ? '2026-04-30' : '2026-05-05',
  }))

  // ─── Merge and write ──────────────────────────────────────────────────────
  const updated = {
    ...appData,
    tasks:      [...(appData.tasks     ?? []), ...tasks],
    risks:      [...(appData.risks     ?? []), ...risks],
    issues:     [...(appData.issues    ?? []), ...issues],
    decisions:  [...(appData.decisions ?? []), ...decisions],
    lastUpdated: new Date().toISOString(),
  }

  const body = Buffer.from(JSON.stringify(updated))
  await svc.getContainerClient(CONTAINER).createIfNotExists()
  await blob.upload(body, body.length, {
    blobHTTPHeaders: { blobContentType: 'application/json' },
    overwrite: true,
  })

  console.log(`Done: ${tasks.length} tasks, ${risks.length} risks, ${issues.length} issues, ${decisions.length} decisions seeded.`)
}

run().catch(e => { console.error('FAILED:', e.message); process.exit(1) })
