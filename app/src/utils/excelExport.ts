import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { AppData, riskScore, riskResidualScore } from '../types'
import {
  sowTotalBudget, sowActualCost, sowForecastCost,
  sowBufferCostAmount, derivedAllocationDates,
} from './calculations'

// ─── Sheet builders ──────────────────────────────────────────────────────────
// Each builder returns an array of plain objects. Keys = column headers.
// Order of keys in the FIRST row determines column order in Excel.

function buildSummary(data: AppData) {
  const totals = {
    totalBudget:   data.sows.reduce((s, sow) => s + sowTotalBudget(sow), 0),
    totalForecast: data.sows.reduce((s, sow) => s + sowForecastCost(sow.id, data, true), 0),
    totalActual:   data.sows.reduce((s, sow) => s + sowActualCost(sow.id, data, true, true), 0),
  }
  return [
    { Metric: 'Export date',          Value: dayjs().format('YYYY-MM-DD HH:mm') },
    { Metric: 'Total SOWs',           Value: data.sows.length },
    { Metric: 'Total budget (AUD)',   Value: totals.totalBudget },
    { Metric: 'Forecast spend (AUD)', Value: totals.totalForecast },
    { Metric: 'Actual spend (AUD)',   Value: totals.totalActual },
    { Metric: 'Active resources',     Value: data.resources.filter(r => r.active).length },
    { Metric: 'Open tasks',           Value: data.tasks.filter(t => t.status !== 'Done').length },
    { Metric: 'Open risks',           Value: data.risks.filter(r => r.status === 'Open').length },
    { Metric: 'Open issues',          Value: data.issues.filter(i => i.status !== 'Resolved').length },
    { Metric: 'Decisions logged',     Value: data.decisions.length },
    { Metric: 'Timesheet entries',    Value: data.timeEntries.length },
  ]
}

function buildSOWs(data: AppData) {
  return data.sows.map(sow => ({
    ID:            sow.id,
    Name:          sow.name,
    'Short name':  sow.shortName,
    Status:        sow.status,
    'Pricing':     sow.pricingType ?? 'tm',
    'Start':       sow.startDate,
    'End':         sow.endDate,
    'Total budget (AUD)':   sowTotalBudget(sow),
    'Forecast (AUD)':       Math.round(sowForecastCost(sow.id, data)),
    'Actual (AUD)':         Math.round(sowActualCost(sow.id, data)),
    'Buffer pct':           sow.bufferPct,
    'Buffer pool (AUD)':    Math.round(sowBufferCostAmount(sow)),
    'Project codes':        (sow.projectCodes ?? []).join(', '),
  }))
}

function buildPhases(data: AppData) {
  const rows: any[] = []
  for (const sow of data.sows) {
    for (const phase of (sow.phases ?? [])) {
      const criteria = phase.criteria ?? []
      rows.push({
        'SOW':           sow.shortName,
        'Phase':         phase.name,
        'Start':         phase.startDate,
        'End':           phase.endDate,
        'Criteria done': `${criteria.filter(c => c.done).length}/${criteria.length}`,
        'Criteria':      criteria.map(c => `${c.done ? '✓' : '○'} ${c.text}`).join('\n'),
      })
    }
  }
  return rows
}

function buildMilestones(data: AppData) {
  return data.milestones.map(m => ({
    'SOW':   m.sowId ? data.sows.find(s => s.id === m.sowId)?.shortName ?? m.sowId : 'Program-level',
    'Date':  m.date,
    'Label': m.label,
  }))
}

function buildMilestoneInvoices(data: AppData) {
  const rows: any[] = []
  for (const sow of data.sows) {
    for (const m of (sow.milestoneInvoices ?? [])) {
      rows.push({
        'SOW':             sow.shortName,
        'Label':           m.label,
        'Amount (AUD)':    m.amount,
        'Planned date':    m.date,
        'Invoiced':        m.completed ? 'Yes' : 'No',
        'Actual date':     m.completedDate ?? '',
      })
    }
  }
  return rows
}

function buildBudgetSources(data: AppData) {
  const rows: any[] = []
  for (const sow of data.sows) {
    for (const src of (sow.budgetSources ?? [])) {
      rows.push({
        'SOW':            sow.shortName,
        'Source label':   src.label,
        'Amount (AUD)':   src.amount,
        'Service #s':     (src.serviceNumbers ?? []).join(', '),
      })
    }
  }
  return rows
}

function buildResources(data: AppData) {
  return data.resources.map(r => ({
    Name:         r.name,
    Initials:     r.initials,
    Role:         r.role,
    'Rate (AUD/hr)': r.hourlyRate,
    Active:       r.active ? 'Yes' : 'No',
  }))
}

function buildAllocations(data: AppData) {
  return data.allocations.map(alloc => {
    const sow      = data.sows.find(s => s.id === alloc.sowId)
    const resource = data.resources.find(r => r.id === alloc.resourceId)
    const dates    = sow ? derivedAllocationDates(alloc, sow) : { startDate: '', endDate: '' }
    return {
      'Resource':       resource?.name ?? alloc.resourceId,
      'SOW':            sow?.shortName ?? alloc.sowId,
      'Days/week':      alloc.daysPerWeek,
      'Engaged phases': (alloc.engagedPhases ?? []).join(', '),
      'Start':          dates.startDate,
      'End':            dates.endDate,
      'Notes':          alloc.notes ?? '',
    }
  })
}

