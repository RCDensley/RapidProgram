import React, { useState } from 'react'
import { useApp } from '../App'
import { SOW, Phase, PhaseName, BudgetSource, PHASE_COLORS } from '../types'
import { sowTotalBudget } from '../utils/calculations'
import { v4 as uuidv4 } from 'uuid'
import { Plus, Pencil, Trash2, Save } from 'lucide-react'
import dayjs from 'dayjs'

const PHASE_NAMES: PhaseName[] = ['Discover', 'Plan', 'Deliver', 'Handover']

// Preset colour swatches for budget sources
const SOURCE_COLORS = [
  '#38bdf8', '#818cf8', '#a78bfa', '#34d399', '#fb923c',
  '#f87171', '#fbbf24', '#e879f9', '#94a3b8',
]

// ─── SE-1: MonthHalfPicker ────────────────────────────────────────────────────
// Replaces <input type="date"> everywhere in Settings.
// Snaps to the 1st or 15th of the selected month, matching the Project Plan.
function MonthHalfPicker({
  value, onChange, monthStart, monthEnd,
}: {
  value: string
  onChange: (v: string) => void
  monthStart?: string   // YYYY-MM, earliest option (optional)
  monthEnd?: string     // YYYY-MM, latest option (optional)
}) {
  const parsed   = value ? dayjs(value) : dayjs()
  const isFirst  = !value || parsed.date() <= 14
  const currMonth = value ? parsed.format('YYYY-MM') : dayjs().format('YYYY-MM')

  // Build month list within bounds
  const from = monthStart
    ? dayjs(monthStart + '-01').subtract(1, 'month')
    : dayjs().subtract(6, 'month').startOf('month')
  const to   = monthEnd
    ? dayjs(monthEnd + '-01').add(3, 'month')
    : dayjs().add(30, 'month').startOf('month')

  const months: string[] = []
  let m = from.startOf('month')
  while (m.isBefore(to) || m.isSame(to, 'month')) {
    months.push(m.format('YYYY-MM'))
    m = m.add(1, 'month')
  }

  function emit(month: string, first: boolean) {
    onChange(`${month}-${first ? '01' : '15'}`)
  }

  const btnBase: React.CSSProperties = {
    padding: '6px 10px', fontSize: 11, fontWeight: 800,
    border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)',
    transition: 'all 0.12s',
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <select
        className="field-input"
        value={months.includes(currMonth) ? currMonth : months[0]}
        onChange={e => emit(e.target.value, isFirst)}
        style={{ flex: 1 }}
      >
        {months.map(mo => (
          <option key={mo} value={mo}>
            {dayjs(mo + '-01').format('MMM YYYY')}
          </option>
        ))}
      </select>
      {/* 1st / 15th toggle */}
      <div style={{
        display: 'flex', flexShrink: 0,
        borderRadius: 'var(--radius-sm)', overflow: 'hidden',
        border: '1.5px solid var(--border)',
      }}>
        <button
          type="button"
          onClick={() => emit(currMonth, true)}
          style={{
            ...btnBase,
            background: isFirst ? 'rgba(56,189,248,0.15)' : 'transparent',
            color: isFirst ? 'var(--sky-bright)' : 'var(--text-3)',
          }}>
          1st
        </button>
        <button
          type="button"
          onClick={() => emit(currMonth, false)}
          style={{
            ...btnBase,
            background: !isFirst ? 'rgba(56,189,248,0.15)' : 'transparent',
            color: !isFirst ? 'var(--sky-bright)' : 'var(--text-3)',
            borderLeft: '1px solid var(--border)',
          }}>
          15th
        </button>
      </div>
    </div>
  )
}

