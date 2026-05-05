import dayjs from 'dayjs'
import isoWeek from 'dayjs/plugin/isoWeek'
import isBetween from 'dayjs/plugin/isBetween'
import { AppData, BurndownPoint, Milestone, Phase, Resource, ResourceAllocation, SOW } from '../types'

dayjs.extend(isoWeek)
dayjs.extend(isBetween)

// ─── CA-4: SOW total budget ───────────────────────────────────────────────────

/**
 * Compute total SOW budget from its budget sources.
 * Falls back to the deprecated sow.budget field for any pre-migration stored data.
 */
export function sowTotalBudget(sow: SOW): number {
  if (sow.budgetSources && sow.budgetSources.length > 0) {
    return sow.budgetSources.reduce((sum, s) => sum + s.amount, 0)
  }
  return sow.budget ?? 0
}

// ─── CA-1: Derived allocation dates ──────────────────────────────────────────

/**
 * Derive effective startDate and endDate for a resource allocation from the
 * phases the resource is engaged on. Returns the earliest phase start and
 * latest phase end across all engaged phases.
 *
 * Falls back to alloc.startDate / alloc.endDate for pre-DM-1 stored data where
 * engagedPhases may not yet be set.
 */
export function derivedAllocationDates(
  alloc: ResourceAllocation,
  sow: SOW,
): { startDate: string; endDate: string } {
  // Legacy fallback: pre-DM-1 allocations have explicit dates
  if (!alloc.engagedPhases || alloc.engagedPhases.length === 0) {
    return {
      startDate: alloc.startDate ?? sow.startDate,
      endDate:   alloc.endDate   ?? sow.endDate,
    }
  }

  const engaged = sow.phases.filter(p => alloc.engagedPhases.includes(p.name))

  if (engaged.length === 0) {
    // engagedPhases set but no matching phases found — fall back to SOW dates
    return { startDate: sow.startDate, endDate: sow.endDate }
  }

  const startDate = engaged
    .map(p => p.startDate)
    .sort()[0]

  const endDate = engaged
    .map(p => p.endDate)
    .sort()
    .reverse()[0]

  return { startDate, endDate }
}

// ─── CA-2: Current phase helper ───────────────────────────────────────────────

/**
 * Return the SOW phase that contains today, or null if today falls
 * outside the SOW range or between phases.
 */
export function getCurrentPhase(sow: SOW): Phase | null {
  const today = dayjs()
  return sow.phases.find(p =>
    today.isBetween(p.startDate, p.endDate, 'day', '[]')
  ) ?? null
}

/**
 * Return all phases that are still upcoming (start date in the future).
 */
export function getUpcomingPhases(sow: SOW): Phase[] {
  const today = dayjs()
  return sow.phases.filter(p => dayjs(p.startDate).isAfter(today))
}

/**
 * Return all phases that have already completed (end date in the past).
 */
export function getCompletedPhases(sow: SOW): Phase[] {
  const today = dayjs()
  return sow.phases.filter(p => dayjs(p.endDate).isBefore(today))
}

// ─── CA-3: SOW team members helper ───────────────────────────────────────────

/**
 * Return all resources that have at least one allocation against the given SOW.
 */
export function getSowTeamMembers(sowId: string, data: AppData): Resource[] {
  const resourceIds = new Set(
    data.allocations
      .filter(a => a.sowId === sowId)
      .map(a => a.resourceId)
  )
  return data.resources.filter(r => resourceIds.has(r.id))
}

/**
 * Return all SOWs a resource is allocated to.
 */
export function getResourceSOWs(resourceId: string, data: AppData): SOW[] {
  const sowIds = new Set(
    data.allocations
      .filter(a => a.resourceId === resourceId)
      .map(a => a.sowId)
  )
  return data.sows.filter(s => sowIds.has(s.id))
}

// ─── Working time helpers ─────────────────────────────────────────────────────

/**
 * Count approximate working weeks between two dates (Mon–Fri, 5/7 approximation).
 */
export function workingWeeksBetween(start: string, end: string): number {
  const days = dayjs(end).diff(dayjs(start), 'day') + 1
  return days / 7
}

/**
 * Forecast hours for a single allocation using derived dates from CA-1.
 */
export function allocationForecastHours(alloc: ResourceAllocation, sow: SOW): number {
  const { startDate, endDate } = derivedAllocationDates(alloc, sow)
  const weeks = workingWeeksBetween(startDate, endDate)
  return alloc.daysPerWeek * 8 * weeks
}

/**
 * Forecast cost for a single allocation.
 */
export function allocationForecastCost(
  alloc: ResourceAllocation,
  sow: SOW,
  resources: Resource[],
): number {
  const resource = resources.find(r => r.id === alloc.resourceId)
  if (!resource) return 0
  return allocationForecastHours(alloc, sow) * resource.hourlyRate
}

/**
 * Total forecast hours for a SOW across all its allocations.
 */