function buildTasks(data: AppData) {
  return data.tasks.map(t => ({
    'SOW':         t.sowId ? data.sows.find(s => s.id === t.sowId)?.shortName ?? t.sowId : 'Program-level',
    'Bucket':      t.bucket,
    'Status':      t.status,
    'Priority':    t.priority,
    'Title':       t.title,
    'Description': t.description,
    'Effort':      `${t.effort.value} ${t.effort.unit}`,
    'Recurrence':  t.recurrence ? `every ${t.recurrence.interval} ${t.recurrence.type}` : '',
    'Created':     t.createdAt?.slice(0, 10),
    'Completed':   t.completedAt?.slice(0, 10) ?? '',
    'Comments':    (t.comments ?? []).map(c => `${c.timestamp.slice(0, 10)}: ${c.text}`).join('\n'),
    'Links':       (t.links ?? []).map(l => `${l.label}: ${l.url}`).join('\n'),
  }))
}

function buildRisks(data: AppData) {
  return data.risks.map(r => ({
    'SOW':            r.sowId ? data.sows.find(s => s.id === r.sowId)?.shortName ?? r.sowId : 'Program-level',
    'Title':          r.title,
    'Description':    r.description,
    'Status':         r.status,
    'Likelihood':     r.likelihood,
    'Impact':         r.impact,
    'Score':          riskScore(r),
    'Mitigation':     r.mitigation ?? '',
    'Mitigation effectiveness': r.mitigationScore ?? '',
    'Residual score': riskResidualScore(r),
    'Owner':          r.owner,
    'Created':        r.createdAt?.slice(0, 10),
    'Promoted to':    r.promotedToIssueId ?? '',
    'History':        (r.history ?? []).map(h => `${h.timestamp.slice(0, 16).replace('T', ' ')}: [${h.type}] ${h.text}`).join('\n'),
  }))
}

function buildIssues(data: AppData) {
  return data.issues.map(i => ({
    'SOW':         i.sowId ? data.sows.find(s => s.id === i.sowId)?.shortName ?? i.sowId : 'Program-level',
    'Title':       i.title,
    'Description': i.description,
    'Impact':      i.impact,
    'Status':      i.status,
    'Owner':       i.owner,
    'From risk':   i.raisedFromRiskId ?? '',
    'Created':     i.createdAt?.slice(0, 10),
    'History':     (i.history ?? []).map(h => `${h.timestamp.slice(0, 16).replace('T', ' ')}: [${h.type}] ${h.text}`).join('\n'),
  }))
}

function buildDecisions(data: AppData) {
  return data.decisions.map(d => ({
    'SOW':         d.sowId ? data.sows.find(s => s.id === d.sowId)?.shortName ?? d.sowId : 'Program-level',
    'Date':        d.date,
    'Title':       d.title,
    'Description': d.description,
    'Rationale':   d.rationale,
    'Decided by':  d.decidedBy,
  }))
}

function buildTimesheets(data: AppData) {
  return data.timeEntries.map(e => {
    const sow    = data.sows.find(s => s.id === e.sowId)
    const source = sow?.budgetSources?.find(b => b.id === e.budgetSourceId)
    return {
      'Date':           e.date,
      'Member':         e.member,
      'SOW':            sow?.shortName ?? '',
      'Budget source':  source?.label ?? '',
      'Service #':      e.serviceNumber ?? '',
      'Hours':          e.hours,
      'Rate (AUD/hr)':  e.resolvedRate ?? '',
      'Cost (AUD)':     e.resolvedCost ?? '',
      'Billable':       e.billable,
      'Work role':      e.workRole,
      'Notes':          e.notes,
    }
  })
}

// ─── Workbook assembly ───────────────────────────────────────────────────────

const SHEETS: { name: string; build: (d: AppData) => any[] }[] = [
  { name: 'Summary',            build: buildSummary },
  { name: 'SOWs',               build: buildSOWs },
  { name: 'Phases',             build: buildPhases },
  { name: 'Milestones',         build: buildMilestones },
  { name: 'Milestone Invoices', build: buildMilestoneInvoices },
  { name: 'Budget Sources',     build: buildBudgetSources },
  { name: 'Resources',          build: buildResources },
  { name: 'Allocations',        build: buildAllocations },
  { name: 'Tasks',              build: buildTasks },
  { name: 'Risks',              build: buildRisks },
  { name: 'Issues',             build: buildIssues },
  { name: 'Decisions',          build: buildDecisions },
  { name: 'Timesheets',         build: buildTimesheets },
]

export function exportToExcel(data: AppData): void {
  const wb = XLSX.utils.book_new()

  for (const { name, build } of SHEETS) {
    const rows = build(data)
    // Always create the sheet, even if empty — gives the recipient a stable shape.
    const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ '(no data)': '' }])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const filename = `pmtracker-export-${dayjs().format('YYYY-MM-DD-HHmm')}.xlsx`
  XLSX.writeFile(wb, filename)
}