// ─── SE-2: BudgetSourceEditor ─────────────────────────────────────────────────
// Inline editor for the list of funding sources on a SOW.
function BudgetSourceEditor({ sow, onChange }: {
  sow: SOW
  onChange: (sources: BudgetSource[]) => void
}) {
  const sources = sow.budgetSources ?? []
  const total   = sowTotalBudget(sow)

  function updateSource(id: string, patch: Partial<BudgetSource>) {
    onChange(sources.map(s => s.id === id ? { ...s, ...patch } : s))
  }
  function removeSource(id: string) {
    onChange(sources.filter(s => s.id !== id))
  }
  function addSource() {
    const used  = new Set(sources.map(s => s.color))
    const color = SOURCE_COLORS.find(c => !used.has(c)) ?? '#94a3b8'
    onChange([...sources, { id: uuidv4(), label: 'New source', amount: 0, color }])
  }

  return (
    <div>
      {sources.map(src => (
        <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          {/* Colour picker */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{
              width: 20, height: 20, borderRadius: 4, background: src.color,
              cursor: 'pointer', border: '2px solid rgba(255,255,255,0.15)',
            }} />
            <input
              type="color"
              value={src.color}
              onChange={e => updateSource(src.id, { color: e.target.value })}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: 20, height: 20 }}
            />
          </div>
          {/* Label */}
          <input
            className="field-input"
            style={{ flex: 1, fontSize: 12, padding: '5px 8px' }}
            value={src.label}
            placeholder="Source label"
            onChange={e => updateSource(src.id, { label: e.target.value })}
          />
          {/* Amount */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <span style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              fontSize: 11, color: 'var(--text-3)', pointerEvents: 'none',
            }}>$</span>
            <input
              className="field-input font-mono"
              type="number"
              style={{ width: 110, fontSize: 12, padding: '5px 8px 5px 18px' }}
              value={src.amount || ''}
              placeholder="0"
              onChange={e => updateSource(src.id, { amount: Number(e.target.value) })}
            />
          </div>
          <button className="icon-btn" style={{ color: 'var(--red)', flexShrink: 0 }}
            onClick={() => removeSource(src.id)}>
            <Trash2 size={12} />
          </button>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
        <button className="btn-ghost btn-sm" onClick={addSource}>
          <Plus size={11} /> Add source
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
          Total:{' '}
          <strong style={{ color: 'var(--text-1)' }}>
            {total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })}
          </strong>
        </div>
      </div>
    </div>
  )
}

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}