export function sowForecastHours(sowId: string, data: AppData): number {
  const sow = data.sows.find(s => s.id === sowId)
  if (!sow) return 0
  return data.allocations
    .filter(a => a.sowId === sowId)
    .reduce((sum, a) => sum + allocationForecastHours(a, sow), 0)
}

/**
 * Total forecast cost for a SOW.
 * Fixed-price SOWs: forecast = full contract value (sum of all milestone invoices).
 * T&M SOWs: forecast from resource allocations.
 */
export function sowForecastCost(sowId: string, data: AppData): number {
  const sow = data.sows.find(s => s.id === sowId)
  if (!sow) return 0
  if (sow.pricingType === 'fixed' && sow.milestoneInvoices?.length) {
    return sow.milestoneInvoices.reduce((sum, m) => sum + m.amount, 0)
  }
  return data.allocations
    .filter(a => a.sowId === sowId)
    .reduce((sum, a) => sum + allocationForecastCost(a, sow, data.resources), 0)
}

// ─── Actual cost helpers ──────────────────────────────────────────────────────

export function sowActualHours(sowId: string, data: AppData, billableOnly = true): number {
  return data.timeEntries
    .filter(e => e.sowId === sowId && (!billableOnly || e.billable === 'Billable'))
    .reduce((sum, e) => sum + e.hours, 0)
}

/**
 * Total actual cost for a SOW.
 * Fixed-price SOWs: actual = sum of completed milestone invoice amounts.
 * T&M SOWs: actual from time entries.
 */
export function sowActualCost(sowId: string, data: AppData, billableOnly = true): number {
  const sow = data.sows.find(s => s.id === sowId)
  if (sow?.pricingType === 'fixed' && sow?.milestoneInvoices?.length) {
    return sow.milestoneInvoices
      .filter(m => m.completed)
      .reduce((sum, m) => sum + m.amount, 0)
  }
  return data.timeEntries
    .filter(e => e.sowId === sowId && (!billableOnly || e.billable === 'Billable'))
    .reduce((sum, e) => sum + (e.resolvedCost ?? 0), 0)
}

/**
 * Actual cost broken down per budget source for a SOW.
 * Returns a map of budgetSourceId → actual cost drawn against that source.
 */
export function sowActualCostBySource(
  sowId: string,
  data: AppData,
): Record<string, number> {
  const result: Record<string, number> = {}
  data.timeEntries
    .filter(e => e.sowId === sowId && e.billable === 'Billable')
    .forEach(e => {
      const key = e.budgetSourceId ?? 'unassigned'
      result[key] = (result[key] ?? 0) + (e.resolvedCost ?? 0)
    })
  return result
}

// ─── Budget helpers (CA-4) ────────────────────────────────────────────────────

export function sowBudgetRemaining(sow: SOW, data: AppData): number {
  return sowTotalBudget(sow) - sowActualCost(sow.id, data)
}

export function sowBufferCostAmount(sow: SOW): number {
  return sowTotalBudget(sow) * sow.bufferPct
}

export function sowDeliverableBudget(sow: SOW): number {
  return sowTotalBudget(sow) * (1 - sow.bufferPct)
}

export function sowBufferConsumption(sow: SOW, data: AppData): number {
  const actual      = sowActualCost(sow.id, data)
  const deliverable = sowDeliverableBudget(sow)
  const buffer      = sowBufferCostAmount(sow)
  if (actual <= deliverable) return 0
  if (buffer === 0) return 1
  return Math.min((actual - deliverable) / buffer, 1)
}

// ─── Burndown series ──────────────────────────────────────────────────────────

/**
 * Generate weekly cost burndown points for a SOW.
 * For T&M SOWs: forecast from resource allocations, actuals from time entries.
 * For fixed-price SOWs: forecast is a step function at milestone invoice dates;
 * actuals step up when milestones are marked completed.
 */
