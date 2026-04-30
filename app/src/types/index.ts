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

// ─── DM-4: Tasks ─────────────────────────────────────────────────────────────
export type TaskBucket    = 'today' | 'this-week' | 'this-month' | 'backlog'
export type TaskPriority  = 'low' | 'medium' | 'high'
export type TaskEffortUnit = 'hours' | 'days' | 'weeks'
export type RecurrenceType = 'daily' | 'weekly' | 'monthly'

export interface TaskLink {
  id: string
  label: string
  url: string
}

export interface TaskComment {
  id: string
  text: string
  timestamp: string
}

export interface TaskRecurrence {
  type: RecurrenceType
  interval: number   // e.g. every 2 weeks
}

export interface Task {
  id: string
  title: string
  description: string
  sowId: string | null           // null = program-level
  bucket: TaskBucket
  priority: TaskPriority
  effort: { value: number; unit: TaskEffortUnit }
  recurrence: TaskRecurrence | null
  links: TaskLink[]
  comments: TaskComment[]
  completedAt?: string
  createdAt: string
  order: number                  // sort order within bucket
}

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low:    '#34d399',
  medium: '#fbbf24',
  high:   '#f87171',
}

export const BUCKET_LABELS: Record<TaskBucket, string> = {
  'today':      'Today',
  'this-week':  'This Week',
  'this-month': 'This Month',
  'backlog':    'Backlog',
}

// ─── DM-5: RAID ───────────────────────────────────────────────────────────────
export type RiskStatus   = 'Open' | 'Mitigated' | 'Closed'
export type IssueStatus  = 'Open' | 'In Progress' | 'Resolved'
export type IssueImpact  = 'Low' | 'Medium' | 'High' | 'Critical'
export type RaidHistoryType = 'comment' | 'status_change' | 'score_change'

export interface RaidHistoryEntry {
  id: string
  timestamp: string
  type: RaidHistoryType
  text: string
}

export interface Risk {
  id: string
  sowId: string | null
  title: string
  description: string
  likelihood: 1 | 2 | 3 | 4 | 5   // 1=Rare … 5=Almost Certain
  impact: 1 | 2 | 3 | 4 | 5        // 1=Negligible … 5=Critical
  // score = likelihood × impact (always computed, never stored directly)
  status: RiskStatus
  mitigation?: string
  mitigationScore?: number          // 1–25, subtracted from score for residual
  // residualScore = max(0, score - mitigationScore) — computed
  owner: string
  history: RaidHistoryEntry[]
  promotedToIssueId?: string
  createdAt: string
}

export interface Issue {
  id: string
  sowId: string | null
  title: string
  description: string
  impact: IssueImpact
  status: IssueStatus
  owner: string
  raisedFromRiskId?: string         // set if promoted from a Risk
  createdAt: string
}

export interface Decision {
  id: string
  sowId: string | null
  title: string
  description: string
  rationale: string
  decidedBy: string
  date: string
}

export const ISSUE_IMPACT_COLORS: Record<IssueImpact, string> = {
  Low:      '#34d399',
  Medium:   '#fbbf24',
  High:     '#fb923c',
  Critical: '#f87171',
}

// Risk score helpers
export function riskScore(r: Pick<Risk, 'likelihood' | 'impact'>): number {
  return r.likelihood * r.impact
}
export function riskResidualScore(r: Risk): number {
  return Math.max(0, riskScore(r) - (r.mitigationScore ?? 0))
}
export function riskScoreColor(score: number): string {
  if (score <= 4)  return '#34d399'   // green
  if (score <= 9)  return '#86efac'   // light green
  if (score <= 14) return '#fbbf24'   // amber
  if (score <= 19) return '#fb923c'   // orange
  return '#f87171'                     // red
}

// ─── DM-6: File repository ────────────────────────────────────────────────────
export type FileClassificationStatus = 'pending' | 'classified' | 'failed'

export interface ProjectFile {
  id: string
  name: string                       // original filename
  storageName: string                // blob key in pmtracking-files container
  sowId: string | null               // AI-classified SOW association
  folder: string                     // AI-classified path e.g. 'Purview/Meeting Notes'
  size: number                       // bytes
  uploadedAt: string
  classifiedAt?: string
  mimeType: string
  description?: string               // AI-generated one-line summary
  classificationStatus: FileClassificationStatus
}

// ─── App state (persisted to Azure Blob) ─────────────────────────────────────
export interface AppData {
  sows: SOW[]
  resources: Resource[]
  allocations: ResourceAllocation[]
  timeEntries: TimeEntry[]
  pauses: PauseBlock[]
  milestones: Milestone[]
  tasks: Task[]              // DM-4
  risks: Risk[]              // DM-5
  issues: Issue[]            // DM-5
  decisions: Decision[]      // DM-5
  projectFiles: ProjectFile[] // DM-6
  lastUpdated: string
}
