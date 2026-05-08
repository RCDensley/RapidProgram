import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { useApp } from '../App'
import {
  sowTotalBudget, sowActualCost, generateBurndownSeries, getUpcomingMilestones,
} from '../utils/calculations'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import {
  Plus, Loader2, Printer, Save, RefreshCw, Trash2,
  ShieldAlert, AlertOctagon, Lightbulb,
} from 'lucide-react'
import dayjs from 'dayjs'
import {
  AppData, SavedReport, BudgetSnapshot, RagStatus,
  riskScore, ISSUE_IMPACT_COLORS,
} from '../types'

// ─── Local types ──────────────────────────────────────────────────────────────
type RagDimension = 'overall' | 'timeline' | 'budget' | 'scope' | 'resources'

const RAG_DIMS: { key: RagDimension; label: string }[] = [
  { key: 'overall',   label: 'Overall' },
  { key: 'timeline',  label: 'Timeline' },
  { key: 'budget',    label: 'Budget' },
  { key: 'scope',     label: 'Scope' },
  { key: 'resources', label: 'Resources' },
]

const RAG_COLOR: Record<RagStatus, string> = { R: '#ef4444', A: '#f59e0b', G: '#22c55e' }
const RAG_LABEL: Record<RagStatus, string> = { R: 'Red', A: 'Amber', G: 'Green' }

interface ReportDraft {
  title: string
  periodFrom: string
  periodTo: string
  ragStatus: Record<RagDimension, RagStatus>
  ragComments: Record<string, string>
  recentActivity: string
  upcomingActivities: string
  selectedRiskIds: Set<string>
  selectedIssueIds: Set<string>
  selectedDecisionIds: Set<string>
}

function makeDefaultDraft(data: AppData): ReportDraft {
  return {
    title: `Program Status Report — ${dayjs().format('D MMMM YYYY')}`,
    periodFrom: dayjs().subtract(7, 'day').format('YYYY-MM-DD'),
    periodTo:   dayjs().add(7, 'day').format('YYYY-MM-DD'),
    ragStatus:  { overall: 'G', timeline: 'G', budget: 'G', scope: 'G', resources: 'G' },
    ragComments: { overall: '', timeline: '', budget: '', scope: '', resources: '' },
    recentActivity: '',
    upcomingActivities: '',
    selectedRiskIds: new Set(
      data.risks.filter(r => r.status !== 'Closed' && riskScore(r) >= 9).map(r => r.id)
    ),
    selectedIssueIds: new Set(
      data.issues
        .filter(i => i.status !== 'Resolved' && (i.impact === 'High' || i.impact === 'Critical'))
        .map(i => i.id)
    ),
    selectedDecisionIds: new Set(data.decisions.map(d => d.id)),
  }
}

function computeBudgetSnapshot(data: AppData): BudgetSnapshot[] {
  return data.sows.map(sow => {
    const totalBudget = sowTotalBudget(sow)
    const spent       = sowActualCost(sow.id, data)
    return {
      sowId:       sow.id,
      sowName:     sow.shortName,
      totalBudget,
      spent,
      remaining:   totalBudget - spent,
      percentUsed: totalBudget > 0 ? Math.round((spent / totalBudget) * 100) : 0,
    }
  })
}

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

// ─── RAG Picker ───────────────────────────────────────────────────────────────
function RagPicker({ value, onChange, disabled }: {
  value: RagStatus; onChange?: (v: RagStatus) => void; disabled?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {(['R', 'A', 'G'] as RagStatus[]).map(s => (
        <button
          key={s}
          onClick={() => onChange?.(s)}
          disabled={disabled}
          style={{
            width: 28, height: 22, borderRadius: 4,
            border: `1.5px solid ${value === s ? RAG_COLOR[s] : 'var(--border)'}`,
            background: value === s ? RAG_COLOR[s] + '33' : 'transparent',
            color: value === s ? RAG_COLOR[s] : 'var(--text-3)',
            fontSize: 10, fontWeight: 800,
            cursor: disabled ? 'default' : 'pointer',
            fontFamily: 'var(--font-main)',
            transition: 'all 0.12s',
          }}
        >{s}</button>
      ))}
    </div>
  )
}

// ─── RAG Badge (always visible, used for print) ───────────────────────────────
function RagBadge({ value }: { value: RagStatus }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: 4,
      background: RAG_COLOR[value] + '22',
      color: RAG_COLOR[value],
      fontWeight: 800, fontSize: 11,
      border: `1px solid ${RAG_COLOR[value]}55`,
    }}>{RAG_LABEL[value]}</span>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="report-section" style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: 'var(--text-3)', marginBottom: 10, paddingBottom: 6,
        borderBottom: '1px solid var(--border)',
      }}>{title}</div>
      {children}
    </div>
  )
}