export function generateBurndownSeries(sow: SOW, data: AppData): BurndownPoint[] {
  const points: BurndownPoint[] = []
  const budget      = sowTotalBudget(sow)
  const bufferFloor = sowDeliverableBudget(sow)

  let current = dayjs(sow.startDate).startOf('isoWeek')
  const end   = dayjs(sow.endDate).endOf('isoWeek')

  // ── Fixed-price path ────────────────────────────────────────────────────
  if (sow.pricingType === 'fixed' && sow.milestoneInvoices?.length) {
    const invoices = [...sow.milestoneInvoices].sort((a, b) => a.date.localeCompare(b.date))

    while (current.isBefore(end) || current.isSame(end, 'week')) {
      const weekEnd = current.add(6, 'day').format('YYYY-MM-DD')

      // Forecast: sum of all milestone amounts with planned date <= end of this week
      const forecastCumulative = invoices
        .filter(m => m.date <= weekEnd)
        .reduce((sum, m) => sum + m.amount, 0)

      // Actual: sum of completed milestone amounts with planned date <= end of this week
      const actualCumulative = invoices
        .filter(m => m.completed && m.date <= weekEnd)
        .reduce((sum, m) => sum + m.amount, 0)

      points.push({
        week:               current.format('MMM D'),
        date:               current.format('YYYY-MM-DD'),
        forecastCumulative: Math.round(forecastCumulative),
        actualCumulative:   Math.round(actualCumulative),
        budgetCeiling:      budget,
        bufferFloor:        Math.round(bufferFloor),
      })

      current = current.add(1, 'week')
    }
    return points
  }

  // ── T&M path ────────────────────────────────────────────────────────
  let forecastCumulative = 0
  let actualCumulative   = 0

  while (current.isBefore(end) || current.isSame(end, 'week')) {
    const weekStart = current.format('YYYY-MM-DD')
    const weekEnd   = current.add(4, 'day').format('YYYY-MM-DD')

    const forecastThisWeek = data.allocations
      .filter(a => a.sowId === sow.id)
      .reduce((sum, alloc) => {
        const { startDate, endDate } = derivedAllocationDates(alloc, sow)
        const allocStart = dayjs(startDate)
        const allocEnd   = dayjs(endDate)
        if (current.isAfter(allocEnd) || current.add(4, 'day').isBefore(allocStart)) return sum

        const effectiveStart = current.isBefore(allocStart) ? allocStart : current
        const effectiveEnd   = current.add(4, 'day').isAfter(allocEnd) ? allocEnd : current.add(4, 'day')
        const effectiveDays  = Math.max(0, effectiveEnd.diff(effectiveStart, 'day') + 1)
        const resource       = data.resources.find(r => r.id === alloc.resourceId)
        if (!resource) return sum
        return sum + (alloc.daysPerWeek / 5) * effectiveDays * 8 * resource.hourlyRate
      }, 0)

    forecastCumulative += forecastThisWeek

    const actualThisWeek = data.timeEntries
      .filter(e => e.sowId === sow.id && e.billable === 'Billable')
      .filter(e => dayjs(e.date).isBetween(weekStart, weekEnd, 'day', '[]'))
      .reduce((sum, e) => sum + (e.resolvedCost ?? 0), 0)

    actualCumulative += actualThisWeek

    points.push({
      week:               current.format('MMM D'),
      date:               weekStart,
      forecastCumulative: Math.round(forecastCumulative),
      actualCumulative:   Math.round(actualCumulative),
      budgetCeiling:      budget,
      bufferFloor:        Math.round(bufferFloor),
    })

    current = current.add(1, 'week')
  }

  return points
}

// ─── Program-level rollups ────────────────────────────────────────────────────

export interface ProgramSummary {
  totalBudget: number
  totalForecast: number
  totalActual: number
  totalRemaining: number
  bufferPoolTotal: number
  bufferConsumed: number
  bufferConsumptionPct: number
}

export function getProgramSummary(data: AppData): ProgramSummary {
  const totalBudget    = data.sows.reduce((s, sow) => s + sowTotalBudget(sow), 0)       // CA-4
  const totalForecast  = data.sows.reduce((s, sow) => s + sowForecastCost(sow.id, data), 0)
  const totalActual    = data.sows.reduce((s, sow) => s + sowActualCost(sow.id, data), 0)
  const totalRemaining = totalBudget - totalActual
  const bufferPoolTotal = data.sows.reduce((s, sow) => s + sowBufferCostAmount(sow), 0)
  const bufferConsumed  = data.sows.reduce((s, sow) => {
    const actual      = sowActualCost(sow.id, data)
    const deliverable = sowDeliverableBudget(sow)
    return s + Math.max(0, actual - deliverable)
  }, 0)
  const bufferConsumptionPct = bufferPoolTotal > 0 ? bufferConsumed / bufferPoolTotal : 0

  return {
    totalBudget, totalForecast, totalActual, totalRemaining,
    bufferPoolTotal, bufferConsumed, bufferConsumptionPct,
  }
}

// ─── Gantt / timeline helpers ─────────────────────────────────────────────────

export function monthsBetween(start: string, end: string): string[] {
  const months: string[] = []
  let current    = dayjs(start).startOf('month')
  const endMonth = dayjs(end).startOf('month')
  while (current.isBefore(endMonth) || current.isSame(endMonth, 'month')) {
    months.push(current.format('YYYY-MM'))
    current = current.add(1, 'month')
  }
  return months
}

export function dateToMonthOffset(date: string, programStart: string): number {
  const d     = dayjs(date)
  const start = dayjs(programStart).startOf('month')
  return d.diff(start, 'month', true)
}

/**
 * Return upcoming program-level and SOW-level milestones sorted by date.
 * Pass sowId to filter to a specific SOW plus program-level milestones.
 */
export function getUpcomingMilestones(
  data: AppData,
  sowId?: string,
): Milestone[] {
  const today = dayjs()
  return data.milestones
    .filter(m => {
      if (dayjs(m.date).isBefore(today)) return false
      if (sowId) return m.sowId === null || m.sowId === sowId
      return true
    })
    .sort((a, b) => a.date.localeCompare(b.date))
}
