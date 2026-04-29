import Papa from 'papaparse'
import { v4 as uuidv4 } from 'uuid'
import { TimeEntry, SOW, Resource, CW_WORK_ROLE_MAP, ROLE_RATES } from '../types'

// ─── Column map ───────────────────────────────────────────────────────────────
// Maps logical field names to the actual column headers in the CSV.
// Allows any CSV export format to be used without modifying the parser.
export interface ColumnMap {
  date:     string   // default: 'Date'
  member:   string   // default: 'Member'
  company:  string   // default: 'Company'
  project:  string   // default: 'Project'
  hours:    string   // default: 'Hours'
  workRole: string   // default: 'Work Role'
  billable: string   // default: 'Billable'
  notes:    string   // default: 'Notes'
  status:   string   // default: 'Status'
}

export const DEFAULT_COLUMN_MAP: ColumnMap = {
  date:     'Date',
  member:   'Member',
  company:  'Company',
  project:  'Project',
  hours:    'Hours',
  workRole: 'Work Role',
  billable: 'Billable',
  notes:    'Notes',
  status:   'Status',
}

/**
 * Parse only the header row from a CSV string to discover available columns.
 */
export function parseCSVHeaders(csvText: string): string[] {
  const result = Papa.parse<string[]>(csvText, { preview: 1 })
  return (result.data[0] ?? []).map(h => h.trim()).filter(Boolean)
}

/**
 * Auto-detect column mappings by fuzzy-matching available headers against
 * known field names. Returns a best-guess ColumnMap the user can adjust.
 */
export function detectColumnMap(headers: string[]): ColumnMap {
  const h = headers.map(x => x.toLowerCase())

  function best(candidates: string[]): string {
    for (const c of candidates) {
      const found = headers.find((_, i) => h[i] === c.toLowerCase())
      if (found) return found
    }
    // Partial match fallback
    for (const c of candidates) {
      const found = headers.find((_, i) => h[i].includes(c.toLowerCase()))
      if (found) return found
    }
    return candidates[0] // default even if not found
  }

  return {
    date:     best(['date', 'entry date', 'time date']),
    member:   best(['member', 'consultant', 'resource', 'user', 'staff']),
    company:  best(['company', 'client', 'organisation', 'customer']),
    project:  best(['project', 'sow', 'engagement', 'work order']),
    hours:    best(['hours', 'duration', 'quantity', 'time']),
    workRole: best(['work role', 'role', 'position', 'work type', 'grade']),
    billable: best(['billable', 'bill type', 'charge type', 'invoiceable']),
    notes:    best(['notes', 'description', 'detail', 'comment', 'summary']),
    status:   best(['status', 'state', 'approval']),
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(raw: string): string {
  if (!raw) return ''
  // Try DD/MM/YYYY H:MM (ConnectWise default)
  const cwMatch = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (cwMatch) {
    const [, d, m, y] = cwMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Try YYYY-MM-DD (ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(raw.trim())) return raw.trim().slice(0, 10)
  // Try MM/DD/YYYY (US format)
  const usMatch = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (usMatch) {
    const [, m, d, y] = usMatch
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return raw.trim().slice(0, 10)
}

function resolveSowId(project: string, sows: SOW[]): string | undefined {
  const norm = (s: string) => s.toLowerCase().trim()
  for (const sow of sows) {
    for (const code of sow.projectCodes) {
      if (norm(project).includes(norm(code)) || norm(code).includes(norm(project))) {
        return sow.id
      }
    }
  }
  return undefined
}

function resolveRate(workRole: string, member: string, resources: Resource[]): number | undefined {
  const resource = resources.find(r => r.initials.toLowerCase() === member.toLowerCase())
  if (resource) return resource.hourlyRate
  const roleKey = CW_WORK_ROLE_MAP[workRole]
  if (roleKey) return ROLE_RATES[roleKey]
  return undefined
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function parseConnectWiseCSV(
  csvText:       string,
  sows:          SOW[],
  resources:     Resource[],
  filterCompany?: string,
  columnMap:     ColumnMap = DEFAULT_COLUMN_MAP,
): { entries: TimeEntry[]; errors: string[] } {
  const errors:  string[]    = []
  const entries: TimeEntry[] = []

  const result = Papa.parse<Record<string, string>>(csvText, {
    header:        true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  })

  const cm = columnMap

  for (const row of result.data) {
    try {
      const company  = row[cm.company]?.trim() ?? ''
      const member   = row[cm.member]?.trim()  ?? ''
      const project  = row[cm.project]?.trim() ?? ''
      const rawHours = row[cm.hours]?.trim()   ?? ''
      const workRole = row[cm.workRole]?.trim() ?? ''
      const rawBill  = row[cm.billable]?.trim() ?? ''
      const rawDate  = row[cm.date]?.trim()     ?? ''
      const notes    = row[cm.notes]?.trim()    ?? ''
      const status   = row[cm.status]?.trim()   ?? ''

      if (filterCompany && company.toLowerCase() !== filterCompany.toLowerCase()) continue

      const hours = parseFloat(rawHours)
      if (isNaN(hours) || hours <= 0) continue

      const billable: TimeEntry['billable'] =
        rawBill === 'Billable' ? 'Billable'
        : rawBill === 'No Charge' ? 'No Charge'
        : 'Non-Billable'

      const sowId        = resolveSowId(project, sows)
      const resolvedRate = resolveRate(workRole, member, resources)
      const resolvedCost = resolvedRate != null ? hours * resolvedRate : undefined

      entries.push({
        id:           uuidv4(),
        date:         parseDate(rawDate),
        member,
        company,
        project,
        sowId,
        hours,
        notes,
        status,
        billable,
        workRole,
        workType:     row['Work Type']?.trim() ?? '',
        resolvedRate,
        resolvedCost,
      })
    } catch {
      errors.push(`Row parse error: ${JSON.stringify(row)}`)
    }
  }

  return { entries, errors }
}

export function deduplicateEntries(existing: TimeEntry[], incoming: TimeEntry[]): TimeEntry[] {
  const key = (e: TimeEntry) => `${e.date}|${e.member}|${e.hours}|${e.notes.slice(0, 30)}`
  const existingKeys = new Set(existing.map(key))
  return [...existing, ...incoming.filter(e => !existingKeys.has(key(e)))]
}