// ─── Budget Table ─────────────────────────────────────────────────────────────
function BudgetTable({ snapshot }: { snapshot: BudgetSnapshot[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          {['SOW', 'Budget', 'Spent', 'Remaining', '% Used'].map(h => (
            <th key={h} style={{
              textAlign: h === 'SOW' ? 'left' : 'right',
              padding: '5px 8px', color: 'var(--text-3)', fontWeight: 700, fontSize: 10,
              borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {snapshot.map(row => {
          const warn = row.percentUsed >= 90
          return (
            <tr key={row.sowId}>
              <td style={{ padding: '6px 8px', fontWeight: 700, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>{row.sowName}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{fmt(row.totalBudget)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{fmt(row.spent)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', color: warn ? 'var(--red)' : 'var(--emerald)', borderBottom: '1px solid var(--border)' }}>{fmt(row.remaining)}</td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 800, color: warn ? 'var(--red)' : 'var(--text-2)', borderBottom: '1px solid var(--border)' }}>{row.percentUsed}%</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── Mini Burndown Chart ──────────────────────────────────────────────────────
function MiniChart({ sowId, sowName, sowColor, data }: {
  sowId: string; sowName: string; sowColor: string; data: AppData
}) {
  const sow = data.sows.find(s => s.id === sowId)
  if (!sow) return null
  const series = generateBurndownSeries(sow, data)
  if (series.length === 0) return null

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: sowColor, marginBottom: 6 }}>{sowName}</div>
      <div style={{ height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`rfg-${sowId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={sowColor} stopOpacity={0.3} />
                <stop offset="95%" stopColor={sowColor} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'var(--text-3)' }} interval="preserveStartEnd" />
            <YAxis
              tick={{ fontSize: 9, fill: 'var(--text-3)' }}
              tickFormatter={v => `$${Math.round(v / 1000)}k`}
              width={40}
            />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11 }}
              formatter={(v: number) => [fmt(v)]}
            />
            <ReferenceLine y={series[0]?.budgetCeiling} stroke="var(--red)"   strokeDasharray="4 2" strokeWidth={1} />
            <ReferenceLine y={series[0]?.bufferFloor}   stroke="var(--amber)" strokeDasharray="4 2" strokeWidth={1} />
            <Area
              type="monotone" dataKey="forecastCumulative"
              stroke={sowColor} strokeWidth={1.5}
              fill={`url(#rfg-${sowId})`} dot={false} name="Forecast"
            />
            <Area
              type="monotone" dataKey="actualCumulative"
              stroke="var(--emerald)" strokeWidth={2}
              fill="none" dot={false} name="Actual"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── RAID View (renders selected items) ──────────────────────────────────────
function RaidView({ selectedRiskIds, selectedIssueIds, selectedDecisionIds, data }: {
  selectedRiskIds: Set<string> | string[]
  selectedIssueIds: Set<string> | string[]
  selectedDecisionIds: Set<string> | string[]
  data: AppData
}) {
  const riskSet    = new Set(selectedRiskIds)
  const issueSet   = new Set(selectedIssueIds)
  const decisionSet = new Set(selectedDecisionIds)

  const risks     = data.risks.filter(r => riskSet.has(r.id)).sort((a, b) => riskScore(b) - riskScore(a))
  const issues    = data.issues.filter(i => issueSet.has(i.id))
  const decisions = data.decisions.filter(d => decisionSet.has(d.id))

  if (risks.length + issues.length + decisions.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No RAID items selected.</div>
  }

  const impactOrder: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 }
  const sortedIssues = [...issues].sort((a, b) => (impactOrder[a.impact] ?? 4) - (impactOrder[b.impact] ?? 4))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {risks.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldAlert size={11} /> Risks ({risks.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {risks.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: 'var(--card)', borderRadius: 6, borderLeft: '3px solid var(--amber)' }}>
                <div style={{ minWidth: 28, height: 28, borderRadius: 4, background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'var(--amber)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                  {riskScore(r)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{r.title}</div>
                  {r.description && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{r.description}</div>}
                  {r.mitigation  && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>Mitigation: {r.mitigation}</div>}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.status} · {r.owner}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {sortedIssues.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertOctagon size={11} /> Issues ({sortedIssues.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {sortedIssues.map(i => {
              const ic = ISSUE_IMPACT_COLORS[i.impact]
              return (
                <div key={i.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 10px', background: 'var(--card)', borderRadius: 6, borderLeft: `3px solid ${ic}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{i.title}</span>
                      <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: ic + '22', color: ic }}>{i.impact}</span>
                    </div>
                    {i.description && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{i.description}</div>}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{i.status}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {decisions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--violet)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lightbulb size={11} /> Decisions ({decisions.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {decisions.map(d => (
              <div key={d.id} style={{ padding: '8px 10px', background: 'var(--card)', borderRadius: 6, borderLeft: '3px solid var(--violet)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', marginBottom: 2 }}>{d.title}</div>
                {d.description && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{d.description}</div>}
                {d.rationale   && <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 4, fontStyle: 'italic' }}>Rationale: {d.rationale}</div>}
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{d.decidedBy} · {dayjs(d.date).format('D MMM YYYY')}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── RAID Selector (editor-mode checkboxes) ───────────────────────────────────
function RaidSelector({ data, selectedRiskIds, selectedIssueIds, selectedDecisionIds, onToggleRisk, onToggleIssue, onToggleDecision }: {
  data: AppData
  selectedRiskIds: Set<string>
  selectedIssueIds: Set<string>
  selectedDecisionIds: Set<string>
  onToggleRisk: (id: string) => void
  onToggleIssue: (id: string) => void
  onToggleDecision: (id: string) => void
}) {
  const openRisks    = data.risks.filter(r => r.status !== 'Closed').sort((a, b) => riskScore(b) - riskScore(a))
  const openIssues   = data.issues.filter(i => i.status !== 'Resolved')
  const allDecisions = [...data.decisions].sort((a, b) => b.date.localeCompare(a.date))

  if (openRisks.length + openIssues.length + allDecisions.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No RAID items in the log.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {openRisks.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <ShieldAlert size={11} /> Risks
          </div>
          {openRisks.map(r => {
            const score  = riskScore(r)
            const isHigh = score >= 9
            return (
              <label key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 8px', borderRadius: 6, marginBottom: 4,
                background: selectedRiskIds.has(r.id) ? 'rgba(251,191,36,0.06)' : 'transparent',
                border:     `1px solid ${selectedRiskIds.has(r.id) ? 'rgba(251,191,36,0.2)' : 'transparent'}`,
                cursor: 'pointer',
              }}>
                <input type="checkbox" checked={selectedRiskIds.has(r.id)} onChange={() => onToggleRisk(r.id)}
                  style={{ accentColor: 'var(--amber)', width: 13, height: 13, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ minWidth: 24, height: 24, borderRadius: 4, background: 'rgba(251,191,36,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--amber)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{score}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{r.title}</span>
                  {!isHigh && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8 }}>low risk — not shown by default</span>}
                </div>
                <span style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{r.owner}</span>
              </label>
            )
          })}
        </div>
      )}

      {openIssues.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--red)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertOctagon size={11} /> Issues
          </div>
          {openIssues.map(i => {
            const ic         = ISSUE_IMPACT_COLORS[i.impact]
            const isHighCrit = i.impact === 'High' || i.impact === 'Critical'
            return (
              <label key={i.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '7px 8px', borderRadius: 6, marginBottom: 4,
                background: selectedIssueIds.has(i.id) ? ic + '0a' : 'transparent',
                border:     `1px solid ${selectedIssueIds.has(i.id) ? ic + '33' : 'transparent'}`,
                cursor: 'pointer',
              }}>
                <input type="checkbox" checked={selectedIssueIds.has(i.id)} onChange={() => onToggleIssue(i.id)}
                  style={{ accentColor: ic, width: 13, height: 13, cursor: 'pointer', flexShrink: 0 }} />
                <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 10, background: ic + '22', color: ic, flexShrink: 0 }}>{i.impact}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{i.title}</span>
                  {!isHighCrit && <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8 }}>not shown by default</span>}
                </div>
              </label>
            )
          })}
        </div>
      )}

      {allDecisions.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--violet)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <Lightbulb size={11} /> Decisions
          </div>
          {allDecisions.map(d => (
            <label key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '7px 8px', borderRadius: 6, marginBottom: 4,
              background: selectedDecisionIds.has(d.id) ? 'rgba(129,140,248,0.06)' : 'transparent',
              border:     `1px solid ${selectedDecisionIds.has(d.id) ? 'rgba(129,140,248,0.2)' : 'transparent'}`,
              cursor: 'pointer',
            }}>
              <input type="checkbox" checked={selectedDecisionIds.has(d.id)} onChange={() => onToggleDecision(d.id)}
                style={{ accentColor: 'var(--violet)', width: 13, height: 13, cursor: 'pointer', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{d.title}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8 }}>{dayjs(d.date).format('D MMM YYYY')}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Narrative Section ────────────────────────────────────────────────────────
function NarrativeSection({ value, onChange, placeholder, editing }: {
  value: string; onChange?: (v: string) => void; placeholder?: string; editing: boolean
}) {
  const mdComponents = {
    p:      ({ children }: any) => <p style={{ margin: '0 0 8px', color: 'var(--text-1)', lineHeight: 1.65 }}>{children}</p>,
    ul:     ({ children }: any) => <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{children}</ul>,
    ol:     ({ children }: any) => <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>{children}</ol>,
    li:     ({ children }: any) => <li style={{ marginBottom: 4, color: 'var(--text-2)', lineHeight: 1.55 }}>{children}</li>,
    strong: ({ children }: any) => <strong style={{ color: 'var(--text-1)', fontWeight: 800 }}>{children}</strong>,
    em:     ({ children }: any) => <em style={{ color: 'var(--text-2)' }}>{children}</em>,
  }

  // Saved-report view: straight rendered markdown
  if (!editing) {
    if (!value) return <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No content.</div>
    return <div style={{ fontSize: 13 }}><ReactMarkdown components={mdComponents}>{value}</ReactMarkdown></div>
  }

  // Editor view:
  // • Textarea (screen only — no-print) for raw markdown input
  // • narrative-preview-wrap always rendered:
  //     – on screen: styled preview box showing rendered markdown
  //     – in print:  the actual page content (no box styling, no label)
  return (
    <div>
      <textarea
        className="no-print field-input"
        value={value}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        rows={6}
        style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.65, marginBottom: 8 }}
      />
      <div className="narrative-preview-wrap">
        {value ? (
          <>
            <div className="narrative-preview-label no-print">Formatted preview</div>
            <div style={{ fontSize: 13 }}>
              <ReactMarkdown components={mdComponents}>{value}</ReactMarkdown>
            </div>
          </>
        ) : (
          <div className="no-print" style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
            Formatted preview will appear here as you type, or click Generate Narrative…
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Milestones Table ─────────────────────────────────────────────────────────
function MilestonesTable({ data }: { data: AppData }) {
  const milestones = getUpcomingMilestones(data).slice(0, 12)
  if (milestones.length === 0) {
    return <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>No upcoming milestones.</div>
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr>
          {['Date', 'Milestone', 'SOW'].map(h => (
            <th key={h} style={{ textAlign: 'left', padding: '5px 8px', color: 'var(--text-3)', fontWeight: 700, fontSize: 10, borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {milestones.map(m => {
          const sow = data.sows.find(s => s.id === m.sowId)
          return (
            <tr key={m.id}>
              <td style={{ padding: '6px 8px', fontFamily: 'var(--font-mono)', fontSize: 11, color: m.color, fontWeight: 700, borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{dayjs(m.date).format('D MMM YYYY')}</td>
              <td style={{ padding: '6px 8px', fontWeight: 600, color: 'var(--text-1)', borderBottom: '1px solid var(--border)' }}>{m.label}</td>
              <td style={{ padding: '6px 8px', color: 'var(--text-3)', fontSize: 11, borderBottom: '1px solid var(--border)' }}>{sow?.shortName ?? 'Program'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ─── RAG Health Grid ──────────────────────────────────────────────────────────
function RagHealthGrid({ ragStatus, ragComments, onChangeDim, onChangeComment }: {
  ragStatus: Record<RagDimension, RagStatus>
  ragComments: Record<string, string>
  onChangeDim?: (dim: RagDimension, v: RagStatus) => void
  onChangeComment?: (dim: RagDimension, v: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {RAG_DIMS.map(({ key, label }) => (
        <div key={key}>
          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 80, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{label}</div>
            <span className="no-print">
              <RagPicker
                value={ragStatus[key]}
                onChange={onChangeDim ? v => onChangeDim(key, v) : undefined}
                disabled={!onChangeDim}
              />
            </span>
            <RagBadge value={ragStatus[key]} />
          </div>
          {/* Comment — editor: input on screen + text for print; view: text always */}
          {onChangeComment ? (
            <>
              <input
                className="no-print field-input"
                value={ragComments[key] ?? ''}
                onChange={e => onChangeComment(key, e.target.value)}
                placeholder="Optional comment…"
                style={{ marginLeft: 92, width: 'calc(100% - 92px)', marginTop: 5, fontSize: 11, padding: '4px 8px' }}
              />
              {ragComments[key] && (
                <div className="print-only" style={{ marginLeft: 92, marginTop: 4, fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic' }}>
                  {ragComments[key]}
                </div>
              )}
            </>
          ) : ragComments[key] ? (
            <div style={{ marginLeft: 92, marginTop: 4, fontSize: 11, color: 'var(--text-2)', fontStyle: 'italic' }}>
              {ragComments[key]}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ─── Print header (shown only when printing) ──────────────────────────────────
function PrintHeader({ title, periodFrom, periodTo, createdAt }: {
  title: string; periodFrom: string; periodTo: string; createdAt: string
}) {
  return (
    <div className="print-only" style={{ marginBottom: 24, paddingBottom: 14, borderBottom: '2px solid var(--border)' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        Period: {dayjs(periodFrom).format('D MMMM YYYY')} – {dayjs(periodTo).format('D MMMM YYYY')}
        &nbsp;·&nbsp;
        Generated: {dayjs(createdAt).format('D MMMM YYYY')}
        &nbsp;·&nbsp;
        IntoWork × Rapid Circle
      </div>
    </div>
  )
}

// ─── Shared report body ───────────────────────────────────────────────────────
// Renders the report sections identically for both new (editing) and saved (view) modes.
function ReportBody({
  title, periodFrom, periodTo, createdAt,
  ragStatus, ragComments, recentActivity, upcomingActivities,
  selectedRiskIds, selectedIssueIds, selectedDecisionIds,
  budgetSnapshot, data, editing,
  onChangeDim, onChangeComment, onChangeRecent, onChangeUpcoming,
  showRaidSelector, onToggleRaidSelector,
  onToggleRisk, onToggleIssue, onToggleDecision,
}: {
  title: string; periodFrom: string; periodTo: string; createdAt: string
  ragStatus: Record<RagDimension, RagStatus>
  ragComments: Record<string, string>
  recentActivity: string; upcomingActivities: string
  selectedRiskIds: Set<string> | string[]
  selectedIssueIds: Set<string> | string[]
  selectedDecisionIds: Set<string> | string[]
  budgetSnapshot: BudgetSnapshot[]
  data: AppData; editing: boolean
  onChangeDim?: (dim: RagDimension, v: RagStatus) => void
  onChangeComment?: (dim: RagDimension, v: string) => void
  onChangeRecent?: (v: string) => void
  onChangeUpcoming?: (v: string) => void
  showRaidSelector?: boolean
  onToggleRaidSelector?: () => void
  onToggleRisk?: (id: string) => void
  onToggleIssue?: (id: string) => void
  onToggleDecision?: (id: string) => void
}) {
  const riskSet    = new Set(selectedRiskIds)
  const issueSet   = new Set(selectedIssueIds)
  const decisionSet = new Set(selectedDecisionIds)

  return (
    <>
      <PrintHeader title={title} periodFrom={periodFrom} periodTo={periodTo} createdAt={createdAt} />

      {/* 1. Project Health */}
      <Section title="Project Health">
        <RagHealthGrid
          ragStatus={ragStatus}
          ragComments={ragComments}
          onChangeDim={onChangeDim}
          onChangeComment={onChangeComment}
        />
      </Section>

      {/* 2. Recent Activity */}
      <Section title="Recent Activity">
        <NarrativeSection
          value={recentActivity}
          onChange={onChangeRecent}
          placeholder="Describe what happened in the reporting period, or click Generate Narrative above to let the AI draft this…"
          editing={editing}
        />
      </Section>

      {/* 3. Upcoming Activities */}
      <Section title="Upcoming Activities">
        <NarrativeSection
          value={upcomingActivities}
          onChange={onChangeUpcoming}
          placeholder="Describe what is planned for the coming period…"
          editing={editing}
        />
      </Section>

      {/* 4. Budget Summary */}
      <Section title="Budget Summary">
        <BudgetTable snapshot={budgetSnapshot} />
      </Section>

      {/* 5. RAID Snapshot */}
      <Section title="RAID Snapshot">
        {editing && (
          <div className="no-print" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={onToggleRaidSelector}
              style={{
                background: 'transparent', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '5px 12px',
                color: 'var(--text-3)', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'var(--font-main)',
              }}
            >
              {showRaidSelector ? '▲ Hide selector' : '▼ Configure RAID items'}
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {riskSet.size} risk{riskSet.size !== 1 ? 's' : ''} · {issueSet.size} issue{issueSet.size !== 1 ? 's' : ''} · {decisionSet.size} decision{decisionSet.size !== 1 ? 's' : ''} selected
            </span>
          </div>
        )}
        {editing && showRaidSelector && (
          <div className="no-print" style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '16px 18px', marginBottom: 14,
          }}>
            <RaidSelector
              data={data}
              selectedRiskIds={riskSet}
              selectedIssueIds={issueSet}
              selectedDecisionIds={decisionSet}
              onToggleRisk={onToggleRisk!}
              onToggleIssue={onToggleIssue!}
              onToggleDecision={onToggleDecision!}
            />
          </div>
        )}
        <RaidView
          selectedRiskIds={selectedRiskIds}
          selectedIssueIds={selectedIssueIds}
          selectedDecisionIds={selectedDecisionIds}
          data={data}
        />
      </Section>

      {/* 6. Burndown Charts */}
      <Section title="Burndown">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {data.sows.map(sow => (
            <MiniChart key={sow.id} sowId={sow.id} sowName={sow.shortName} sowColor={sow.color} data={data} />
          ))}
        </div>
      </Section>

      {/* 7. Milestones */}
      <Section title="Upcoming Milestones">
        <MilestonesTable data={data} />
      </Section>
    </>
  )
}

// ─── Main Reports View ────────────────────────────────────────────────────────
export default function Reports() {
  const { data, setData } = useApp()
  const savedReports: SavedReport[] = data.reports ?? []

  const [viewingId,       setViewingId]       = useState<string | null>(null)
  const [draft,           setDraft]           = useState<ReportDraft>(() => makeDefaultDraft(data))
  const [isGenerating,    setIsGenerating]    = useState(false)
  const [streamText,      setStreamText]      = useState('')
  const [showRaidSelector, setShowRaidSelector] = useState(false)

  const viewingReport = viewingId ? (savedReports.find(r => r.id === viewingId) ?? null) : null

  function newReport() {
    setViewingId(null)
    setDraft(makeDefaultDraft(data))
    setStreamText('')
    setShowRaidSelector(false)
  }

  async function generateNarrative() {
    setIsGenerating(true)
    setStreamText('')
    setDraft(d => ({ ...d, recentActivity: '', upcomingActivities: '' }))

    const prompt = `Generate a concise, professional project status report narrative for the period from ${dayjs(draft.periodFrom).format('D MMMM YYYY')} to ${dayjs(draft.periodTo).format('D MMMM YYYY')}.

Structure your response with exactly these two sections:

## Recent Activity
Summarise what has happened in the reporting period: tasks completed or progressed, risks raised or updated, issues resolved, decisions made, milestones reached, files uploaded. Be specific with names and details from the project data. 3–5 bullet points.

## Upcoming Activities
Outline what is planned for the coming period: tasks due, approaching milestones, phase transitions, resource changes, actions needed on open risks or issues. 3–5 bullet points.

Keep it professional and factual. Bullet points preferred. Suitable for sharing with stakeholders at IntoWork Australia.`

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }] }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let buf      = ''
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t || t === 'data: [DONE]' || !t.startsWith('data: ')) continue
          try {
            const j = JSON.parse(t.slice(6))
            if (j.delta) { fullText += j.delta; setStreamText(fullText) }
            if (j.error) throw new Error(j.error)
          } catch { /* skip malformed */ }
        }
      }

      const recentMatch   = fullText.match(/##\s*Recent Activity\s*([\s\S]*?)(?=##\s*Upcoming|$)/)
      const upcomingMatch = fullText.match(/##\s*Upcoming Activities\s*([\s\S]*)/)

      setDraft(d => ({
        ...d,
        recentActivity:    (recentMatch?.[1]   ?? fullText).trim(),
        upcomingActivities: (upcomingMatch?.[1] ?? '').trim(),
      }))
    } catch (e: any) {
      alert(`Generation failed: ${e.message}`)
    } finally {
      setIsGenerating(false)
      setStreamText('')
    }
  }

  function saveReport() {
    const report: SavedReport = {
      id:               crypto.randomUUID(),
      title:            draft.title,
      createdAt:        new Date().toISOString(),
      periodFrom:       draft.periodFrom,
      periodTo:         draft.periodTo,
      ragStatus:        draft.ragStatus,
      ragComments:      draft.ragComments,
      recentActivity:   draft.recentActivity,
      upcomingActivities: draft.upcomingActivities,
      selectedRiskIds:     [...draft.selectedRiskIds],
      selectedIssueIds:    [...draft.selectedIssueIds],
      selectedDecisionIds: [...draft.selectedDecisionIds],
      budgetSnapshot:   computeBudgetSnapshot(data),
    }
    setData({ ...data, reports: [report, ...(data.reports ?? [])] })
    setViewingId(report.id)
  }

  function deleteReport(id: string) {
    if (!confirm('Delete this saved report? This cannot be undone.')) return
    setData({ ...data, reports: (data.reports ?? []).filter(r => r.id !== id) })
    if (viewingId === id) setViewingId(null)
  }

  function toggleRisk(id: string) {
    setDraft(d => { const s = new Set(d.selectedRiskIds); s.has(id) ? s.delete(id) : s.add(id); return { ...d, selectedRiskIds: s } })
  }
  function toggleIssue(id: string) {
    setDraft(d => { const s = new Set(d.selectedIssueIds); s.has(id) ? s.delete(id) : s.add(id); return { ...d, selectedIssueIds: s } })
  }
  function toggleDecision(id: string) {
    setDraft(d => { const s = new Set(d.selectedDecisionIds); s.has(id) ? s.delete(id) : s.add(id); return { ...d, selectedDecisionIds: s } })
  }

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="reports-shell" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* ── Saved reports sidebar ─────────────────────────────────────────── */}
      <div className="no-print" style={{
        width: 220, flexShrink: 0, background: 'var(--surface)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '14px 12px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Reports</div>
          <button
            onClick={newReport}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
              borderRadius: 'var(--radius-sm)', padding: '7px 10px',
              color: 'var(--sky-bright)', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'var(--font-main)',
            }}
          >
            <Plus size={12} /> New Report
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {savedReports.length === 0 && (
            <div style={{ padding: '20px 14px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center', lineHeight: 1.6 }}>
              No saved reports yet.<br />Generate and save your first report.
            </div>
          )}
          {savedReports.map(r => {
            const isActive = viewingId === r.id
            const ragColors = Array.from(new Set(Object.values(r.ragStatus))) as RagStatus[]
            return (
              <div
                key={r.id}
                onClick={() => setViewingId(r.id)}
                style={{
                  padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border)',
                  background: isActive ? 'rgba(56,189,248,0.07)' : 'transparent',
                  borderLeft: `3px solid ${isActive ? 'var(--sky)' : 'transparent'}`,
                  transition: 'background 0.12s',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(148,163,184,0.04)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>
                      {dayjs(r.createdAt).format('D MMM YYYY')}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                    </div>
                  </div>
                  {/* RAG dots */}
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0, marginTop: 2 }}>
                    {(['R', 'A', 'G'] as RagStatus[]).filter(k => Object.values(r.ragStatus).some(v => v === k)).map(k => (
                      <div key={k} style={{ width: 7, height: 7, borderRadius: '50%', background: RAG_COLOR[k] }} />
                    ))}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {dayjs(r.periodFrom).format('D MMM')} – {dayjs(r.periodTo).format('D MMM YYYY')}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="reports-content" style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

        {viewingReport ? (
          /* ── SAVED REPORT VIEW ── */
          <div>
            {/* Controls — screen only */}
            <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 2 }}>
                  Saved {dayjs(viewingReport.createdAt).format('D MMMM YYYY [at] HH:mm')}
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {viewingReport.title}
                </div>
              </div>
              <button
                onClick={() => deleteReport(viewingReport.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '7px 12px', color: 'var(--red)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)', flexShrink: 0 }}
              >
                <Trash2 size={12} /> Delete
              </button>
              <button
                onClick={() => window.print()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', borderRadius: 'var(--radius-sm)', padding: '7px 14px', color: 'var(--sky-bright)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)', flexShrink: 0 }}
              >
                <Printer size={13} /> Export PDF
              </button>
            </div>

            {/* Period pill — screen only */}
            <div className="no-print" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24 }}>
              Period: <strong style={{ color: 'var(--text-2)' }}>{dayjs(viewingReport.periodFrom).format('D MMM YYYY')}</strong>
              {' – '}
              <strong style={{ color: 'var(--text-2)' }}>{dayjs(viewingReport.periodTo).format('D MMM YYYY')}</strong>
            </div>

            <ReportBody
              title={viewingReport.title}
              periodFrom={viewingReport.periodFrom}
              periodTo={viewingReport.periodTo}
              createdAt={viewingReport.createdAt}
              ragStatus={viewingReport.ragStatus}
              ragComments={viewingReport.ragComments ?? {}}
              recentActivity={viewingReport.recentActivity}
              upcomingActivities={viewingReport.upcomingActivities}
              selectedRiskIds={viewingReport.selectedRiskIds}
              selectedIssueIds={viewingReport.selectedIssueIds}
              selectedDecisionIds={viewingReport.selectedDecisionIds}
              budgetSnapshot={viewingReport.budgetSnapshot}
              data={data}
              editing={false}
            />
          </div>

        ) : (
          /* ── NEW REPORT EDITOR ── */
          <div>
            {/* Config panel — screen only */}
            <div className="no-print" style={{
              background: 'var(--card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 24,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 16 }}>New Report</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 170px 170px', gap: 16, alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Title</label>
                  <input
                    className="field-input"
                    value={draft.title}
                    onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Period From</label>
                  <input
                    type="date" className="field-input"
                    value={draft.periodFrom}
                    onChange={e => setDraft(d => ({ ...d, periodFrom: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Period To</label>
                  <input
                    type="date" className="field-input"
                    value={draft.periodTo}
                    onChange={e => setDraft(d => ({ ...d, periodTo: e.target.value }))}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
                <button
                  onClick={generateNarrative}
                  disabled={isGenerating}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(56,189,248,0.15)', border: '1px solid rgba(56,189,248,0.3)',
                    borderRadius: 'var(--radius-sm)', padding: '8px 16px',
                    color: 'var(--sky-bright)', fontSize: 12, fontWeight: 700,
                    cursor: isGenerating ? 'not-allowed' : 'pointer',
                    fontFamily: 'var(--font-main)', opacity: isGenerating ? 0.6 : 1,
                  }}
                >
                  {isGenerating
                    ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
                    : <><RefreshCw size={12} /> Generate Narrative</>
                  }
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                  AI drafts Recent Activity and Upcoming Activities from live project data. You can edit after.
                </span>
              </div>
            </div>

            {/* Streaming preview */}
            {isGenerating && streamText && (
              <div className="no-print" style={{
                background: 'rgba(56,189,248,0.04)', border: '1px solid rgba(56,189,248,0.15)',
                borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: 20,
                fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)',
                lineHeight: 1.7, whiteSpace: 'pre-wrap',
              }}>
                {streamText}
              </div>
            )}

            {/* Period pill — screen only */}
            <div className="no-print" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24 }}>
              Period: <strong style={{ color: 'var(--text-2)' }}>{dayjs(draft.periodFrom).format('D MMM YYYY')}</strong>
              {' – '}
              <strong style={{ color: 'var(--text-2)' }}>{dayjs(draft.periodTo).format('D MMM YYYY')}</strong>
            </div>

            <ReportBody
              title={draft.title}
              periodFrom={draft.periodFrom}
              periodTo={draft.periodTo}
              createdAt={new Date().toISOString()}
              ragStatus={draft.ragStatus}
              ragComments={draft.ragComments}
              recentActivity={draft.recentActivity}
              upcomingActivities={draft.upcomingActivities}
              selectedRiskIds={draft.selectedRiskIds}
              selectedIssueIds={draft.selectedIssueIds}
              selectedDecisionIds={draft.selectedDecisionIds}
              budgetSnapshot={computeBudgetSnapshot(data)}
              data={data}
              editing={true}
              onChangeDim={(dim, v) => setDraft(d => ({ ...d, ragStatus: { ...d.ragStatus, [dim]: v } }))}
              onChangeComment={(dim, v) => setDraft(d => ({ ...d, ragComments: { ...d.ragComments, [dim]: v } }))}
              onChangeRecent={v => setDraft(d => ({ ...d, recentActivity: v }))}
              onChangeUpcoming={v => setDraft(d => ({ ...d, upcomingActivities: v }))}
              showRaidSelector={showRaidSelector}
              onToggleRaidSelector={() => setShowRaidSelector(s => !s)}
              onToggleRisk={toggleRisk}
              onToggleIssue={toggleIssue}
              onToggleDecision={toggleDecision}
            />

            {/* Save + Export — screen only */}
            <div className="no-print" style={{ display: 'flex', gap: 10, alignItems: 'center', paddingTop: 24, borderTop: '1px solid var(--border)', marginTop: 8 }}>
              <button
                onClick={saveReport}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)',
                  borderRadius: 'var(--radius-sm)', padding: '9px 18px',
                  color: 'var(--emerald)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-main)',
                }}
              >
                <Save size={13} /> Save Report
              </button>
              <button
                onClick={() => window.print()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)',
                  borderRadius: 'var(--radius-sm)', padding: '9px 16px',
                  color: 'var(--sky-bright)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'var(--font-main)',
                }}
              >
                <Printer size={13} /> Export PDF
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>
                Save to preserve this report for future reference · Export PDF opens the browser print dialog
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
