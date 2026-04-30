import { AppData } from '../types'

const y = new Date().getFullYear()

export const DEFAULT_DATA: AppData = {

  // ─── SOWs ──────────────────────────────────────────────────────────────────
  sows: [
    {
      // Track 1 of 2 for Automation Champion SOW
      // Maturity track: champion enablement, learning pathways, cohort uplift
      // Funded by Microsoft MCI ($70k) — must be drawn down before 30 Jun 2026 hard deadline
      id: 'sow-1a',
      name: 'Automation Champion — Maturity Track',
      shortName: 'AC Maturity',
      bufferPct: 0.15,
      startDate: `${y}-05-01`,
      endDate:   `${y}-10-31`,
      color: '#38bdf8',
      status: 'Active',
      // TBC: confirm exact CW project code with KC once ConnectWise is configured
      projectCodes: ['IntoWork - Automation Champion - Maturity'],
      budgetSources: [
        { id: 'bs-1a-1', label: 'Microsoft MCI', amount: 70000, color: '#38bdf8' },
      ],
      phases: [
        // Discover = baseline maturity assessment, champion identification
        { id: 'p1a-1', name: 'Discover', startDate: `${y}-05-01`, endDate: `${y}-05-15` },
        // Plan = maturity roadmap, learning pathway design, champion cohort structure
        { id: 'p1a-2', name: 'Plan',     startDate: `${y}-05-15`, endDate: `${y}-06-15` },
        // Deliver = champion cohort training, uplift sessions, capability building
        { id: 'p1a-3', name: 'Deliver',  startDate: `${y}-06-15`, endDate: `${y}-10-01` },
        // Handover = self-sufficiency, internal champion network stands up independently
        { id: 'p1a-4', name: 'Handover', startDate: `${y}-10-01`, endDate: `${y}-10-31` },
      ],
    },
    {
      // Track 2 of 2 for Automation Champion SOW
      // Solutions delivery: RC-funded delivery capacity for champion-identified solutions
      // Budget split TBC pending conversation with Katie Gamblin
      // RC co-invest $15k + rate discount $10k are placeholders — update after budget conversation
      id: 'sow-1b',
      name: 'Automation Champion — Solutions Delivery',
      shortName: 'AC Solutions',
      bufferPct: 0.2,
      startDate: `${y}-06-01`,
      endDate:   `${y}-10-31`,
      color: '#7dd3fc',
      status: 'Active',
      // TBC: confirm exact CW project code with KC once ConnectWise is configured
      projectCodes: ['IntoWork - Automation Champion - Solutions'],
      // Budget TBC — placeholder sources until split agreed with Katie
      budgetSources: [
        { id: 'bs-1b-1', label: 'RC Co-invest (TBC)',  amount: 15000, color: '#7dd3fc' },
        { id: 'bs-1b-2', label: 'Rate Discount (TBC)', amount: 10000, color: '#818cf8' },
      ],
      phases: [
        // Discover = solution scoping (champion brings idea, RC validates feasibility)
        { id: 'p1b-1', name: 'Discover', startDate: `${y}-06-01`, endDate: `${y}-06-15` },
        // Plan = solution design, architecture, effort estimate, sign-off
        { id: 'p1b-2', name: 'Plan',     startDate: `${y}-06-15`, endDate: `${y}-07-01` },
        // Deliver = iterative build and deploy across solution stream
        { id: 'p1b-3', name: 'Deliver',  startDate: `${y}-07-01`, endDate: `${y}-10-01` },
        // Handover = champion ownership, RC steps back
        { id: 'p1b-4', name: 'Handover', startDate: `${y}-10-01`, endDate: `${y}-10-31` },
      ],
    },
    {
      id: 'sow-2',
      name: 'Shared Services Optimisation',
      shortName: 'Shared Services',
      bufferPct: 0.2,
      startDate: `${y}-05-01`,
      endDate:   `${y}-10-31`,
      color: '#a78bfa',
      status: 'Active',
      projectCodes: ['Shared Services Optimisation', 'IntoWork - Shared Services'],
      // DM-2: IntoWork direct investment only
      budgetSources: [
        { id: 'bs-2-1', label: 'IntoWork Direct', amount: 50000, color: '#a78bfa' },
      ],
      phases: [
        { id: 'p2-1', name: 'Discover',  startDate: `${y}-05-01`, endDate: `${y}-05-31` },
        { id: 'p2-2', name: 'Plan',      startDate: `${y}-06-01`, endDate: `${y}-06-30` },
        { id: 'p2-3', name: 'Deliver',   startDate: `${y}-07-01`, endDate: `${y}-10-15` },
        { id: 'p2-4', name: 'Handover',  startDate: `${y}-10-16`, endDate: `${y}-10-31` },
      ],
    },
    {
      id: 'sow-3',
      name: 'Purview Uplift',
      shortName: 'Purview',
      bufferPct: 0.2,
      startDate: `${y}-05-01`,
      endDate:   `${y}-09-30`,
      color: '#34d399',
      status: 'Active',
      projectCodes: ['Purview Implementation', 'IntoWork - Purview'],
      // DM-2: IntoWork direct investment only
      budgetSources: [
        { id: 'bs-3-1', label: 'IntoWork Direct', amount: 95000, color: '#34d399' },
      ],
      phases: [
        { id: 'p3-1', name: 'Discover',  startDate: `${y}-05-01`, endDate: `${y}-05-31` },
        { id: 'p3-2', name: 'Plan',      startDate: `${y}-06-01`, endDate: `${y}-06-30` },
        { id: 'p3-3', name: 'Deliver',   startDate: `${y}-07-01`, endDate: `${y}-09-15` },
        { id: 'p3-4', name: 'Handover',  startDate: `${y}-09-16`, endDate: `${y}-09-30` },
      ],
    },
    {
      id: 'sow-4',
      name: 'Information Management (Orchestry)',
      shortName: 'Orchestry',
      bufferPct: 0.2,
      startDate: `${y}-05-01`,
      endDate:   `${y}-07-31`,
      color: '#fb923c',
      status: 'Active',
      projectCodes: ['Information Management', 'IntoWork - Orchestry', 'Orchestry'],
      // DM-2: IntoWork direct investment (licensing TBC, not included)
      budgetSources: [
        { id: 'bs-4-1', label: 'IntoWork Direct', amount: 52050, color: '#fb923c' },
      ],
      phases: [
        { id: 'p4-1', name: 'Discover',  startDate: `${y}-05-01`, endDate: `${y}-05-15` },
        { id: 'p4-2', name: 'Plan',      startDate: `${y}-05-16`, endDate: `${y}-05-31` },
        { id: 'p4-3', name: 'Deliver',   startDate: `${y}-06-01`, endDate: `${y}-07-15` },
        { id: 'p4-4', name: 'Handover',  startDate: `${y}-07-16`, endDate: `${y}-07-31` },
      ],
    },
  ],

  // ─── Resources ─────────────────────────────────────────────────────────────
  resources: [
    { id: 'r-1', name: 'Chris Densley',     initials: 'CDensley',     role: 'Senior Consultant',         hourlyRate: 215, active: true },
    { id: 'r-2', name: 'Tony Henderson',    initials: 'THenderson',   role: 'Senior Project Management', hourlyRate: 215, active: true },
    { id: 'r-3', name: 'Peter Varitimidis', initials: 'PVaritimidis', role: 'Senior Consultant',         hourlyRate: 215, active: true },
    { id: 'r-4', name: 'Ian Culliver',      initials: 'ICulliver',    role: 'Senior Consultant',         hourlyRate: 215, active: true },
    { id: 'r-5', name: 'Don Taylor',        initials: 'DTaylor',      role: 'Principal Consultant',      hourlyRate: 230, active: true },
  ],

  // ─── Allocations — DM-1: phase engagement model ────────────────────────────
  // No startDate/endDate — effective dates are derived from engagedPhases in CA-1.
  allocations: [
    // Chris: AC Maturity — PM + delivery lead, full program
    { id: 'a-1a', resourceId: 'r-1', sowId: 'sow-1a', daysPerWeek: 2, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Chris: AC Solutions — as-needs delivery, lighter from Deliver phase onwards
    { id: 'a-1b', resourceId: 'r-1', sowId: 'sow-1b', daysPerWeek: 1.5, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Chris: Shared Services — full program
    { id: 'a-2', resourceId: 'r-1', sowId: 'sow-2', daysPerWeek: 2, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Chris: Purview — coordination only
    { id: 'a-3', resourceId: 'r-1', sowId: 'sow-3', daysPerWeek: 0.5, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Tony: AC Maturity — PM from Plan onwards (joins end May)
    { id: 'a-4a', resourceId: 'r-2', sowId: 'sow-1a', daysPerWeek: 2, engagedPhases: ['Plan', 'Deliver', 'Handover'] },
    // Tony: AC Solutions — PM oversight from Deliver onwards
    { id: 'a-4b', resourceId: 'r-2', sowId: 'sow-1b', daysPerWeek: 1, engagedPhases: ['Deliver', 'Handover'] },
    // Tony: Shared Services — PM from Plan onwards
    { id: 'a-5', resourceId: 'r-2', sowId: 'sow-2', daysPerWeek: 2, engagedPhases: ['Plan', 'Deliver', 'Handover'] },
    // Peter: Purview — delivery lead, full engagement
    { id: 'a-6', resourceId: 'r-3', sowId: 'sow-3', daysPerWeek: 3, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Peter: Orchestry — crossover
    { id: 'a-7', resourceId: 'r-3', sowId: 'sow-4', daysPerWeek: 0.5, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Ian: Orchestry — delivery lead
    { id: 'a-8', resourceId: 'r-4', sowId: 'sow-4', daysPerWeek: 3, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
    // Don: AC Maturity — principal participation, TBC hours
    { id: 'a-9', resourceId: 'r-5', sowId: 'sow-1a', daysPerWeek: 1, engagedPhases: ['Discover', 'Plan', 'Deliver', 'Handover'] },
  ],

  timeEntries: [],
  pauses: [],

  // ─── Milestones — DM-3 ─────────────────────────────────────────────────────
  // sowId: null = program-level (full height on Gantt)
  // sowId: string = SOW-level (renders within that SOW row)
  milestones: [
    {
      id: 'm-1',
      sowId: null,
      label: 'Tony Henderson joins',
      date: `${y}-05-26`,
      color: '#38bdf8',
    },
    {
      id: 'm-2',
      sowId: null,
      label: 'MS approval checkpoint',
      date: `${y}-06-20`,
      color: '#fbbf24',
    },
    {
      id: 'm-3',
      sowId: null,
      label: 'MS funding deadline',
      date: `${y}-06-30`,
      color: '#f87171',
    },
    {
      id: 'm-4',
      sowId: 'sow-3',
      label: 'Purview kick-off',
      date: `${y}-05-01`,
      color: '#34d399',
    },
    {
      id: 'm-5',
      sowId: 'sow-4',
      label: 'Orchestry kick-off',
      date: `${y}-05-01`,
      color: '#fb923c',
    },
  ],

  // DM-4: Tasks — empty by default
  tasks: [],

  // DM-5: RAID — empty by default
  risks: [],
  issues: [],
  decisions: [],

  // DM-6: File repository — empty by default
  projectFiles: [],

  lastUpdated: new Date().toISOString(),
}