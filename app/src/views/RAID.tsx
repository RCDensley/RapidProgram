import React, { useState, useRef } from 'react'
import { useApp } from '../App'
import {
  Risk, Issue, Decision, RiskStatus, IssueStatus, IssueImpact,
  RaidHistoryEntry, ISSUE_IMPACT_COLORS,
  riskScore, riskResidualScore, riskScoreColor,
} from '../types'
import { v4 as uuidv4 } from 'uuid'
import { Plus, Pencil, Trash2, ArrowUpCircle, X, ChevronRight, Download, Upload as UploadIcon } from 'lucide-react'
import dayjs from 'dayjs'

const LIKELIHOOD_LABELS = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain']
const IMPACT_LABELS     = ['', 'Negligible', 'Minor', 'Moderate', 'Major', 'Critical']

function escapeCsv(v: any): string {
  const s = String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}
function downloadCsv(filename: string, rows: string[][]): void {
  const csv  = rows.map(r => r.map(escapeCsv).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
function parseCsvRows(text: string): string[][] {
  const rows: string[][] = []
  let field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') { inQ = true
    } else if (c === ',') {
      if (!rows.length) rows.push([]); rows[rows.length - 1].push(field); field = ''
    } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      if (c === '\r') i++
      if (!rows.length) rows.push([])
      rows[rows.length - 1].push(field); rows.push([]); field = ''
    } else field += c
  }
  if (!rows.length) rows.push([])
  rows[rows.length - 1].push(field)
  return rows.filter(r => r.some(c => c.trim()))
}



