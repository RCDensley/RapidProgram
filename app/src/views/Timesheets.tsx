import React, { useState, useRef } from 'react'
import { useApp } from '../App'
import {
  parseConnectWiseCSV, deduplicateEntries,
  parseCSVHeaders, detectColumnMap,
  ColumnMap, DEFAULT_COLUMN_MAP,
} from '../utils/csvParser'
import { sowTotalBudget } from '../utils/calculations'
import { TimeEntry } from '../types'
import {
  Upload, CheckCircle2, AlertTriangle, Trash2,
  Filter, ChevronDown, ChevronRight, Info,
} from 'lucide-react'

function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}

// ─── Column mapping field labels ──────────────────────────────────────────────
const FIELD_LABELS: Record<keyof ColumnMap, string> = {
  date:     'Date',
  member:   'Member / Consultant',
  company:  'Company / Client',
  project:  'Project / SOW',
  hours:    'Hours',
  workRole: 'Work Role / Grade',
  billable: 'Billable flag',
  notes:    'Notes / Description',
  status:   'Status',
}

// ─── Column mapping editor ────────────────────────────────────────────────────
function ColumnMapper({ headers, map, onChange }: {
  headers: string[]
  map: ColumnMap
  onChange: (m: ColumnMap) => void
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginTop: 12 }}>
      {(Object.keys(map) as (keyof ColumnMap)[]).map(field => (
        <div key={field} className="field" style={{ marginBottom: 0 }}>
          <label className="field-label">{FIELD_LABELS[field]}</label>
          {headers.length > 0 ? (
            <select className="field-input field-input-sm" value={map[field]}
              onChange={e => onChange({ ...map, [field]: e.target.value })}>
              {headers.map(h => <option key={h} value={h}>{h}</option>)}
              <option value="">— not mapped —</option>
            </select>
          ) : (
            <input className="field-input field-input-sm font-mono" value={map[field]}
              onChange={e => onChange({ ...map, [field]: e.target.value })} placeholder="Column name" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Bulk budget source assignment ────────────────────────────────────────────
// Sets the default source for all rows in a SOW — individual rows can override below.
function BudgetSourceAssignment({ preview, sows, selections, onChange }: {
  preview: TimeEntry[]
  sows: any[]
  selections: Record<string, string>
  onChange: (s: Record<string, string>) => void
}) {
  const affectedSowIds = [
    ...new Set(preview.filter(e => e.sowId && e.billable === 'Billable').map(e => e.sowId!))
  ]
  if (affectedSowIds.length === 0) return null

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <Info size={14} style={{ color: 'var(--violet-bright)', flexShrink: 0 }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>Bulk budget source defaults</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            Sets the default for all rows. Override individual rows in the table below.
          </div>
        </div>
      </div>

      {affectedSowIds.map(sowId => {
        const sow     = sows.find(s => s.id === sowId)
        if (!sow) return null
        const sources = sow.budgetSources ?? []
        const hours   = preview.filter(e => e.sowId === sowId && e.billable === 'Billable').reduce((s: number, e: TimeEntry) => s + e.hours, 0)
        const cost    = preview.filter(e => e.sowId === sowId && e.billable === 'Billable').reduce((s: number, e: TimeEntry) => s + (e.resolvedCost ?? 0), 0)
        const isAuto  = sources.length <= 1
        const selected = selections[sowId]

        return (
          <div key={sowId} style={{
            border: `1px solid ${sow.color}44`, borderLeft: `3px solid ${sow.color}`,
            borderRadius: 'var(--radius-sm)', padding: '12px 14px', marginBottom: 10, background: sow.color + '08',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{sow.shortName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                  {hours.toFixed(1)}h · {fmt(cost)} billable
                </div>
              </div>
              {isAuto && sources[0] && (
                <div style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: 'rgba(52,211,153,0.12)', color: 'var(--emerald-bright)', border: '1px solid rgba(52,211,153,0.25)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>
                  Auto-assigned
                </div>
              )}
            </div>
            {isAuto ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-2)' }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: sources[0]?.color ?? sow.color }} />
                <span style={{ fontWeight: 600 }}>{sources[0]?.label ?? 'Default'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>{fmt(sources[0]?.amount ?? sowTotalBudget(sow))}</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sources.map((src: any) => {
                  const isChosen = selected === src.id
                  return (
                    <label key={src.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                      background: isChosen ? src.color + '18' : 'transparent',
                      border: `1.5px solid ${isChosen ? src.color + '88' : 'var(--border)'}`,
                      transition: 'all 0.15s',
                    }}>
                      <input type="radio" name={`source-${sowId}`} value={src.id} checked={isChosen}
                        onChange={() => onChange({ ...selections, [sowId]: src.id })} style={{ accentColor: src.color }} />
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: src.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: isChosen ? src.color : 'var(--text-2)', flex: 1 }}>{src.label}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>{fmt(src.amount)}</span>
                    </label>
                  )
                })}
                {!selected && (
                  <div style={{ fontSize: 11, color: 'var(--amber-bright)', marginTop: 4, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <AlertTriangle size={11} /> Select a default source (or assign per-row below)
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function Timesheets() {
  const { data, setData } = useApp()

  const [preview,       setPreview]       = useState<TimeEntry[] | null>(null)
  const [parseErrors,   setParseErrors]   = useState<string[]>([])
  const [companyFilter, setCompanyFilter] = useState('IntoWork')
  const [csvHeaders,    setCsvHeaders]    = useState<string[]>([])
  const [columnMap,     setColumnMap]     = useState<ColumnMap>(DEFAULT_COLUMN_MAP)
  const [showMapping,   setShowMapping]   = useState(false)

  // Bulk defaults per SOW
  const [sourceSelections, setSourceSelections] = useState<Record<string, string>>({})

  // Per-row overrides — keyed by entry id
  const [entryOverrides, setEntryOverrides] = useState<Record<string, {
    sowId?: string | null
    budgetSourceId?: string
  }>>({})

  const [filterSOW,    setFilterSOW]    = useState<string>('all')
  const [filterMember, setFilterMember] = useState<string>('all')
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())

  const fileRef = useRef<HTMLInputElement>(null)

  // Helpers: resolve effective SOW and source for a preview row
  function effectiveSOW(entry: TimeEntry) {
    const ov    = entryOverrides[entry.id]
    const sowId = ov && 'sowId' in ov ? ov.sowId : entry.sowId
    return sowId ? data.sows.find(s => s.id === sowId) ?? null : null
  }
  function effectiveBudgetSourceId(entry: TimeEntry): string | undefined {
    const ov  = entryOverrides[entry.id]
    if (ov?.budgetSourceId) return ov.budgetSourceId
    const sow = effectiveSOW(entry)
    if (!sow) return undefined
    return sourceSelections[sow.id]
  }

  // ── Parse ──────────────────────────────────────────────────────────────────
  function handleFile(file: File) {
    const reader = new FileReader()
    reader.onload = ev => {
      const text    = ev.target?.result as string
      const headers = parseCSVHeaders(text)
      setCsvHeaders(headers)
      const detected = detectColumnMap(headers)
      setColumnMap(detected)
      runParse(text, detected)
    }
    reader.readAsText(file)
  }

  function runParse(text: string, map: ColumnMap) {
    const { entries, errors } = parseConnectWiseCSV(text, data.sows, data.resources, companyFilter || undefined, map)
    setPreview(entries)
    setParseErrors(errors)
    setEntryOverrides({})
    const auto: Record<string, string> = {}
    for (const sow of data.sows) {
      if ((sow.budgetSources ?? []).length === 1) auto[sow.id] = sow.budgetSources![0].id
    }
    setSourceSelections(auto)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }

  // ── Import readiness ───────────────────────────────────────────────────────
  // Ready when every billable entry with a multi-source SOW has a source assigned
  // (either via bulk default or per-row override).
  const importReady = !(preview ?? []).some(entry => {
    if (entry.billable !== 'Billable') return false
    const sow = effectiveSOW(entry)
    if (!sow) return false
    if ((sow.budgetSources ?? []).length <= 1) return false
    return !effectiveBudgetSourceId(entry)
  })

  function confirmImport() {
    if (!preview) return
    const tagged = preview.map(entry => {
      const ov     = entryOverrides[entry.id] ?? {}
      const sowId  = 'sowId' in ov ? ov.sowId : entry.sowId
      const srcId  = ov.budgetSourceId ?? (sowId ? sourceSelections[sowId] : undefined)
      return { ...entry, sowId: sowId ?? entry.sowId, budgetSourceId: srcId }
    })
    const merged = deduplicateEntries(data.timeEntries, tagged)
    const added  = merged.length - data.timeEntries.length
    setData({ ...data, timeEntries: merged })
    setPreview(null); setCsvHeaders([]); setSourceSelections({}); setEntryOverrides({})
    alert(`Imported ${added} new entries (${tagged.length - added} duplicates skipped).`)
  }

  // ── Row management ─────────────────────────────────────────────────────────
  function deleteEntry(id: string) {
    setData({ ...data, timeEntries: data.timeEntries.filter(e => e.id !== id) })
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }
  function deleteSelected() {
    if (!confirm(`Delete ${selectedIds.size} selected entries?`)) return
    setData({ ...data, timeEntries: data.timeEntries.filter(e => !selectedIds.has(e.id)) })
    setSelectedIds(new Set())
  }
  function toggleSelect(id: string) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleSelectAll() {
    setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(e => e.id)))
  }

  // ── Display ────────────────────────────────────────────────────────────────
  const filtered = data.timeEntries.filter(e => {
    if (filterSOW    !== 'all' && e.sowId  !== filterSOW)    return false
    if (filterMember !== 'all' && e.member !== filterMember) return false
    return true
  })
  const members   = [...new Set(data.timeEntries.map(e => e.member))].sort()
  const totalH    = filtered.reduce((s, e) => s + e.hours, 0)
  const totalCost = filtered.reduce((s, e) => s + (e.resolvedCost ?? 0), 0)

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="view-root">
      <div className="view-header">
        <div>
          <h1 className="view-title">Timesheets</h1>
          <p className="view-sub">Upload ConnectWise (or any) CSV export to track actuals</p>
        </div>
        {data.timeEntries.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            {selectedIds.size > 0 && (
              <button className="btn-danger" onClick={deleteSelected}><Trash2 size={13} /> Delete {selectedIds.size} selected</button>
            )}
            <button className="btn-danger" onClick={() => {
              if (!confirm('Clear ALL imported time entries?')) return
              setData({ ...data, timeEntries: [] }); setSelectedIds(new Set())
            }}><Trash2 size={13} /> Clear all</button>
          </div>
        )}
      </div>

      {/* ── Upload ── */}
      <div className="upload-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <div className="field-inline">
            <label className="field-label">Company filter</label>
            <input className="field-input field-input-sm font-mono" placeholder="e.g. IntoWork"
              value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>Leave blank to import all companies</div>
          <button className={`btn-ghost btn-sm ${showMapping ? 'active' : ''}`} style={{ marginLeft: 'auto' }}
            onClick={() => setShowMapping(p => !p)}>
            {showMapping ? <ChevronDown size={12} /> : <ChevronRight size={12} />} CSV Column Mapping
          </button>
        </div>

        {showMapping && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginBottom: 8 }}>
              {csvHeaders.length > 0 ? `${csvHeaders.length} columns detected — adjust if auto-detection got anything wrong.` : 'Upload a CSV to auto-detect columns, or enter the exact column names your export uses.'}
            </div>
            <ColumnMapper headers={csvHeaders} map={columnMap} onChange={setColumnMap} />
            {preview && (
              <button className="btn-secondary btn-sm" style={{ marginTop: 12 }}
                onClick={() => { setPreview(null); alert('Re-upload your CSV to apply the updated column mapping.') }}>
                Re-parse with updated mapping
              </button>
            )}
          </div>
        )}

        <div className="dropzone" onDrop={handleDrop} onDragOver={e => e.preventDefault()} onClick={() => fileRef.current?.click()}>
          <Upload size={24} style={{ color: 'var(--text-3)', marginBottom: 8 }} />
          <div className="dropzone-label">Drop a CSV here or click to browse</div>
          <div className="dropzone-sub">ConnectWise columns auto-detected · Any CSV format supported via column mapping above</div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }} />
        </div>

        {parseErrors.length > 0 && (
          <div className="parse-errors"><AlertTriangle size={13} /><span>{parseErrors.length} rows failed to parse</span></div>
        )}
      </div>

      {/* ── Preview ── */}
      {preview && (
        <div className="preview-section">
          <div className="preview-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={15} style={{ color: 'var(--emerald-bright)' }} />
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 700 }}>
                {preview.length} entries parsed
                {preview.filter(e => !e.sowId).length > 0 && (
                  <span style={{ color: 'var(--amber-bright)', marginLeft: 8, fontSize: 12 }}>
                    · {preview.filter(e => !e.sowId).length} unmapped
                  </span>
                )}
              </span>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => { setPreview(null); setCsvHeaders([]); setEntryOverrides({}) }}>Discard</button>
          </div>

          {/* Bulk defaults */}
          <BudgetSourceAssignment preview={preview} sows={data.sows} selections={sourceSelections}
            onChange={sel => {
              setSourceSelections(sel)
              // Clear per-row source overrides so they inherit the new bulk default
              setEntryOverrides(prev => {
                const next = { ...prev }
                Object.keys(next).forEach(id => { if (next[id].budgetSourceId) delete next[id].budgetSourceId })
                return next
              })
            }} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="btn-primary" onClick={confirmImport} disabled={!importReady}
              style={{ opacity: importReady ? 1 : 0.45, cursor: importReady ? 'pointer' : 'not-allowed' }}>
              <CheckCircle2 size={14} />
              Import {preview.length} entries
              {!importReady && ' — assign budget sources above or per-row below'}
            </button>
          </div>

          {/* Per-row override table */}
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, fontWeight: 600 }}>
            Use the SOW and Source dropdowns on each row to override the bulk defaults above. Rows highlighted in amber still need a source assigned.
          </div>
          <div className="timesheet-table-wrap">
            <table className="timesheet-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Member</th>
                  <th>SOW</th>
                  <th>Budget Source</th>
                  <th>Hours</th>
                  <th>Billable</th>
                  <th>Role</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 100).map(e => {
                  const effSow   = effectiveSOW(e)
                  const effSrcId = effectiveBudgetSourceId(e)
                  const effSrc   = effSow?.budgetSources?.find((s: any) => s.id === effSrcId)
                  const isOverridden = !!entryOverrides[e.id]
                  const needsSource  = effSow && (effSow.budgetSources ?? []).length > 1 && !effSrcId

                  return (
                    <tr key={e.id}
                      className={!effSow ? 'row-unmapped' : ''}
                      style={{
                        background: needsSource
                          ? 'rgba(251,191,36,0.06)'
                          : isOverridden ? 'rgba(56,189,248,0.04)' : undefined
                      }}
                    >
                      <td className="font-mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{e.date}</td>
                      <td style={{ fontSize: 11 }}>{e.member}</td>

                      {/* SOW dropdown */}
                      <td style={{ minWidth: 140 }}>
                        <select
                          className="field-input field-input-sm"
                          style={{
                            fontSize: 11, padding: '3px 6px', minWidth: 130,
                            color: effSow ? effSow.color : 'var(--amber-bright)',
                            fontWeight: 700,
                          }}
                          value={entryOverrides[e.id]?.sowId ?? e.sowId ?? ''}
                          onChange={ev => {
                            const newSowId = ev.target.value || null
                            setEntryOverrides(prev => ({
                              ...prev,
                              [e.id]: { ...prev[e.id], sowId: newSowId, budgetSourceId: undefined },
                            }))
                          }}
                        >
                          <option value="">— unmapped —</option>
                          {data.sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
                        </select>
                      </td>

                      {/* Budget source dropdown */}
                      <td style={{ minWidth: 160 }}>
                        {effSow ? (
                          (effSow.budgetSources ?? []).length <= 1 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ width: 7, height: 7, borderRadius: 2, background: effSow.budgetSources?.[0]?.color ?? effSow.color, flexShrink: 0 }} />
                              <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
                                {effSow.budgetSources?.[0]?.label ?? 'Default'}
                              </span>
                            </div>
                          ) : (
                            <select
                              className="field-input field-input-sm"
                              style={{
                                fontSize: 11, padding: '3px 6px', minWidth: 150,
                                borderColor: needsSource ? 'var(--amber)' : effSrc ? effSrc.color + '88' : undefined,
                              }}
                              value={effSrcId ?? ''}
                              onChange={ev => {
                                const srcId = ev.target.value || undefined
                                setEntryOverrides(prev => ({
                                  ...prev,
                                  [e.id]: { ...prev[e.id], budgetSourceId: srcId },
                                }))
                              }}
                            >
                              <option value="">— select —</option>
                              {(effSow.budgetSources ?? []).map((src: any) => (
                                <option key={src.id} value={src.id}>{src.label}</option>
                              ))}
                            </select>
                          )
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
                        )}
                      </td>

                      <td className="font-mono" style={{ fontSize: 11 }}>{e.hours}</td>
                      <td>
                        <span className={`billable-badge billable-${e.billable.toLowerCase().replace(/\s/g, '-')}`}>
                          {e.billable}
                        </span>
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)' }}>{e.workRole}</td>
                      <td className="font-mono" style={{ fontSize: 11 }}>{e.resolvedCost != null ? fmt(e.resolvedCost) : '—'}</td>
                    </tr>
                  )
                })}
                {preview.length > 100 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', color: 'var(--text-3)', fontSize: 12, padding: 10 }}>
                      …and {preview.length - 100} more rows — bulk assignment above applies to all rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Imported entries ── */}
      {!preview && data.timeEntries.length > 0 && (
        <div className="imported-section">
          <div className="filter-bar">
            <Filter size={13} style={{ color: 'var(--text-3)' }} />
            <select className="field-input field-input-sm" value={filterSOW} onChange={e => setFilterSOW(e.target.value)}>
              <option value="all">All SOWs</option>
              {data.sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
            </select>
            <select className="field-input field-input-sm" value={filterMember} onChange={e => setFilterMember(e.target.value)}>
              <option value="all">All members</option>
              {members.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <div className="filter-totals font-mono text-sm">
              <span style={{ color: 'var(--text-2)' }}>{filtered.length} entries</span>
              <span style={{ color: 'var(--sky-bright)' }}>{totalH.toFixed(1)}h</span>
              <span style={{ color: 'var(--emerald-bright)' }}>{fmt(totalCost)}</span>
              {selectedIds.size > 0 && <span style={{ color: 'var(--amber-bright)' }}>{selectedIds.size} selected</span>}
            </div>
          </div>

          <div className="timesheet-table-wrap">
            <table className="timesheet-table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onChange={toggleSelectAll} title="Select all" />
                  </th>
                  <th>Date</th><th>Member</th><th>SOW</th><th>Source</th>
                  <th>Hours</th><th>Billable</th><th>Cost</th><th>Notes</th>
                  <th style={{ width: 32 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 200).map(e => {
                  const sow    = data.sows.find(s => s.id === e.sowId)
                  const source = sow?.budgetSources?.find((s: any) => s.id === e.budgetSourceId)
                  const isSelected = selectedIds.has(e.id)
                  return (
                    <tr key={e.id} className={!e.sowId ? 'row-unmapped' : ''}
                      style={{ background: isSelected ? 'rgba(251,191,36,0.06)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(e.id)} />
                      </td>
                      <td className="font-mono" style={{ fontSize: 11 }}>{e.date}</td>
                      <td className="font-mono" style={{ fontSize: 11 }}>{e.member}</td>
                      <td>
                        {sow ? <span style={{ color: sow.color, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{sow.shortName}</span>
                          : <span style={{ color: 'var(--amber-bright)', fontSize: 11 }}>unmapped</span>}
                      </td>
                      <td>
                        {source ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                            <div style={{ width: 8, height: 8, borderRadius: 2, background: source.color }} />
                            <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>{source.label}</span>
                          </div>
                        ) : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>}
                      </td>
                      <td className="font-mono" style={{ fontSize: 11 }}>{e.hours}</td>
                      <td>
                        <span className={`billable-badge billable-${e.billable.toLowerCase().replace(/\s/g, '-')}`}>{e.billable}</span>
                      </td>
                      <td className="font-mono" style={{ fontSize: 11 }}>{e.resolvedCost != null ? fmt(e.resolvedCost) : '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-3)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="icon-btn" style={{ color: 'var(--text-3)', opacity: 0.5 }} title="Delete entry"
                          onClick={() => deleteEntry(e.id)}
                          onMouseEnter={e => { e.currentTarget.style.color = 'var(--red)'; e.currentTarget.style.opacity = '1' }}
                          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.opacity = '0.5' }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!preview && data.timeEntries.length === 0 && (
        <div className="empty-state" style={{ marginTop: 32 }}>
          No time entries imported yet. Upload a ConnectWise CSV above to get started.
        </div>
      )}
    </div>
  )
}
