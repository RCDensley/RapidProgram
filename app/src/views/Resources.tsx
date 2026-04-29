import React, { useState } from 'react'
import { useApp } from '../App'
import { Resource, ResourceAllocation, ALL_ROLES, ALL_PHASES, ROLE_RATES, PhaseName, PHASE_COLORS } from '../types'
import { allocationForecastHours, allocationForecastCost, derivedAllocationDates } from '../utils/calculations'
import { v4 as uuidv4 } from 'uuid'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import dayjs from 'dayjs'

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}
function fmtH(n: number) { return `${Math.round(n)}h` }

export default function Resources() {
  const { data, setData } = useApp()
  const [selectedResource, setSelectedResource] = useState<string | null>(data.resources[0]?.id ?? null)
  const [editingResource, setEditingResource]   = useState<Partial<Resource> | null>(null)
  const [editingAlloc,    setEditingAlloc]       = useState<Partial<ResourceAllocation> | null>(null)

  const selectedRes    = data.resources.find(r => r.id === selectedResource)
  const selectedAllocs = data.allocations.filter(a => a.resourceId === selectedResource)

  // ── Resource CRUD ─────────────────────────────────────────────────────────
  function saveResource(r: Partial<Resource>) {
    if (!r.name || !r.role) return
    const isNew     = !r.id
    const resource: Resource = {
      id: r.id ?? uuidv4(),
      name: r.name!,
      initials: r.initials ?? '',
      role: r.role!,
      hourlyRate: r.hourlyRate ?? ROLE_RATES[r.role!],
      active: r.active ?? true,
    }
    const resources = isNew
      ? [...data.resources, resource]
      : data.resources.map(x => x.id === resource.id ? resource : x)
    setData({ ...data, resources })
    setEditingResource(null)
    if (isNew) setSelectedResource(resource.id)
  }

  function deleteResource(id: string) {
    if (!confirm('Remove this resource and all their allocations?')) return
    setData({
      ...data,
      resources:   data.resources.filter(r => r.id !== id),
      allocations: data.allocations.filter(a => a.resourceId !== id),
    })
    setSelectedResource(data.resources.find(r => r.id !== id)?.id ?? null)
  }

  // ── Allocation CRUD ───────────────────────────────────────────────────────
  function saveAlloc(a: Partial<ResourceAllocation>) {
    if (!a.sowId || !a.daysPerWeek) return
    const isNew = !a.id
    const alloc: ResourceAllocation = {
      id: a.id ?? uuidv4(),
      resourceId: selectedResource!,
      sowId: a.sowId!,
      daysPerWeek: Number(a.daysPerWeek),
      engagedPhases: a.engagedPhases ?? ['Deliver'],
      notes: a.notes,
    }
    const allocations = isNew
      ? [...data.allocations, alloc]
      : data.allocations.map(x => x.id === alloc.id ? alloc : x)
    setData({ ...data, allocations })
    setEditingAlloc(null)
  }

  function deleteAlloc(id: string) {
    setData({ ...data, allocations: data.allocations.filter(a => a.id !== id) })
  }

  return (
    <div className="view-root">
      <div className="view-header">
        <div>
          <h1 className="view-title">Resources</h1>
          <p className="view-sub">Manage team members, roles, and phase engagements</p>
        </div>
        <button className="btn-primary" onClick={() => setEditingResource({})}>
          <Plus size={14} /> Add Resource
        </button>
      </div>

      <div className="resources-grid">

        {/* ── Resource list ── */}
        <div className="resource-list-col">
          {data.resources.map(res => {
            const totalForecastH = data.allocations
              .filter(a => a.resourceId === res.id)
              .reduce((s, a) => {
                const sow = data.sows.find(sw => sw.id === a.sowId)
                return sow ? s + allocationForecastHours(a, sow) : s
              }, 0)
            const totalForecastCost = data.allocations
              .filter(a => a.resourceId === res.id)
              .reduce((s, a) => {
                const sow = data.sows.find(sw => sw.id === a.sowId)
                return sow ? s + allocationForecastCost(a, sow, data.resources) : s
              }, 0)
            const isSelected = res.id === selectedResource
            return (
              <div
                key={res.id}
                className={`resource-card ${isSelected ? 'resource-card-selected' : ''}`}
                onClick={() => setSelectedResource(res.id)}
              >
                <div className="resource-avatar">
                  {res.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="resource-info">
                  <div className="resource-name">{res.name}</div>
                  <div className="resource-role">{res.role}</div>
                  <div className="resource-stats font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                    {fmtH(totalForecastH)} · {fmt(totalForecastCost)}
                  </div>
                </div>
                <div className="resource-actions">
                  <button className="icon-btn" onClick={e => { e.stopPropagation(); setEditingResource(res) }}>
                    <Pencil size={13} />
                  </button>
                  <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={e => { e.stopPropagation(); deleteResource(res.id) }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Allocation detail ── */}
        <div className="alloc-detail-col">
          {selectedRes ? (
            <>
              <div className="alloc-detail-header">
                <div>
                  <h2 className="section-title mb-0">{selectedRes.name}</h2>
                  <div className="text-xs" style={{ color: 'var(--text-3)', marginTop: 4 }}>
                    {selectedRes.role} · {fmt(selectedRes.hourlyRate)}/hr · Initials: <span className="font-mono">{selectedRes.initials}</span>
                  </div>
                </div>
                <button className="btn-secondary" onClick={() => setEditingAlloc({ resourceId: selectedRes.id })}>
                  <Plus size={13} /> Add engagement
                </button>
              </div>

              {selectedAllocs.length === 0 && (
                <div className="empty-state">No engagements yet. Add one to start forecasting.</div>
              )}

              {selectedAllocs.map(alloc => {
                const sow = data.sows.find(s => s.id === alloc.sowId)
                const { startDate, endDate } = sow
                  ? derivedAllocationDates(alloc, sow)
                  : { startDate: '—', endDate: '—' }
                const fh = sow ? allocationForecastHours(alloc, sow) : 0
                const fc = sow ? allocationForecastCost(alloc, sow, data.resources) : 0

                return (
                  <div key={alloc.id} className="alloc-card" style={{ borderLeftColor: sow?.color ?? '#334155' }}>
                    <div className="alloc-card-top">
                      <div>
                        <div className="alloc-sow-name">{sow?.shortName ?? alloc.sowId}</div>
                        <div className="alloc-dates font-mono text-xs" style={{ color: 'var(--text-3)', marginTop: 3 }}>
                          {dayjs(startDate).format('D MMM YY')} – {dayjs(endDate).format('D MMM YY')}
                        </div>
                        {/* Phase chips */}
                        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
                          {(alloc.engagedPhases ?? []).map(p => (
                            <span key={p} style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                              background: PHASE_COLORS[p] + '22', color: PHASE_COLORS[p],
                              border: `1px solid ${PHASE_COLORS[p]}55`,
                            }}>{p}</span>
                          ))}
                        </div>
                      </div>
                      <div className="alloc-right">
                        <div className="alloc-days font-mono">{alloc.daysPerWeek}d/wk</div>
                        <div className="alloc-forecast text-xs" style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                          {fmtH(fh)} · {fmt(fc)}
                        </div>
                      </div>
                    </div>
                    {alloc.notes && <div className="alloc-notes">{alloc.notes}</div>}
                    <div className="alloc-actions">
                      <button className="icon-btn" onClick={() => setEditingAlloc(alloc)}><Pencil size={12} /></button>
                      <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={() => deleteAlloc(alloc.id)}><Trash2 size={12} /></button>
                    </div>
                  </div>
                )
              })}
            </>
          ) : (
            <div className="empty-state">Select a resource to view their engagements</div>
          )}
        </div>
      </div>

      {/* ── Resource modal ── */}
      {editingResource !== null && (
        <Modal title={editingResource.id ? 'Edit Resource' : 'Add Resource'} onClose={() => setEditingResource(null)}>
          <Field label="Name">
            <input className="field-input" value={editingResource.name ?? ''}
              onChange={e => setEditingResource({ ...editingResource, name: e.target.value })} />
          </Field>
          <Field label="ConnectWise Initials (Member field)">
            <input className="field-input font-mono" placeholder="e.g. CDensley"
              value={editingResource.initials ?? ''}
              onChange={e => setEditingResource({ ...editingResource, initials: e.target.value })} />
          </Field>
          <Field label="Role">
            <select className="field-input" value={editingResource.role ?? ''}
              onChange={e => {
                const role = e.target.value as import('../types').RoleKey
                setEditingResource({ ...editingResource, role, hourlyRate: ROLE_RATES[role] })
              }}>
              <option value="">Select role…</option>
              {ALL_ROLES.map(r => <option key={r} value={r}>{r} — ${ROLE_RATES[r]}/hr</option>)}
            </select>
          </Field>
          <Field label="Hourly Rate (AUD)">
            <input className="field-input font-mono" type="number"
              value={editingResource.hourlyRate ?? ''}
              onChange={e => setEditingResource({ ...editingResource, hourlyRate: Number(e.target.value) })} />
          </Field>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setEditingResource(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => saveResource(editingResource)}>Save</button>
          </div>
        </Modal>
      )}

      {/* ── Allocation modal ── */}
      {editingAlloc !== null && (
        <Modal title={editingAlloc.id ? 'Edit Engagement' : 'Add Engagement'} onClose={() => setEditingAlloc(null)}>
          <Field label="SOW">
            <select className="field-input" value={editingAlloc.sowId ?? ''}
              onChange={e => setEditingAlloc({ ...editingAlloc, sowId: e.target.value, engagedPhases: [] })}>
              <option value="">Select SOW…</option>
              {data.sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
            </select>
          </Field>

          <Field label="Phases engaged">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ALL_PHASES.map(phase => {
                const sow      = data.sows.find(s => s.id === editingAlloc.sowId)
                const phaseObj = sow?.phases.find(p => p.name === phase)
                const checked  = (editingAlloc.engagedPhases ?? []).includes(phase)
                return (
                  <label key={phase} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <input type="checkbox" checked={checked}
                      onChange={e => {
                        const current = editingAlloc.engagedPhases ?? []
                        const updated = e.target.checked
                          ? [...current, phase] as PhaseName[]
                          : current.filter(p => p !== phase) as PhaseName[]
                        setEditingAlloc({ ...editingAlloc, engagedPhases: updated })
                      }} />
                    <span style={{ color: PHASE_COLORS[phase], fontWeight: 700, fontSize: 13, minWidth: 72 }}>
                      {phase}
                    </span>
                    {phaseObj && (
                      <span className="font-mono text-xs" style={{ color: 'var(--text-3)' }}>
                        {dayjs(phaseObj.startDate).format('D MMM')} – {dayjs(phaseObj.endDate).format('D MMM YY')}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>
          </Field>

          <Field label="Days per week">
            <input className="field-input font-mono" type="number" step="0.5" min="0.5" max="5"
              value={editingAlloc.daysPerWeek ?? ''}
              onChange={e => setEditingAlloc({ ...editingAlloc, daysPerWeek: Number(e.target.value) })} />
          </Field>
          <Field label="Notes (optional)">
            <input className="field-input" value={editingAlloc.notes ?? ''}
              onChange={e => setEditingAlloc({ ...editingAlloc, notes: e.target.value })} />
          </Field>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={() => setEditingAlloc(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => saveAlloc(editingAlloc)}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{title}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field">
      <label className="field-label">{label}</label>
      {children}
    </div>
  )
}