// ─── Main Settings view ───────────────────────────────────────────────────────
export default function Settings() {
  const { data, setData } = useApp()
  const [editingSOW, setEditingSOW] = useState<Partial<SOW> | null>(null)

  // Compute program date range for month pickers
  const programStart = data.sows.map(s => s.startDate).sort()[0]
  const programEnd   = data.sows.map(s => s.endDate).sort().reverse()[0]

  // ── SOW CRUD ────────────────────────────────────────────────────────────────
  function saveSOW(s: Partial<SOW>) {
    if (!s.name) return
    const isNew = !s.id
    const sow: SOW = {
      id:           s.id ?? uuidv4(),
      name:         s.name!,
      shortName:    s.shortName || s.name!.split(' ').slice(0, 2).join(' '),
      budgetSources: s.budgetSources ?? [],
      bufferPct:    Number(s.bufferPct ?? 0.2),
      startDate:    s.startDate ?? dayjs().format('YYYY-MM-DD'),
      endDate:      s.endDate   ?? dayjs().add(6, 'month').format('YYYY-MM-DD'),
      color:        s.color  ?? '#38bdf8',
      status:       s.status ?? 'Active',
      phases:       s.phases ?? [],
      projectCodes: s.projectCodes ?? [],
    }
    const sows = isNew ? [...data.sows, sow] : data.sows.map(x => x.id === sow.id ? sow : x)
    setData({ ...data, sows })
    setEditingSOW(null)
  }

  function deleteSOW(id: string) {
    if (!confirm('Delete this SOW and all its allocations?')) return
    setData({
      ...data,
      sows:        data.sows.filter(s => s.id !== id),
      allocations: data.allocations.filter(a => a.sowId !== id),
      timeEntries: data.timeEntries.map(e => e.sowId === id ? { ...e, sowId: undefined } : e),
    })
  }

  // ── Phase CRUD ──────────────────────────────────────────────────────────────
  function addPhase(sow: SOW) {
    const phase: Phase = { id: uuidv4(), name: 'Deliver', startDate: sow.startDate, endDate: sow.endDate }
    updateSOW(sow.id, { phases: [...sow.phases, phase] })
  }

  function updatePhase(sowId: string, phase: Phase) {
    updateSOW(sowId, {
      phases: data.sows.find(s => s.id === sowId)!.phases.map(p => p.id === phase.id ? phase : p)
    })
  }

  function deletePhase(sowId: string, phaseId: string) {
    updateSOW(sowId, {
      phases: data.sows.find(s => s.id === sowId)!.phases.filter(p => p.id !== phaseId)
    })
  }

  function updateSOW(id: string, patch: Partial<SOW>) {
    setData({ ...data, sows: data.sows.map(s => s.id === id ? { ...s, ...patch } : s) })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="view-root">
      <div className="view-header">
        <div>
          <h1 className="view-title">Settings</h1>
          <p className="view-sub">Configure SOWs, phases, budgets, and project code mappings</p>
        </div>
        <button className="btn-primary" onClick={() => setEditingSOW({})}>
          <Plus size={14} /> Add SOW
        </button>
      </div>

      {data.sows.map(sow => {
        const total = sowTotalBudget(sow)
        return (
          <div key={sow.id} className="settings-sow-card" style={{ borderLeftColor: sow.color }}>
            <div className="settings-sow-header">
              <div>
                <div className="settings-sow-name">{sow.name}</div>
                <div className="settings-sow-meta font-mono text-xs" style={{ color: 'var(--text-3)', marginTop: 3 }}>
                  {dayjs(sow.startDate).format('D MMM YY')} – {dayjs(sow.endDate).format('D MMM YY')} ·{' '}
                  {total.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })} ·{' '}
                  buffer {Math.round(sow.bufferPct * 100)}%
                </div>
              </div>
              <div className="settings-sow-actions">
                <button className="btn-secondary btn-sm" onClick={() => setEditingSOW({ ...sow })}>
                  <Pencil size={12} /> Edit
                </button>
                <button className="btn-danger btn-sm" onClick={() => deleteSOW(sow.id)}>
                  <Trash2 size={12} />
                </button>
              </div>
            </div>

            {/* ── SE-1: Phases with MonthHalfPicker ── */}
            <div className="phases-section">
              <div className="phases-header">
                <span className="text-xs font-mono uppercase tracking-wider" style={{ color: 'var(--text-3)' }}>
                  Phases
                </span>
                <button className="btn-ghost btn-sm" onClick={() => addPhase(sow)}>
                  <Plus size={11} /> Add phase
                </button>
              </div>
              {sow.phases.map(phase => (
                <div key={phase.id} className="phase-row" style={{ alignItems: 'center', gap: 10 }}>
                  <div className="phase-dot" style={{ background: PHASE_COLORS[phase.name] }} />
                  <select
                    className="field-input field-input-sm"
                    style={{ width: 110, flexShrink: 0 }}
                    value={phase.name}
                    onChange={e => updatePhase(sow.id, { ...phase, name: e.target.value as PhaseName })}
                  >
                    {PHASE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                  {/* SE-1: MonthHalfPicker instead of date input */}
                  <MonthHalfPicker
                    value={phase.startDate}
                    onChange={v => updatePhase(sow.id, { ...phase, startDate: v })}
                    monthStart={sow.startDate.slice(0, 7)}
                    monthEnd={sow.endDate.slice(0, 7)}
                  />
                  <span style={{ color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                  <MonthHalfPicker
                    value={phase.endDate}
                    onChange={v => updatePhase(sow.id, { ...phase, endDate: v })}
                    monthStart={sow.startDate.slice(0, 7)}
                    monthEnd={sow.endDate.slice(0, 7)}
                  />
                  <button className="icon-btn" style={{ color: 'var(--red)', flexShrink: 0 }}
                    onClick={() => deletePhase(sow.id, phase.id)}>
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>

            {/* ── SE-2: Budget sources ── */}
            <div style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                Budget Sources
              </div>
              <BudgetSourceEditor
                sow={sow}
                onChange={sources => updateSOW(sow.id, { budgetSources: sources })}
              />
            </div>

            {/* ── ConnectWise project codes ── */}
            <div className="project-codes-section" style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                ConnectWise Project Codes
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 6, fontWeight: 600 }}>
                Comma-separated values from the "Project" field in ConnectWise that map to this SOW.
              </div>
              <input
                className="field-input font-mono text-xs"
                value={sow.projectCodes.join(', ')}
                onChange={e => {
                  const codes = e.target.value.split(',').map(c => c.trim()).filter(Boolean)
                  updateSOW(sow.id, { projectCodes: codes })
                }}
                placeholder="e.g. IntoWork - Automation Champion, Automation Champion Program"
              />
            </div>
          </div>
        )
      })}

      {/* ── SOW add/edit modal ── */}
      {editingSOW !== null && (
        <div className="modal-overlay" onClick={() => setEditingSOW(null)}>
          <div className="modal" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{editingSOW.id ? 'Edit SOW' : 'Add SOW'}</h3>
              <button className="modal-close" onClick={() => setEditingSOW(null)}>✕</button>
            </div>
            <div className="modal-body">
              <Field label="Full name">
                <input className="field-input" value={editingSOW.name ?? ''}
                  onChange={e => setEditingSOW({ ...editingSOW, name: e.target.value })} />
              </Field>
              <Field label="Short name (for charts)">
                <input className="field-input" value={editingSOW.shortName ?? ''}
                  onChange={e => setEditingSOW({ ...editingSOW, shortName: e.target.value })} />
              </Field>
              <Field label="Buffer %">
                <input className="field-input font-mono" type="number" step="0.05" min="0" max="0.5"
                  value={editingSOW.bufferPct ?? 0.2}
                  onChange={e => setEditingSOW({ ...editingSOW, bufferPct: Number(e.target.value) })} />
              </Field>
              {/* SE-1: MonthHalfPicker for SOW start/end */}
              <div className="field-row">
                <Field label="Start">
                  <MonthHalfPicker
                    value={editingSOW.startDate ?? ''}
                    onChange={v => setEditingSOW({ ...editingSOW, startDate: v })}
                    monthStart={programStart?.slice(0, 7)}
                    monthEnd={programEnd?.slice(0, 7)}
                  />
                </Field>
                <Field label="End">
                  <MonthHalfPicker
                    value={editingSOW.endDate ?? ''}
                    onChange={v => setEditingSOW({ ...editingSOW, endDate: v })}
                    monthStart={programStart?.slice(0, 7)}
                    monthEnd={programEnd?.slice(0, 7)}
                  />
                </Field>
              </div>
              <Field label="Status">
                <select className="field-input" value={editingSOW.status ?? 'Active'}
                  onChange={e => setEditingSOW({ ...editingSOW, status: e.target.value as SOW['status'] })}>
                  <option value="Active">Active</option>
                  <option value="Awaiting Signature">Awaiting Signature</option>
                  <option value="Complete">Complete</option>
                  <option value="Pipeline">Pipeline</option>
                </select>
              </Field>
              <Field label="Colour">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="field-input font-mono" value={editingSOW.color ?? '#38bdf8'}
                    onChange={e => setEditingSOW({ ...editingSOW, color: e.target.value })} />
                  <input type="color" value={editingSOW.color ?? '#38bdf8'}
                    onChange={e => setEditingSOW({ ...editingSOW, color: e.target.value })}
                    style={{ height: 36, width: 36, borderRadius: 6, border: 0, cursor: 'pointer', flexShrink: 0 }} />
                </div>
              </Field>
              <div className="modal-actions">
                <button className="btn-secondary" onClick={() => setEditingSOW(null)}>Cancel</button>
                <button className="btn-primary" onClick={() => saveSOW(editingSOW)}>
                  <Save size={13} /> Save SOW
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
