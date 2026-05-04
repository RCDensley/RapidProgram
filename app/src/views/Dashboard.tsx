import React, { useState } from 'react'
import { useApp } from '../App'
import {
  getProgramSummary, sowActualCost, sowForecastCost, sowTotalBudget,
  sowBufferConsumption, sowDeliverableBudget, generateBurndownSeries,
  getCurrentPhase, getSowTeamMembers, derivedAllocationDates,
} from '../utils/calculations'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer, AreaChart, Area,
} from 'recharts'
import {
  DollarSign, TrendingDown, CheckCircle2, Clock,
  AlertTriangle, Info, X, Users, Calendar, ChevronRight, Lock, Eye,
} from 'lucide-react'
import { PHASE_COLORS } from '../types'
import dayjs from 'dayjs'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}
function pct(a: number, b: number) {
  return b > 0 ? Math.round((a / b) * 100) : 0
}

// ─── DA-2: Forecast banner ────────────────────────────────────────────────────
function ForecastBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      background: 'rgba(129, 140, 248, 0.08)',
      border: '1px solid rgba(129, 140, 248, 0.25)',
      borderRadius: 'var(--radius)', padding: '12px 16px',
      marginBottom: 24,
    }}>
      <Info size={15} style={{ color: 'var(--violet-bright)', marginTop: 1, flexShrink: 0 }} />
      <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-1)' }}>Numbers are forecast-only.</strong>{' '}
        Budget and spend figures are calculated from resource allocations and hourly rates.
        Upload ConnectWise CSV timesheets on the{' '}
        <strong style={{ color: 'var(--text-1)' }}>Timesheets</strong> page to track real actuals.
      </div>
      <button onClick={onDismiss} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--text-3)', padding: 2, flexShrink: 0,
      }}>
        <X size={14} />
      </button>
    </div>
  )
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, accent, icon: Icon, warn }: {
  label: string; value: string; sub?: string; accent: string; icon: any; warn?: boolean
}) {
  return (
    <div className={`kpi-card ${warn ? 'kpi-card-warn' : ''}`} style={{ borderColor: accent + '44' }}>
      <div className="kpi-card-top">
        <span className="kpi-label">{label}</span>
        <Icon size={15} style={{ color: accent }} />
      </div>
      <div className="kpi-value" style={{ color: accent }}>{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

// ─── Buffer bar ───────────────────────────────────────────────────────────────
function BufferBar({ pct: p, label }: { pct: number; label: string }) {
  const color = p === 0 ? '#34d399' : p < 0.5 ? '#fb923c' : '#f87171'
  return (
    <div className="buffer-bar-wrap">
      <div className="buffer-bar-label">
        <span>{label}</span>
        <span className="font-mono text-xs" style={{ color }}>{Math.round(p * 100)}%</span>
      </div>
      <div className="buffer-track">
        <div className="buffer-fill" style={{ width: `${Math.min(p * 100, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

// ─── Budget source stacked bar ────────────────────────────────────────────────
function BudgetSourceBar({ sow, actual }: { sow: any; actual: number }) {
  const total = sowTotalBudget(sow)
  if (total === 0 || !sow.budgetSources?.length) return null
  return (
    <div>
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
        {sow.budgetSources.map((src: any) => (
          <div key={src.id} style={{
            width: `${(src.amount / total) * 100}%`,
            background: src.color,
          }} />
        ))}
      </div>
      {/* Source list */}
      {sow.budgetSources.map((src: any) => (
        <div key={src.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginBottom: 6, fontSize: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: src.color, flexShrink: 0 }} />
            <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{src.label}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-1)' }}>
            {fmt(src.amount)}
          </span>
        </div>
      ))}
      {/* Actual drawn */}
      <div style={{
        marginTop: 10, paddingTop: 10,
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between',
        fontSize: 12,
      }}>
        <span style={{ color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Drawn to date
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', color: actual > 0 ? 'var(--emerald-bright)' : 'var(--text-3)' }}>
          {fmt(actual)}
        </span>
      </div>
    </div>
  )
}

// ─── View toggle ─────────────────────────────────────────────────────────────
type BurndownView = 'client' | 'internal'

function ViewToggle({ view, onChange }: { view: BurndownView; onChange: (v: BurndownView) => void }) {
  const btnStyle = (active: boolean, col: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 12px', fontSize: 11, fontWeight: 700,
    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
    fontFamily: 'var(--font-main)', border: 'none',
    background: active ? col + '22' : 'transparent',
    color: active ? col : 'var(--text-3)',
    outline: active ? `1.5px solid ${col}66` : '1.5px solid var(--border)',
    transition: 'all 0.15s',
  })
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <button style={btnStyle(view === 'client', '#38bdf8')} onClick={() => onChange('client')}>
        <Eye size={11} /> Client view
      </button>
      <button style={btnStyle(view === 'internal', '#a78bfa')} onClick={() => onChange('internal')}>
        <Lock size={11} /> Internal view
      </button>
    </div>
  )
}

// ─── Client burndown chart (total SOW vs forecast/actual) ─────────────────────
function ClientBurndownChart({ data: chartData }: { data: any[] }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, fontWeight: 600 }}>
        Forecast <span style={{ color: 'var(--violet-bright)' }}>●</span> vs
        Actual <span style={{ color: 'var(--sky-bright)' }}>●</span> — every other week
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
          <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
          <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} width={48} />
          <Tooltip
            contentStyle={{ background: '#0d1526', border: '1px solid #1e2d45', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
            formatter={(v: number, name: string) => [fmt(v), name]}
          />
          <ReferenceLine y={chartData[0]?.budgetCeiling} stroke="#f87171" strokeDasharray="4 4"
            label={{ value: 'Budget', fill: '#f87171', fontSize: 10 }} />
          <ReferenceLine y={chartData[0]?.bufferFloor} stroke="#fb923c" strokeDasharray="4 4"
            label={{ value: 'Buffer', fill: '#fb923c', fontSize: 10 }} />
          <Line type="monotone" dataKey="forecastCumulative" name="Forecast"
            stroke="#a78bfa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="actualCumulative" name="Actual"
            stroke="#38bdf8" strokeWidth={2} dot={{ r: 3, fill: '#38bdf8' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Internal burndown chart (per budget source) ──────────────────────────────
// Builds per-source cumulative spend series.
// Forecast: proportional split by source amount.
// Actual: uses budgetSourceId tagged on time entries.
function buildSourceSeries(
  sow: any,
  baseData: any[],
  timeEntries: any[],
): { series: any[]; sources: { id: string; label: string; color: string; total: number }[] } {
  const sources = sow.budgetSources ?? []
  if (!sources.length || !baseData.length) return { series: [], sources: [] }

  const totalBudget = sources.reduce((s: number, src: any) => s + src.amount, 0)

  // Build weekly actual per source from time entries
  const actualByWeekSource: Record<string, Record<string, number>> = {}
  for (const entry of timeEntries) {
    if (entry.sowId !== sow.id || !entry.budgetSourceId || !entry.resolvedCost) continue
    const week = dayjs(entry.date).startOf('isoWeek').format('MMM D')
    if (!actualByWeekSource[week]) actualByWeekSource[week] = {}
    actualByWeekSource[week][entry.budgetSourceId] =
      (actualByWeekSource[week][entry.budgetSourceId] ?? 0) + entry.resolvedCost
  }

  // Accumulate per source across weeks
  const cumActual: Record<string, number> = {}
  const cumForecast: Record<string, number> = {}
  sources.forEach((src: any) => { cumActual[src.id] = 0; cumForecast[src.id] = 0 })

  const series: any[] = []
  for (let idx = 0; idx < baseData.length; idx++) {
    const point = baseData[idx]
    // Derive weekly forecast delta from consecutive cumulative values
    const prevCumulative = idx > 0 ? (baseData[idx - 1].forecastCumulative ?? 0) : 0
    const weeklyForecast = Math.max(0, (point.forecastCumulative ?? 0) - prevCumulative)

    const row: any = { week: point.week }
    sources.forEach((src: any) => {
      const frac = totalBudget > 0 ? src.amount / totalBudget : 0
      cumForecast[src.id] += weeklyForecast * frac
      cumActual[src.id]   += actualByWeekSource[point.week]?.[src.id] ?? 0
      row[`forecast_${src.id}`] = Math.round(cumForecast[src.id])
      row[`actual_${src.id}`]   = Math.round(cumActual[src.id])
      row[`ceiling_${src.id}`]  = src.amount
    })
    series.push(row)
  }

  return { series, sources }
}

function InternalBurndownChart({ sow, baseData, timeEntries }: { sow: any; baseData: any[]; timeEntries: any[] }) {
  const { series, sources } = buildSourceSeries(sow, baseData, timeEntries)

  if (!sources.length) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
        No budget sources configured. Add them in Settings to see the internal view.
      </div>
    )
  }

  return (
    <div>
      {/* Source legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        {sources.map(src => (
          <div key={src.id} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-2)', fontWeight: 600 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: src.color }} />
            {src.label}
            <span style={{ color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>
              {fmt(src.total)}
            </span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12, fontWeight: 600 }}>
        Solid = forecast draw · Dotted reference = source ceiling
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={series} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2d45" />
          <XAxis dataKey="week" tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
          <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fill: '#64748b', fontSize: 10, fontFamily: 'JetBrains Mono' }} width={48} />
          <Tooltip
            contentStyle={{ background: '#0d1526', border: '1px solid #1e2d45', borderRadius: 8 }}
            labelStyle={{ color: '#94a3b8', fontFamily: 'JetBrains Mono', fontSize: 11 }}
            formatter={(v: number, name: string) => {
              // name is e.g. "forecast_bs-1a-1" — find label
              const [type, ...idParts] = name.split('_')
              const srcId = idParts.join('_')
              const src   = sources.find(s => s.id === srcId)
              const label = src ? `${src.label} (${type})` : name
              return [fmt(v), label]
            }}
          />
          {sources.map(src => (
            <ReferenceLine key={`ceil-${src.id}`}
              y={src.total} stroke={src.color} strokeDasharray="4 4" strokeOpacity={0.5} />
          ))}
          {sources.map(src => (
            <Line key={`forecast-${src.id}`}
              type="monotone" dataKey={`forecast_${src.id}`}
              stroke={src.color} strokeWidth={2} dot={false} strokeOpacity={0.85} />
          ))}
          {sources.map(src => (
            <Line key={`actual-${src.id}`}
              type="monotone" dataKey={`actual_${src.id}`}
              stroke={src.color} strokeWidth={2} strokeDasharray="3 2"
              dot={{ r: 2, fill: src.color }} strokeOpacity={0.6} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {sources.map(src => {
          const lastRow  = series[series.length - 1]
          const drawn    = lastRow?.[`actual_${src.id}`] ?? 0
          const forecast = lastRow?.[`forecast_${src.id}`] ?? 0
          const pctUsed  = src.total > 0 ? Math.round((Math.max(drawn, forecast) / src.total) * 100) : 0
          return (
            <div key={src.id} style={{ fontSize: 11 }}>
              <div style={{ color: src.color, fontWeight: 800, marginBottom: 2 }}>{src.label}</div>
              <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-2)' }}>
                {fmt(Math.max(drawn, forecast))} / {fmt(src.total)}
                <span style={{ color: pctUsed > 90 ? '#f87171' : 'var(--text-3)', marginLeft: 4 }}>
                  ({pctUsed}%)
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Combined burndown wrapper ────────────────────────────────────────────────
function BurndownChart({ sow, data: chartData, timeEntries, view, onViewChange }: {
  sow?: any; data: any[]; timeEntries: any[]
  view: BurndownView; onViewChange: (v: BurndownView) => void
}) {
  const hasMultipleSources = (sow?.budgetSources?.length ?? 0) > 1
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
        <ViewToggle view={view} onChange={onViewChange} />
      </div>
      {view === 'client' || !sow ? (
        <ClientBurndownChart data={chartData} />
      ) : (
        <InternalBurndownChart sow={sow} baseData={chartData} timeEntries={timeEntries} />
      )}
      {view === 'internal' && !hasMultipleSources && sow && (
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, fontWeight: 600 }}>
          Only one budget source configured — internal and client views are identical. Add sources in Settings.
        </div>
      )}
    </div>
  )
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const { data } = useApp()
  const summary = getProgramSummary(data)
  const today   = dayjs().format('D MMM YYYY')

  // DA-2: banner dismissal — persists for the session only
  const [bannerDismissed, setBannerDismissed] = useState(() =>
    sessionStorage.getItem('forecast-banner-dismissed') === '1'
  )
  function dismissBanner() {
    sessionStorage.setItem('forecast-banner-dismissed', '1')
    setBannerDismissed(true)
  }

  // DA-1: SOW selector — controls the left-panel detail view
  const [selectedSowId, setSelectedSowId] = useState<string | null>(null)
  const [burndownView,  setBurndownView]  = useState<BurndownView>('client')
  // Separate chart SOW — null means program-wide aggregate
  const [chartSowId,    setChartSowId]   = useState<string | null>(null)

  const selectedSow = data.sows.find(s => s.id === selectedSowId) ?? null
  function toggleSow(id: string) {
    setSelectedSowId(prev => prev === id ? null : id)
  }

  // Burndown data — program aggregate when chartSowId is null, else SOW-specific
  const chartSow = data.sows.find(s => s.id === chartSowId) ?? null

  // Program-level burndown: sum all SOWs week by week
  function buildProgramBurndown() {
    if (data.sows.length === 0) return []
    const allSeries = data.sows.map(sow =>
      generateBurndownSeries(sow, data)
    )
    // Use the longest series as the week axis
    const longest = allSeries.reduce((a, b) => a.length >= b.length ? a : b, [])
    return longest.map((point, i) => {
      const forecastCumulative = allSeries.reduce((sum, s) => sum + (s[i]?.forecastCumulative ?? 0), 0)
      const actualCumulative   = allSeries.reduce((sum, s) => sum + (s[i]?.actualCumulative   ?? 0), 0)
      const budgetCeiling      = allSeries.reduce((sum, s) => sum + (s[i]?.budgetCeiling      ?? 0), 0)
      const bufferFloor        = allSeries.reduce((sum, s) => sum + (s[i]?.bufferFloor        ?? 0), 0)
      return { week: point.week, date: point.date, forecastCumulative, actualCumulative, budgetCeiling, bufferFloor }
    }).filter((_, i) => i % 2 === 0)
  }

  const burndownData = chartSow
    ? generateBurndownSeries(chartSow, data).filter((_, i) => i % 2 === 0)
    : buildProgramBurndown()

  // DA-1 detail data
  const teamMembers   = selectedSow ? getSowTeamMembers(selectedSow.id, data) : []
  const currentPhase  = selectedSow ? getCurrentPhase(selectedSow) : null
  const sowActual     = selectedSow ? sowActualCost(selectedSow.id, data) : 0
  const sowForecast   = selectedSow ? sowForecastCost(selectedSow.id, data) : 0
  const sowBudget     = selectedSow ? sowTotalBudget(selectedSow) : 0

  return (
    <div className="view-root">

      {/* DA-2: Forecast banner */}
      {!bannerDismissed && <ForecastBanner onDismiss={dismissBanner} />}

      {/* Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Program Dashboard</h1>
          <p className="view-sub">IntoWork × Rapid Circle · As of {today}</p>
        </div>
        {selectedSow && (
          <button
            onClick={() => setSelectedSowId(null)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: selectedSow.color + '22',
              border: `1.5px solid ${selectedSow.color}66`,
              borderRadius: 'var(--radius-sm)',
              color: selectedSow.color, fontSize: 12, fontWeight: 700,
              padding: '6px 12px', cursor: 'pointer',
              fontFamily: 'var(--font-main)',
            }}>
            <X size={12} /> {selectedSow.shortName}
          </button>
        )}
      </div>

      {/* KPI row */}
      <div className="kpi-row" style={{ marginBottom: 24 }}>
        <KPICard
          label="Total Budget"
          value={fmt(summary.totalBudget)}
          sub={`${data.sows.length} active SOWs`}
          accent="#38bdf8" icon={DollarSign}
        />
        <KPICard
          label="Forecast Spend"
          value={fmt(summary.totalForecast)}
          sub={`${pct(summary.totalForecast, summary.totalBudget)}% of budget`}
          accent="#a78bfa" icon={TrendingDown}
        />
        <KPICard
          label="Actual Spend"
          value={fmt(summary.totalActual)}
          sub={`${pct(summary.totalActual, summary.totalBudget)}% of budget`}
          accent="#34d399" icon={CheckCircle2}
        />
        <KPICard
          label="Budget Remaining"
          value={fmt(summary.totalRemaining)}
          sub="ex GST"
          accent={summary.totalRemaining < 0 ? '#f87171' : '#fb923c'}
          icon={Clock}
          warn={summary.totalRemaining < 0}
        />
      </div>

      {/* Main grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>

        {/* ── Left: SOW cards ── */}
        <div>
          <h2 className="section-title">
            SOW Status
            {!selectedSow && (
              <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                — click to inspect
              </span>
            )}
          </h2>

          {data.sows.map(sow => {
            const actual   = sowActualCost(sow.id, data)
            const forecast = sowForecastCost(sow.id, data)
            const bufPct   = sowBufferConsumption(sow, data)
            const budget   = sowTotalBudget(sow)
            const spentPct = budget > 0 ? actual / budget : 0
            const isSelected = sow.id === selectedSowId
            return (
              <div
                key={sow.id}
                className="sow-card"
                onClick={() => toggleSow(sow.id)}
                style={{
                  borderLeftColor: sow.color,
                  cursor: 'pointer',
                  outline: isSelected ? `2px solid ${sow.color}` : 'none',
                  outlineOffset: 1,
                  transition: 'outline 0.15s',
                }}
              >
                <div className="sow-card-header">
                  <div>
                    <div className="sow-card-name">{sow.shortName}</div>
                    <div className="sow-card-dates">
                      {dayjs(sow.startDate).format('MMM YY')} – {dayjs(sow.endDate).format('MMM YY')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="sow-card-badge" style={{ background: sow.color + '22', color: sow.color }}>
                      {sow.status}
                    </div>
                    <ChevronRight size={13} style={{ color: isSelected ? sow.color : 'var(--text-3)', transition: 'color 0.15s' }} />
                  </div>
                </div>

                <div className="sow-financials">
                  <div className="sow-fin-item">
                    <span className="sow-fin-label">Budget</span>
                    <span className="sow-fin-value font-mono">{fmt(budget)}</span>
                  </div>
                  <div className="sow-fin-item">
                    <span className="sow-fin-label">Forecast</span>
                    <span className="sow-fin-value font-mono" style={{ color: '#a78bfa' }}>{fmt(forecast)}</span>
                  </div>
                  <div className="sow-fin-item">
                    <span className="sow-fin-label">Actual</span>
                    <span className="sow-fin-value font-mono" style={{ color: sow.color }}>{fmt(actual)}</span>
                  </div>
                </div>

                <div className="spend-track">
                  <div className="spend-fill" style={{ width: `${Math.min(spentPct * 100, 100)}%`, background: sow.color }} />
                  <div className="spend-buffer-line" style={{ left: `${(1 - sow.bufferPct) * 100}%`, background: 'var(--amber)' }} />
                </div>
                <div className="spend-labels">
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>{Math.round(spentPct * 100)}% spent</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-3)' }}>buffer @ {Math.round((1 - sow.bufferPct) * 100)}%</span>
                </div>

                {bufPct > 0 && (
                  <div className="buffer-alert">
                    <AlertTriangle size={12} />
                    Drawing on buffer — {Math.round(bufPct * 100)}% consumed
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Right: detail panel (DA-1) or program summary ── */}
        <div>
          {selectedSow ? (
            /* ── SOW detail view ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Phase + dates header */}
              <div style={{
                background: 'var(--card)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${selectedSow.color}`,
                borderRadius: 'var(--radius)', padding: '16px 18px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
                      {selectedSow.name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Calendar size={11} />
                      {dayjs(selectedSow.startDate).format('D MMM YY')} – {dayjs(selectedSow.endDate).format('D MMM YY')}
                    </div>
                  </div>
                  {/* Current phase chip */}
                  {currentPhase ? (
                    <div style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                      background: PHASE_COLORS[currentPhase.name] + '22',
                      border: `1.5px solid ${PHASE_COLORS[currentPhase.name]}66`,
                      color: PHASE_COLORS[currentPhase.name],
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {currentPhase.name}
                    </div>
                  ) : (
                    <div style={{
                      padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                      background: 'rgba(100,116,139,0.15)',
                      border: '1.5px solid rgba(100,116,139,0.3)',
                      color: 'var(--text-3)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                    }}>
                      {dayjs().isBefore(selectedSow.startDate) ? 'Pre-start' : 'Complete'}
                    </div>
                  )}
                </div>

                {/* Phases timeline */}
                <div style={{ display: 'flex', gap: 4 }}>
                  {selectedSow.phases.map(phase => {
                    const isActive = currentPhase?.id === phase.id
                    const isPast   = dayjs().isAfter(phase.endDate)
                    return (
                      <div key={phase.id} style={{ flex: 1 }}>
                        <div style={{
                          height: 6, borderRadius: 3,
                          background: isActive ? PHASE_COLORS[phase.name]
                            : isPast ? PHASE_COLORS[phase.name] + '66'
                            : 'var(--border)',
                        }} />
                        <div style={{ fontSize: 9, color: isActive ? PHASE_COLORS[phase.name] : 'var(--text-3)', marginTop: 4, fontWeight: 700 }}>
                          {phase.name.slice(0, 3).toUpperCase()}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Two-column: team + budget */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Team members */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Users size={12} /> Team
                  </h3>
                  {teamMembers.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No resources allocated</div>
                  )}
                  {teamMembers.map(res => {
                    const alloc = data.allocations.find(a => a.resourceId === res.id && a.sowId === selectedSow.id)
                    const { startDate, endDate } = alloc ? derivedAllocationDates(alloc, selectedSow) : { startDate: '', endDate: '' }
                    return (
                      <div key={res.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(129, 140, 248, 0.18)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 10, fontWeight: 700, color: 'var(--violet-bright)',
                          fontFamily: 'var(--font-mono)',
                        }}>
                          {res.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {res.name.split(' ')[0]} {res.name.split(' ')[1]?.[0]}.
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{res.role}</div>
                          {alloc && (
                            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                              {alloc.daysPerWeek}d/wk
                            </div>
                          )}
                          {/* Phase chips */}
                          {alloc?.engagedPhases && (
                            <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', marginTop: 4 }}>
                              {alloc.engagedPhases.map(p => (
                                <span key={p} style={{
                                  fontSize: 8, fontWeight: 800, padding: '1px 5px',
                                  borderRadius: 8, textTransform: 'uppercase',
                                  background: PHASE_COLORS[p] + '22',
                                  color: PHASE_COLORS[p],
                                }}>
                                  {p.slice(0, 3)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Budget sources */}
                <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <DollarSign size={12} /> Funding
                  </h3>
                  <BudgetSourceBar sow={selectedSow} actual={sowActual} />
                  {/* Quick stats */}
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Forecast</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--violet-bright)', marginTop: 3 }}>{fmt(sowForecast)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buffer</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--amber-bright)', marginTop: 3 }}>
                        {fmt(sowBudget * selectedSow.bufferPct)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SOW-specific burndown */}
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px' }}>
                <h3 style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
                  Burndown — {selectedSow.shortName}
                </h3>
                <BurndownChart
                  sow={selectedSow}
                  data={burndownData}
                  timeEntries={data.timeEntries}
                  view={burndownView}
                  onViewChange={setBurndownView}
                />
              </div>
            </div>

          ) : (
            /* ── Program summary view ── */
            <div>
              <h2 className="section-title">
                {chartSow ? `Burndown — ${chartSow.shortName}` : 'Program Burndown'}
                <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                  {chartSow ? 'click Program to see full program view' : 'click a project to filter'}
                </span>
              </h2>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px', marginBottom: 20 }}>
                <BurndownChart
                  sow={chartSow ?? undefined}
                  data={burndownData}
                  timeEntries={data.timeEntries}
                  view={burndownView}
                  onViewChange={setBurndownView}
                />
                {/* Chart pills — control the burndown chart only, not the detail panel */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
                  {/* Program pill */}
                  <button
                    onClick={() => setChartSowId(null)}
                    style={{
                      fontSize: 11, fontWeight: 700, padding: '4px 14px',
                      borderRadius: 20, border: '1.5px solid #94a3b8',
                      background: chartSowId === null ? 'rgba(148,163,184,0.15)' : 'transparent',
                      color: '#94a3b8', cursor: 'pointer', fontFamily: 'var(--font-main)',
                    }}>
                    Program
                  </button>
                  {/* Per-SOW pills */}
                  {data.sows.map(sow => (
                    <button
                      key={sow.id}
                      onClick={() => setChartSowId(sow.id)}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 14px',
                        borderRadius: 20, border: `1.5px solid ${sow.color}`,
                        background: chartSowId === sow.id ? sow.color + '22' : 'transparent',
                        color: sow.color, cursor: 'pointer', fontFamily: 'var(--font-main)',
                      }}>
                      {sow.shortName}
                    </button>
                  ))}
                </div>
              </div>

              <h2 className="section-title mt-6">Buffer Consumption</h2>
              <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
                {data.sows.map(sow => (
                  <BufferBar key={sow.id} label={sow.shortName} pct={sowBufferConsumption(sow, data)} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