// ─── 5×5 Risk Matrix ──────────────────────────────────────────────────────────
function RiskMatrix({
  selectedL, selectedI, onSelect,
}: {
  selectedL?: number; selectedI?: number
  onSelect?: (l: number, i: number) => void
}) {
  return (
    <div>
      {/* Y-axis label */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: 5 * 36, marginRight: 4 }}>
          <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            Impact →
          </span>
        </div>
        <div>
          {/* Grid: rows = impact (5→1), cols = likelihood (1→5) */}
          {[5, 4, 3, 2, 1].map(impact => (
            <div key={impact} style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-3)', width: 60, textAlign: 'right', paddingRight: 6, flexShrink: 0, fontWeight: 600 }}>
                {IMPACT_LABELS[impact]}
              </span>
              {[1, 2, 3, 4, 5].map(likelihood => {
                const score    = likelihood * impact
                const color    = riskScoreColor(score)
                const isSelected = selectedL === likelihood && selectedI === impact
                return (
                  <div
                    key={likelihood}
                    onClick={() => onSelect?.(likelihood, impact)}
                    style={{
                      width: 36, height: 36, marginRight: 3,
                      background: color + '33',
                      border: `1.5px solid ${isSelected ? color : color + '66'}`,
                      borderRadius: 5,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: onSelect ? 'pointer' : 'default',
                      fontSize: 10, fontWeight: 800, color,
                      boxShadow: isSelected ? `0 0 0 2px ${color}` : 'none',
                      transition: 'all 0.12s',
                    }}>
                    {score}
                  </div>
                )
              })}
            </div>
          ))}
          {/* X-axis labels */}
          <div style={{ display: 'flex', paddingLeft: 66 }}>
            {[1, 2, 3, 4, 5].map(l => (
              <div key={l} style={{ width: 36, marginRight: 3, textAlign: 'center', fontSize: 9, color: 'var(--text-3)', fontWeight: 600 }}>
                {LIKELIHOOD_LABELS[l].slice(0, 4)}
              </div>
            ))}
          </div>
          <div style={{ paddingLeft: 66, marginTop: 2 }}>
            <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Likelihood →
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── History log ──────────────────────────────────────────────────────────────
function HistoryLog({ history }: { history: RaidHistoryEntry[] }) {
  if (history.length === 0) return <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No history yet.</div>
  return (
    <div style={{ maxHeight: 200, overflowY: 'auto' }}>
      {[...history].reverse().map(h => (
        <div key={h.id} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--card)', borderRadius: 'var(--radius-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {h.type.replace('_', ' ')}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
              {dayjs(h.timestamp).format('D MMM YY HH:mm')}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-1)' }}>{h.text}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Risk modal ───────────────────────────────────────────────────────────────
function RiskModal({
  risk, sows, onSave, onDelete, onPromote, onClose,
}: {
  risk: Partial<Risk>; sows: any[]
  onSave: (r: Partial<Risk>) => void
  onDelete?: () => void
  onPromote?: () => void
  onClose: () => void
}) {
  const [r, setR] = useState<Partial<Risk>>(risk)
  const [comment, setComment] = useState('')

  const score    = r.likelihood && r.impact ? r.likelihood * r.impact : 0
  const residual = r.likelihood && r.impact ? Math.max(0, score - (r.mitigationScore ?? 0)) : 0

  function addComment() {
    if (!comment.trim()) return
    const entry: RaidHistoryEntry = { id: uuidv4(), timestamp: new Date().toISOString(), type: 'comment', text: comment.trim() }
    setR(p => ({ ...p, history: [...(p.history ?? []), entry] }))
    setComment('')
  }

  function setStatus(status: RiskStatus) {
    const prev = r.status
    const entry: RaidHistoryEntry = { id: uuidv4(), timestamp: new Date().toISOString(), type: 'status_change', text: `Status changed from ${prev ?? 'Open'} to ${status}` }
    setR(p => ({ ...p, status, history: [...(p.history ?? []), entry] }))
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 580, maxHeight: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{risk.id ? 'Edit Risk' : 'Add Risk'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field-row">
            <div className="field" style={{ gridColumn: '1/-1' }}>
              <label className="field-label">Title</label>
              <input className="field-input" value={r.title ?? ''} autoFocus onChange={e => setR(p => ({ ...p, title: e.target.value }))} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Description</label>
            <textarea className="field-input" rows={2} style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }} value={r.description ?? ''} onChange={e => setR(p => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Project</label>
              <select className="field-input" value={r.sowId ?? '__program__'}
                onChange={e => setR(p => ({ ...p, sowId: e.target.value === '__program__' ? null : e.target.value }))}>
                <option value="__program__">Program-level</option>
                {sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Owner</label>
              <input className="field-input" value={r.owner ?? ''} onChange={e => setR(p => ({ ...p, owner: e.target.value }))} />
            </div>
          </div>

          {/* Risk matrix selector */}
          <div className="field">
            <label className="field-label">Likelihood × Impact{score > 0 && <span style={{ color: riskScoreColor(score), marginLeft: 8 }}>Score: {score}</span>}</label>
            <RiskMatrix
              selectedL={r.likelihood} selectedI={r.impact}
              onSelect={(l, i) => {
                const entry: RaidHistoryEntry = { id: uuidv4(), timestamp: new Date().toISOString(), type: 'score_change', text: `Score updated to ${l}×${i}=${l*i}` }
                setR(p => ({ ...p, likelihood: l as any, impact: i as any, history: [...(p.history ?? []), entry] }))
              }} />
          </div>

          {/* Status */}
          <div className="field">
            <label className="field-label">Status</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['Open', 'Mitigated', 'Closed'] as RiskStatus[]).map(s => (
                <button key={s} onClick={() => setStatus(s)} style={{
                  padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  border: `1.5px solid ${r.status === s ? '#38bdf8' : 'var(--border)'}`,
                  background: r.status === s ? 'rgba(56,189,248,0.15)' : 'transparent',
                  color: r.status === s ? 'var(--sky-bright)' : 'var(--text-3)',
                  cursor: 'pointer', fontFamily: 'var(--font-main)',
                }}>{s}</button>
              ))}
            </div>
          </div>

          {/* Mitigation (when Mitigated) */}
          {r.status === 'Mitigated' && (
            <>
              <div className="field">
                <label className="field-label">Mitigation description</label>
                <textarea className="field-input" rows={2} style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }}
                  value={r.mitigation ?? ''} onChange={e => setR(p => ({ ...p, mitigation: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">
                  Mitigation effectiveness
                  {r.mitigationScore && <span style={{ color: riskScoreColor(residual), marginLeft: 8 }}>Residual: {residual}</span>}
                </label>
                <RiskMatrix
                  selectedL={r.mitigationScore ? undefined : undefined}
                  onSelect={(l, i) => setR(p => ({ ...p, mitigationScore: l * i }))}
                />
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                  Click the cell that represents how much this mitigation reduces the raw risk score of {score}.
                </div>
              </div>
            </>
          )}

          {/* History */}
          <div className="field">
            <label className="field-label">History &amp; Comments</label>
            <HistoryLog history={r.history ?? []} />
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input className="field-input field-input-sm" placeholder="Add comment…"
                style={{ flex: 1 }} value={comment} onChange={e => setComment(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addComment()} />
              <button className="btn-ghost btn-sm" onClick={addComment}><Plus size={11} /></button>
            </div>
          </div>

          <div className="modal-actions">
            {onDelete && <button className="btn-danger" onClick={onDelete}><Trash2 size={12} /> Delete</button>}
            {onPromote && !r.promotedToIssueId && (
              <button className="btn-secondary" onClick={onPromote}>
                <ArrowUpCircle size={13} /> Promote to Issue
              </button>
            )}
            {r.promotedToIssueId && (
              <span style={{ fontSize: 12, color: 'var(--emerald-bright)', fontWeight: 700, alignSelf: 'center' }}>
                ✓ Promoted to issue
              </span>
            )}
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(r)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Issue modal ──────────────────────────────────────────────────────────────
function IssueModal({ issue, sows, onSave, onDelete, onClose }: {
  issue: Partial<Issue>; sows: any[]
  onSave: (i: Partial<Issue>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [i, setI] = useState<Partial<Issue>>(issue)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{issue.id ? 'Edit Issue' : 'Add Issue'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field"><label className="field-label">Title</label>
            <input className="field-input" autoFocus value={i.title ?? ''} onChange={e => setI(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="field"><label className="field-label">Description</label>
            <textarea className="field-input" rows={2} style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }} value={i.description ?? ''} onChange={e => setI(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Project</label>
              <select className="field-input" value={i.sowId ?? '__program__'} onChange={e => setI(p => ({ ...p, sowId: e.target.value === '__program__' ? null : e.target.value }))}>
                <option value="__program__">Program-level</option>
                {sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
              </select></div>
            <div className="field"><label className="field-label">Impact</label>
              <select className="field-input" value={i.impact ?? 'Medium'} onChange={e => setI(p => ({ ...p, impact: e.target.value as IssueImpact }))}>
                {(['Low', 'Medium', 'High', 'Critical'] as IssueImpact[]).map(imp => <option key={imp} value={imp}>{imp}</option>)}
              </select></div>
          </div>
          <div className="field-row">
            <div className="field"><label className="field-label">Status</label>
              <select className="field-input" value={i.status ?? 'Open'} onChange={e => setI(p => ({ ...p, status: e.target.value as IssueStatus }))}>
                {(['Open', 'In Progress', 'Resolved'] as IssueStatus[]).map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div className="field"><label className="field-label">Owner</label>
              <input className="field-input" value={i.owner ?? ''} onChange={e => setI(p => ({ ...p, owner: e.target.value }))} /></div>
          </div>
          <div className="modal-actions">
            {onDelete && <button className="btn-danger" onClick={onDelete}><Trash2 size={12} /> Delete</button>}
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(i)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Decision modal ───────────────────────────────────────────────────────────
function DecisionModal({ decision, sows, onSave, onDelete, onClose }: {
  decision: Partial<Decision>; sows: any[]
  onSave: (d: Partial<Decision>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [d, setD] = useState<Partial<Decision>>(decision)
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{decision.id ? 'Edit Decision' : 'Add Decision'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field"><label className="field-label">Title</label>
            <input className="field-input" autoFocus value={d.title ?? ''} onChange={e => setD(p => ({ ...p, title: e.target.value }))} /></div>
          <div className="field"><label className="field-label">Description</label>
            <textarea className="field-input" rows={2} style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }} value={d.description ?? ''} onChange={e => setD(p => ({ ...p, description: e.target.value }))} /></div>
          <div className="field"><label className="field-label">Rationale</label>
            <textarea className="field-input" rows={2} style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }} value={d.rationale ?? ''} onChange={e => setD(p => ({ ...p, rationale: e.target.value }))} /></div>
          <div className="field-row">
            <div className="field"><label className="field-label">Project</label>
              <select className="field-input" value={d.sowId ?? '__program__'} onChange={e => setD(p => ({ ...p, sowId: e.target.value === '__program__' ? null : e.target.value }))}>
                <option value="__program__">Program-level</option>
                {sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
              </select></div>
            <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="field"><label className="field-label">Decided by</label>
                <input className="field-input" value={d.decidedBy ?? ''} onChange={e => setD(p => ({ ...p, decidedBy: e.target.value }))} /></div>
              <div className="field"><label className="field-label">Date</label>
                <input className="field-input font-mono" type="date" value={d.date ?? dayjs().format('YYYY-MM-DD')} onChange={e => setD(p => ({ ...p, date: e.target.value }))} /></div>
            </div>
          </div>
          <div className="modal-actions">
            {onDelete && <button className="btn-danger" onClick={onDelete}><Trash2 size={12} /> Delete</button>}
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(d)}>Save</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main RAID view ───────────────────────────────────────────────────────────
export default function RAID() {
  const { data, setData } = useApp()
  const [tab, setTab]     = useState<'risks' | 'issues' | 'decisions'>('risks')

  const [filterSow,    setFilterSow]    = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [matrixFilter, setMatrixFilter] = useState<{l:number;i:number}|null>(null)

  const [editRisk,     setEditRisk]     = useState<Partial<Risk> | null>(null)
  const [editIssue,    setEditIssue]    = useState<Partial<Issue> | null>(null)
  const [editDecision, setEditDecision] = useState<Partial<Decision> | null>(null)

  const importRef = useRef<HTMLInputElement>(null)

  // ── CSV Export ───────────────────────────────────────────────────────────────
  function exportCurrentTab() {
    const date = new Date().toISOString().slice(0, 10)
    if (tab === 'risks') {
      const rows = data.risks.map(r => {
        const sow = data.sows.find(s => s.id === r.sowId)
        return [r.id, r.title, r.description, sow?.shortName ?? 'Program', r.sowId ?? '', r.likelihood, r.impact, r.likelihood * r.impact, r.status, r.owner, r.mitigation ?? '', r.mitigationScore ?? '', r.createdAt]
      })
      downloadCsv(`risks-${date}.csv`, [['ID','Title','Description','Project','SOW_ID','Likelihood','Impact','Score','Status','Owner','Mitigation','MitigationScore','Created'], ...rows])
    } else if (tab === 'issues') {
      const rows = data.issues.map(i => {
        const sow = data.sows.find(s => s.id === i.sowId)
        return [i.id, i.title, i.description, sow?.shortName ?? 'Program', i.sowId ?? '', i.impact, i.status, i.owner, i.raisedFromRiskId ?? '', i.createdAt]
      })
      downloadCsv(`issues-${date}.csv`, [['ID','Title','Description','Project','SOW_ID','Impact','Status','Owner','RaisedFromRisk','Created'], ...rows])
    } else {
      const rows = data.decisions.map(d => {
        const sow = data.sows.find(s => s.id === d.sowId)
        return [d.id, d.title, d.description, d.rationale, sow?.shortName ?? 'Program', d.sowId ?? '', d.decidedBy, d.date]
      })
      downloadCsv(`decisions-${date}.csv`, [['ID','Title','Description','Rationale','Project','SOW_ID','DecidedBy','Date'], ...rows])
    }
  }

  // ── CSV Import ───────────────────────────────────────────────────────────────
  function importFromCsv(file: File) {
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCsvRows(ev.target?.result as string)
      if (rows.length < 2) return
      const header = rows[0].map(h => h.trim().toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      let added = 0

      if (tab === 'risks') {
        const existing = new Set(data.risks.map(r => r.id))
        const newRisks: Risk[] = rows.slice(1).map(row => ({
          id:          row[idx('id')]?.trim() || uuidv4(),
          title:       row[idx('title')]?.trim() || 'Imported risk',
          description: row[idx('description')]?.trim() || '',
          sowId:       row[idx('sow_id')]?.trim() || null,
          likelihood:  (Number(row[idx('likelihood')]?.trim()) || 3) as any,
          impact:      (Number(row[idx('impact')]?.trim()) || 3) as any,
          status:      (row[idx('status')]?.trim() || 'Open') as RiskStatus,
          owner:       row[idx('owner')]?.trim() || '',
          mitigation:  row[idx('mitigation')]?.trim() || undefined,
          mitigationScore: Number(row[idx('mitigationscore')]?.trim()) || undefined,
          history:     [],
          createdAt:   row[idx('created')]?.trim() || new Date().toISOString(),
        }))
        const toAdd = newRisks.filter(r => !existing.has(r.id))
        added = toAdd.length
        setData({ ...data, risks: [...data.risks, ...toAdd] })

      } else if (tab === 'issues') {
        const existing = new Set(data.issues.map(i => i.id))
        const newIssues: Issue[] = rows.slice(1).map(row => ({
          id:          row[idx('id')]?.trim() || uuidv4(),
          title:       row[idx('title')]?.trim() || 'Imported issue',
          description: row[idx('description')]?.trim() || '',
          sowId:       row[idx('sow_id')]?.trim() || null,
          impact:      (row[idx('impact')]?.trim() || 'Medium') as IssueImpact,
          status:      (row[idx('status')]?.trim() || 'Open') as IssueStatus,
          owner:       row[idx('owner')]?.trim() || '',
          createdAt:   row[idx('created')]?.trim() || new Date().toISOString(),
        }))
        const toAdd = newIssues.filter(i => !existing.has(i.id))
        added = toAdd.length
        setData({ ...data, issues: [...data.issues, ...toAdd] })

      } else {
        const existing = new Set(data.decisions.map(d => d.id))
        const newDecisions: Decision[] = rows.slice(1).map(row => ({
          id:          row[idx('id')]?.trim() || uuidv4(),
          title:       row[idx('title')]?.trim() || 'Imported decision',
          description: row[idx('description')]?.trim() || '',
          rationale:   row[idx('rationale')]?.trim() || '',
          sowId:       row[idx('sow_id')]?.trim() || null,
          decidedBy:   row[idx('decidedby')]?.trim() || '',
          date:        row[idx('date')]?.trim() || new Date().toISOString().slice(0, 10),
        }))
        const toAdd = newDecisions.filter(d => !existing.has(d.id))
        added = toAdd.length
        setData({ ...data, decisions: [...data.decisions, ...toAdd] })
      }

      alert(`Imported ${added} new ${tab} (duplicates skipped by ID).`)
    }
    reader.readAsText(file)
  }

  // ── Risk CRUD ────────────────────────────────────────────────────────────────
  function saveRisk(partial: Partial<Risk>) {
    if (!partial.title || !partial.likelihood || !partial.impact) return
    const isNew = !partial.id
    const risk: Risk = {
      id:          partial.id ?? uuidv4(),
      sowId:       partial.sowId ?? null,
      title:       partial.title!,
      description: partial.description ?? '',
      likelihood:  partial.likelihood!,
      impact:      partial.impact!,
      status:      partial.status ?? 'Open',
      mitigation:  partial.mitigation,
      mitigationScore: partial.mitigationScore,
      owner:       partial.owner ?? '',
      history:     partial.history ?? [],
      promotedToIssueId: partial.promotedToIssueId,
      createdAt:   partial.createdAt ?? new Date().toISOString(),
    }
    const risks = isNew ? [...data.risks, risk] : data.risks.map(r => r.id === risk.id ? risk : r)
    setData({ ...data, risks })
    setEditRisk(null)
  }

  function deleteRisk(id: string) {
    if (!confirm('Delete this risk?')) return
    setData({ ...data, risks: data.risks.filter(r => r.id !== id) })
    setEditRisk(null)
  }

  function promoteRisk(risk: Partial<Risk>) {
    const issue: Issue = {
      id:             uuidv4(),
      sowId:          risk.sowId ?? null,
      title:          risk.title ?? '',
      description:    risk.description ?? '',
      impact:         'High',
      status:         'Open',
      owner:          risk.owner ?? '',
      raisedFromRiskId: risk.id,
      createdAt:      new Date().toISOString(),
    }
    const entry: RaidHistoryEntry = { id: uuidv4(), timestamp: new Date().toISOString(), type: 'status_change', text: `Promoted to Issue: "${issue.title}"` }
    const updatedRisk = { ...risk, promotedToIssueId: issue.id, status: 'Mitigated' as RiskStatus, history: [...(risk.history ?? []), entry] }
    const risks  = data.risks.map(r => r.id === risk.id ? updatedRisk as Risk : r)
    const issues = [...data.issues, issue]
    setData({ ...data, risks, issues })
    setEditRisk(null)
  }

  // ── Issue CRUD ───────────────────────────────────────────────────────────────
  function saveIssue(partial: Partial<Issue>) {
    if (!partial.title) return
    const isNew = !partial.id
    const issue: Issue = {
      id:             partial.id ?? uuidv4(),
      sowId:          partial.sowId ?? null,
      title:          partial.title!,
      description:    partial.description ?? '',
      impact:         partial.impact ?? 'Medium',
      status:         partial.status ?? 'Open',
      owner:          partial.owner ?? '',
      raisedFromRiskId: partial.raisedFromRiskId,
      createdAt:      partial.createdAt ?? new Date().toISOString(),
    }
    const issues = isNew ? [...data.issues, issue] : data.issues.map(i => i.id === issue.id ? issue : i)
    setData({ ...data, issues })
    setEditIssue(null)
  }

  function deleteIssue(id: string) {
    if (!confirm('Delete this issue?')) return
    setData({ ...data, issues: data.issues.filter(i => i.id !== id) })
    setEditIssue(null)
  }

  // ── Decision CRUD ────────────────────────────────────────────────────────────
  function saveDecision(partial: Partial<Decision>) {
    if (!partial.title) return
    const isNew = !partial.id
    const decision: Decision = {
      id:          partial.id ?? uuidv4(),
      sowId:       partial.sowId ?? null,
      title:       partial.title!,
      description: partial.description ?? '',
      rationale:   partial.rationale ?? '',
      decidedBy:   partial.decidedBy ?? '',
      date:        partial.date ?? dayjs().format('YYYY-MM-DD'),
    }
    const decisions = isNew ? [...data.decisions, decision] : data.decisions.map(d => d.id === decision.id ? decision : d)
    setData({ ...data, decisions })
    setEditDecision(null)
  }

  function deleteDecision(id: string) {
    if (!confirm('Delete this decision?')) return
    setData({ ...data, decisions: data.decisions.filter(d => d.id !== id) })
    setEditDecision(null)
  }

  // ── Filtered data ────────────────────────────────────────────────────────────
  const filteredRisks = data.risks.filter(r => {
    if (filterSow !== 'all' && r.sowId !== filterSow) return false
    if (filterStatus !== 'all' && r.status !== filterStatus) return false
    if (matrixFilter && (r.likelihood !== matrixFilter.l || r.impact !== matrixFilter.i)) return false
    return true
  }).sort((a, b) => riskScore(b) - riskScore(a))

  const filteredIssues = data.issues.filter(i => {
    if (filterSow !== 'all' && i.sowId !== filterSow) return false
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    return true
  })

  const filteredDecisions = data.decisions.filter(d => {
    if (filterSow !== 'all' && d.sowId !== filterSow) return false
    return true
  }).sort((a, b) => b.date.localeCompare(a.date))

  const tabStyle = (t: string): React.CSSProperties => ({
    padding: '8px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
    background: tab === t ? 'rgba(56,189,248,0.12)' : 'transparent',
    color: tab === t ? 'var(--sky-bright)' : 'var(--text-3)',
    border: 'none', borderBottom: tab === t ? '2px solid var(--sky-bright)' : '2px solid transparent',
    fontFamily: 'var(--font-main)', transition: 'all 0.15s',
  })

  return (
    <div className="view-root">
      <div className="view-header">
        <div>
          <h1 className="view-title">RAID Log</h1>
          <p className="view-sub">Risks · Issues · Decisions</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost btn-sm" onClick={exportCurrentTab} title={`Export ${tab} as CSV`}>
            <Download size={13} /> Export CSV
          </button>
          <button className="btn-ghost btn-sm" onClick={() => importRef.current?.click()} title={`Import ${tab} from CSV`}>
            <UploadIcon size={13} /> Import CSV
          </button>
          <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) { importFromCsv(e.target.files[0]); e.target.value = '' } }} />
          {tab === 'risks'     && <button className="btn-primary" onClick={() => setEditRisk({})}><Plus size={14} /> Add Risk</button>}
          {tab === 'issues'    && <button className="btn-primary" onClick={() => setEditIssue({})}><Plus size={14} /> Add Issue</button>}
          {tab === 'decisions' && <button className="btn-primary" onClick={() => setEditDecision({})}><Plus size={14} /> Add Decision</button>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button style={tabStyle('risks')}     onClick={() => setTab('risks')}>Risks ({data.risks.filter(r => r.status === 'Open').length} open)</button>
        <button style={tabStyle('issues')}    onClick={() => setTab('issues')}>Issues ({data.issues.filter(i => i.status !== 'Resolved').length} open)</button>
        <button style={tabStyle('decisions')} onClick={() => setTab('decisions')}>Decisions ({data.decisions.length})</button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select className="field-input field-input-sm" value={filterSow} onChange={e => setFilterSow(e.target.value)}>
          <option value="all">All projects</option>
          {data.sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
        </select>
        {tab !== 'decisions' && (
          <select className="field-input field-input-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {tab === 'risks'
              ? ['Open','Mitigated','Closed'].map(s => <option key={s} value={s}>{s}</option>)
              : ['Open','In Progress','Resolved'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        {tab === 'risks' && matrixFilter && (
          <button className="btn-ghost btn-sm" onClick={() => setMatrixFilter(null)}>
            <X size={11} /> Clear matrix filter
          </button>
        )}
      </div>

      {/* ── RISKS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'risks' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 24, alignItems: 'start' }}>
          {/* Matrix */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
              Risk Matrix {matrixFilter && `· Filtered ${matrixFilter.l}×${matrixFilter.i}`}
            </div>
            <RiskMatrix
              selectedL={matrixFilter?.l} selectedI={matrixFilter?.i}
              onSelect={(l, i) => setMatrixFilter(prev => prev?.l === l && prev?.i === i ? null : { l, i })}
            />
          </div>

          {/* Table */}
          <div>
            {filteredRisks.length === 0 && <div className="empty-state">No risks logged yet.</div>}
            {filteredRisks.map(r => {
              const sc  = riskScore(r)
              const res = riskResidualScore(r)
              const sow = data.sows.find(s => s.id === r.sowId)
              return (
                <div key={r.id} style={{
                  background: 'var(--card)', border: `1px solid var(--border)`,
                  borderLeft: `3px solid ${riskScoreColor(sc)}`,
                  borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 10,
                  cursor: 'pointer',
                }} onClick={() => setEditRisk(r)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{r.title}</div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                        {sow && <span style={{ fontSize: 10, fontWeight: 700, color: sow.color, background: sow.color + '18', padding: '1px 7px', borderRadius: 10 }}>{sow.shortName}</span>}
                        <span style={{ fontSize: 10, fontWeight: 700, color: riskScoreColor(sc), fontFamily: 'var(--font-mono)' }}>
                          {r.likelihood}×{r.impact}={sc}
                        </span>
                        {r.mitigationScore && r.mitigationScore > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, color: riskScoreColor(res), fontFamily: 'var(--font-mono)' }}>
                            → residual {res}
                          </span>
                        )}
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                          background: r.status === 'Open' ? 'rgba(248,113,113,0.12)' : r.status === 'Mitigated' ? 'rgba(251,191,36,0.12)' : 'rgba(52,211,153,0.12)',
                          color: r.status === 'Open' ? 'var(--red-bright)' : r.status === 'Mitigated' ? 'var(--amber-bright)' : 'var(--emerald-bright)',
                        }}>{r.status}</span>
                        {r.promotedToIssueId && <span style={{ fontSize: 10, color: 'var(--violet-bright)', fontWeight: 700 }}>↗ Issue</span>}
                        {r.owner && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.owner}</span>}
                      </div>
                    </div>
                    <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── ISSUES TAB ────────────────────────────────────────────────────── */}
      {tab === 'issues' && (
        <div>
          {filteredIssues.length === 0 && <div className="empty-state">No issues logged yet.</div>}
          {filteredIssues.map(i => {
            const sow = data.sows.find(s => s.id === i.sowId)
            const linkedRisk = i.raisedFromRiskId ? data.risks.find(r => r.id === i.raisedFromRiskId) : null
            const impactColor = ISSUE_IMPACT_COLORS[i.impact]
            return (
              <div key={i.id} style={{
                background: 'var(--card)', border: `1px solid var(--border)`,
                borderLeft: `3px solid ${impactColor}`,
                borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 10, cursor: 'pointer',
              }} onClick={() => setEditIssue(i)}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{i.title}</div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                      {sow && <span style={{ fontSize: 10, fontWeight: 700, color: sow.color, background: sow.color + '18', padding: '1px 7px', borderRadius: 10 }}>{sow.shortName}</span>}
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10, background: impactColor + '18', color: impactColor }}>{i.impact}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                        background: i.status === 'Resolved' ? 'rgba(52,211,153,0.12)' : 'rgba(251,191,36,0.12)',
                        color: i.status === 'Resolved' ? 'var(--emerald-bright)' : 'var(--amber-bright)',
                      }}>{i.status}</span>
                      {linkedRisk && <span style={{ fontSize: 10, color: 'var(--violet-bright)', fontWeight: 700 }}>↑ From risk</span>}
                      {i.owner && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{i.owner}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── DECISIONS TAB ─────────────────────────────────────────────────── */}
      {tab === 'decisions' && (
        <div>
          {filteredDecisions.length === 0 && <div className="empty-state">No decisions logged yet.</div>}
          {filteredDecisions.map(d => {
            const sow = data.sows.find(s => s.id === d.sowId)
            return (
              <div key={d.id} style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', padding: '14px 16px', marginBottom: 10, cursor: 'pointer',
              }} onClick={() => setEditDecision(d)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{d.title}</div>
                    {d.rationale && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.4 }}>{d.rationale}</div>}
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {sow && <span style={{ fontSize: 10, fontWeight: 700, color: sow.color, background: sow.color + '18', padding: '1px 7px', borderRadius: 10 }}>{sow.shortName}</span>}
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>{d.date}</span>
                      {d.decidedBy && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>· {d.decidedBy}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {editRisk !== null && (
        <RiskModal
          risk={editRisk} sows={data.sows}
          onSave={saveRisk}
          onDelete={editRisk.id ? () => deleteRisk(editRisk.id!) : undefined}
          onPromote={editRisk.id ? () => promoteRisk(editRisk) : undefined}
          onClose={() => setEditRisk(null)}
        />
      )}
      {editIssue !== null && (
        <IssueModal
          issue={editIssue} sows={data.sows}
          onSave={saveIssue}
          onDelete={editIssue.id ? () => deleteIssue(editIssue.id!) : undefined}
          onClose={() => setEditIssue(null)}
        />
      )}
      {editDecision !== null && (
        <DecisionModal
          decision={editDecision} sows={data.sows}
          onSave={saveDecision}
          onDelete={editDecision.id ? () => deleteDecision(editDecision.id!) : undefined}
          onClose={() => setEditDecision(null)}
        />
      )}
    </div>
  )
}
