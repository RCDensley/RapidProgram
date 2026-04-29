// ─── Rate card ───────────────────────────────────────────────────────────────
export type RoleKey =
  | 'Consultant'
  | 'Senior Consultant'
  | 'Senior Project Management'
  | 'Project Manager'
  | 'Principal Consultant'
  | 'Architect/Strategic'
  | 'Business Lead'
  | 'CTO'

export const ROLE_RATES: Record<RoleKey, number> = {
  'Consultant': 195,
  'Senior Consultant': 215,
  'Senior Project Management': 215,
  'Project Manager': 195,
  'Principal Consultant': 230,
  'Architect/Strategic': 250,
  'Business Lead': 250,
  'CTO': 285,
}

export const ALL_ROLES: RoleKey[] = Object.keys(ROLE_RATES) as RoleKey[]

// Maps ConnectWise "Work Role" strings to our RoleKey
export const CW_WORK_ROLE_MAP: Record<string, RoleKey> = {
  'SFIA L2 (Assist) - Project Support Officer': 'Consultant',
  'SFIA L3 (Apply) - Consultant': 'Consultant',
  'SFIA L3 (Apply) - Senior Cloud Engineer': 'Consultant',
  'SFIA L4 (Enable) - Senior Consultant': 'Senior Consultant',
  'SFIA L4 (Enable) - Project Manager': 'Project Manager',
  'SFIA L5 (Ensure/Advise) - Senior Project Manager': 'Senior Project Management',
  'SFIA L5 (Ensure/Advise) - Principal Consultant': 'Principal Consultant',
  'SFIA L6 - Architect': 'Architect/Strategic',
  'SFIA L6 - Strategic Advisor': 'Architect/Strategic',
}

// ─── Phases ──────────────────────────────────────────────────────────────────
export type PhaseName = 'Discover' | 'Plan' | 'Deliver' | 'Handover'

export const PHASE_COLORS: Record<PhaseName, string> = {
  Discover: '#38bdf8',
  Plan:     '#a78bfa',
  Deliver:  '#34d399',
  Handover: '#fb923c',
}

export const ALL_PHASES: PhaseName[] = ['Discover', 'Plan', 'Deliver', 'Handover']

export interface Phase {
  id: string
  name: PhaseName
  startDate: string   // YYYY-MM-DD
  endDate: string     // YYYY-MM-DD
}

// ─── DM-2: Budget sources ─────────────────────────────────────────────────────
// Each SOW can have one or more named funding sources.
// The SOW total budget = sum(budgetSources.map(s => s.amount)).
export interface BudgetSource {
  id: string
  label: string    // e.g. 'Microsoft MCI', 'RC Co-invest', 'IntoWork Direct'
  amount: number   // ex GST
  color: string    // hex — used for stacked bar charts on Dashboard
}

// ─── SOW / Project ───────────────────────────────────────────────────────────
export interface SOW {
  id: string
  name: string
  shortName: string
  // DM-2: budget is now computed from budgetSources — kept here as a fallback
  // for any stored data that predates the migration. Use sowTotalBudget() everywhere.
  /** @deprecated Use sowTotalBudget(sow) from calculations.ts */
  budget?: number
  budgetSources: BudgetSource[]
  bufferPct: number     // 0.2 = 20%
  startDate: string     // YYYY-MM-DD
  endDate: string       // YYYY-MM-DD
  color: string
  phases: Phase[]
  projectCodes: string[]
  status: 'Active' | 'Awaiting Signature' | 'Complete' | 'Pipeline'
}

// ─── Resource ────────────────────────────────────────────────────────────────
export interface Resource {
  id: string
  name: string
  initials: string    // ConnectWise Member field value, e.g. 'CDensley'
  role: RoleKey
  hourlyRate: number
  active: boolean
}

// ─── DM-1: Resource Allocation (phase engagement model) ──────────────────────
// Resources are allocated by phase rather than by explicit date range.
// Effective startDate/endDate are derived in calculations.ts via derivedAllocationDates().
export interface ResourceAllocation {
  id: string
  resourceId: string
  sowId: string
  daysPerWeek: number
  engagedPhases: PhaseName[]  // which phases this resource is engaged on
  notes?: string
  // These fields are kept optional for backward compatibility with any
  // stored data predating DM-1. CA-1 will derive these instead.
  /** @deprecated Derived from engagedPhases via derivedAllocationDates() */
  startDate?: string
  /** @deprecated Derived from engagedPhases via derivedAllocationDates() */
  endDate?: string
}

// ─── Time Entry (from ConnectWise CSV) ───────────────────────────────────────
export interface TimeEntry {
  id: string
  date: string
  member: string
  company: string
  project: string
  sowId?: string
  budgetSourceId?: string   // DM-2: which budget source this entry draws from
  hours: number
  notes: string
  status: string
  billable: 'Billable' | 'No Charge' | 'Non-Billable'
  workRole: string
  workType: string
  resolvedRate?: number
  resolvedCost?: number
}

// ─── Burndown data point ─────────────────────────────────────────────────────
export interface BurndownPoint {
  week: string
  date: string
  forecastCumulative: number
  actualCumulative: number
  budgetCeiling: number
  bufferFloor: number
}

// ─── Pause / wait block ──────────────────────────────────────────────────────
export interface PauseBlock {
  id: string
  sowId: string
  label: string
  startDate: string
  endDate: string
}

// ─── DM-3: Milestone ─────────────────────────────────────────────────────────
// sowId: null  = program-level milestone, renders full-height on the Gantt
// sowId: string = SOW-level milestone, renders within that SOW row only
export interface Milestone {
  id: string
  sowId: string | null
  label: string
  date: string    // YYYY-MM-DD
  color: string   // hex
}

// ─── App state (persisted to Azure Blob) ─────────────────────────────────────
export interface AppData {
  sows: SOW[]
  resources: Resource[]
  allocations: ResourceAllocation[]
  timeEntries: TimeEntry[]
  pauses: PauseBlock[]
  milestones: Milestone[]   // DM-3
  lastUpdated: string
}
