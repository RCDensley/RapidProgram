import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../App'
import { Milestone, PauseBlock, PhaseName, PHASE_COLORS, SOW } from '../types'
import { monthsBetween, dateToMonthOffset, derivedAllocationDates } from '../utils/calculations'
import dayjs from 'dayjs'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
dayjs.extend(isSameOrAfter)
dayjs.extend(isSameOrBefore)
import {
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon,
  RotateCcw, Pause, X, Flag,
} from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'

// ─── Constants ────────────────────────────────────────────────────────────────
const BASE_MONTH_WIDTH = 160
const MILESTONE_LANE_H = 20   // slim band — just enough for a diamond row
const SOW_LANE_H       = 52   // height per lane within a SOW row
const ALLOC_ROW_H      = 30
const HEADER_H         = 44
const LABEL_W          = 210
const HANDLE_W         = 8
const MIN_ZOOM         = 0.35
const MAX_ZOOM         = 3.5
const ZOOM_STEP        = 0.15
const PAN_STEP         = 1
const MONTH_BUFFER     = 6    // PP-1: extra months rendered beyond visible area

// ─── Types ────────────────────────────────────────────────────────────────────
type DragType = 'move' | 'resize-left' | 'resize-right'

interface DragState {
  type: DragType
  sowId: string
  blockId: string
  blockKind: 'phase' | 'pause'
  startMouseX: number
  origStart: string
  origEnd: string
}

interface Block { id: string; startDate: string; endDate: string }

// ─── PP-2: Lane assignment ────────────────────────────────────────────────────
// Greedy interval scheduling — assigns each block to the lowest available lane.
function assignLanes(blocks: Block[]): Map<string, number> {
  const sorted     = [...blocks].sort((a, b) => a.startDate.localeCompare(b.startDate))
  const laneEnds:  string[] = []
  const laneMap    = new Map<string, number>()
  for (const b of sorted) {
    let lane = laneEnds.findIndex(end => end <= b.startDate)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = b.endDate
    laneMap.set(b.id, lane)
  }
  return laneMap
}

function getLaneCount(blocks: Block[]): number {
  if (blocks.length === 0) return 1
  return Math.max(...Array.from(assignLanes(blocks).values())) + 1
}

// ─── Snap helper ─────────────────────────────────────────────────────────────
function snapDate(d: dayjs.Dayjs): string {
  const day = d.date()
  if (day < 8)  return d.startOf('month').format('YYYY-MM-DD')
  if (day < 22) return d.date(15).format('YYYY-MM-DD')
  return d.add(1, 'month').startOf('month').format('YYYY-MM-DD')
}

const HATCH_ID = 'pause-hatch'

// ─── Milestone colours ────────────────────────────────────────────────────────
const MILESTONE_PRESET_COLORS = ['#38bdf8', '#fbbf24', '#f87171', '#34d399', '#fb923c', '#a78bfa', '#e879f9']

// ─────────────────────────────────────────────────────────────────────────────
export default function ProjectPlan() {
  const { data, setData, updateData } = useApp()

  // ── State ──────────────────────────────────────────────────────────────────
  const [zoom,       setZoom]       = useState(1.0)
  const [panMonths,  setPan]        = useState(0)
  const [drag,       setDrag]       = useState<DragState | null>(null)
  const [hoverId,    setHoverId]    = useState<string | null>(null)
  const [msHoverId,  setMsHoverId]  = useState<string | null>(null)
  const [addingPause,    setAddingPause]    = useState(false)
  const [pauseModal,     setPauseModal]     = useState<{ sowId: string } | null>(null)
  const [milestoneModal, setMilestoneModal] = useState<Partial<Milestone> | null>(null)
  const [containerW, setContainerW] = useState(1200)  // PP-1: tracked for dynamic months

  // PP-3: collapsed by default
  const [expandedSOWs, setExpandedSOWs] = useState<Set<string>>(new Set())

  const containerRef = useRef<HTMLDivElement>(null)

  // PP-1: track container width via ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerW(Math.max(400, entries[0].contentRect.width - LABEL_W))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // ── Derived ────────────────────────────────────────────────────────────────
  const monthWidth = BASE_MONTH_WIDTH * zoom

  const allStarts = data.sows.map(s => s.startDate).sort()
  const allEnds   = data.sows.map(s => s.endDate).sort().reverse()
  const progStart    = allStarts[0] ?? dayjs().format('YYYY-MM-DD')
  const progEnd      = allEnds[0]   ?? dayjs().add(6, 'month').format('YYYY-MM-DD')
  // calendarStart: 3 months before the first SOW start.
  // This is the true left edge of the canvas, allowing Feb/Mar to be visible.
  const calendarStart = dayjs(progStart).subtract(3, 'month').startOf('month').format('YYYY-MM-DD')

  // PP-1: dynamic end — canvas extends as you pan right
  const containerWidthMonths = containerW / monthWidth
  const dynamicEndOffset     = panMonths + containerWidthMonths + MONTH_BUFFER
  const dynamicEnd = dayjs(calendarStart).startOf('month')
    .add(dynamicEndOffset * 30.437, 'day').format('YYYY-MM-DD')
  const effectiveEnd = dynamicEnd > progEnd ? dynamicEnd : progEnd
  const months   = monthsBetween(calendarStart, effectiveEnd)
  const totalW   = months.length * monthWidth
  const todayX   = (dateToMonthOffset(dayjs().format('YYYY-MM-DD'), calendarStart) - panMonths) * monthWidth

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  const dateToX = useCallback((dateStr: string) =>
    (dateToMonthOffset(dateStr, calendarStart) - panMonths) * monthWidth,
    [calendarStart, panMonths, monthWidth]
  )

  // ── Milestone swimlane geometry ────────────────────────────────────────────
  // Each milestone gets a synthetic endDate based on its pill pixel width,
  // so the lane-stacking algorithm knows when labels visually collide.
  const msPillW = (label: string) => Math.max(52, label.length * 7 + 22)
  const msPillEndDate = (m: { date: string; label: string }) => {
    const pillMonths = msPillW(m.label) / monthWidth
    return dayjs(calendarStart).startOf('month')
      .add((dateToMonthOffset(m.date, calendarStart) + pillMonths) * 30.437, 'day')
      .format('YYYY-MM-DD')
  }
  // Milestone band is always one lane tall — diamonds only, no pills
  const milestoneBandH = MILESTONE_LANE_H

  // ── PP-2: lane data per SOW ────────────────────────────────────────────────
  const sowLaneData = Object.fromEntries(
    data.sows.map(sow => {
      const pauses = data.pauses.filter(p => p.sowId === sow.id)
      const blocks: Block[] = [
        ...sow.phases.map(p => ({ id: p.id, startDate: p.startDate, endDate: p.endDate })),
        ...pauses.map(p  => ({ id: p.id, startDate: p.startDate, endDate: p.endDate })),
      ]
      const lanes     = assignLanes(blocks)
      const laneCount = getLaneCount(blocks)
      return [sow.id, { lanes, laneCount }]
    })
  )

  // ── Canvas height (PP-2 + PP-3 aware) ─────────────────────────────────────
  const getSowRowH = (sow: SOW) => SOW_LANE_H * (sowLaneData[sow.id]?.laneCount ?? 1)
  const getResourceRows = (sow: SOW) =>
    expandedSOWs.has(sow.id)
      ? [...new Set(data.allocations.filter(a => a.sowId === sow.id).map(a => a.resourceId))]
      : []

  const canvasH = data.sows.reduce((h, sow) => {
    return h + getSowRowH(sow) + getResourceRows(sow).length * ALLOC_ROW_H
  }, HEADER_H + milestoneBandH)

  // ── Drag system ────────────────────────────────────────────────────────────
  function startDrag(
    e: React.MouseEvent, type: DragType,
    sowId: string, blockId: string, blockKind: 'phase' | 'pause',
    origStart: string, origEnd: string,
  ) {
    e.preventDefault(); e.stopPropagation()
    setDrag({ type, sowId, blockId, blockKind, startMouseX: e.clientX, origStart, origEnd })
  }

  useEffect(() => {
    if (!drag) return
    let latestData = data

    function onMove(e: MouseEvent) {
      const d        = drag!
      const deltaM   = (e.clientX - d.startMouseX) / monthWidth
      // Use calendarStart as the base so offsets are consistent with dateToX
      const baseDay  = dayjs(calendarStart).startOf('month')
      const startOff = dateToMonthOffset(d.origStart, calendarStart)
      const endOff   = dateToMonthOffset(d.origEnd, calendarStart)

      let ns = d.origStart, ne = d.origEnd
      if (d.type === 'move') {
        ns = snapDate(baseDay.add((startOff + deltaM) * 30.437, 'day'))
        ne = snapDate(baseDay.add((endOff   + deltaM) * 30.437, 'day'))
      } else if (d.type === 'resize-left') {
        ns = snapDate(baseDay.add((startOff + deltaM) * 30.437, 'day'))
        if (dayjs(ns).isSameOrAfter(dayjs(d.origEnd))) ns = d.origStart
      } else if (d.type === 'resize-right') {
        ne = snapDate(baseDay.add((endOff + deltaM) * 30.437, 'day'))
        if (dayjs(ne).isSameOrBefore(dayjs(d.origStart))) ne = d.origEnd
      }

      latestData = d.blockKind === 'phase'
        ? { ...data, sows: data.sows.map(s => s.id === d.sowId ? {
            ...s, phases: s.phases.map(p => p.id === d.blockId ? { ...p, startDate: ns, endDate: ne } : p)
          } : s) }
        : { ...data, pauses: data.pauses.map(p => p.id === d.blockId ? { ...p, startDate: ns, endDate: ne } : p) }

      updateData(latestData)
    }

    function onUp() { setData(latestData); setDrag(null) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, monthWidth, progStart])

  // ── Pan on empty canvas ────────────────────────────────────────────────────
  const [panStart, setPanStart] = useState<{ x: number; origPan: number } | null>(null)
  function onCanvasMouseDown(e: React.MouseEvent) {
    if ((e.target as SVGElement).getAttribute('data-draggable') === '1') return
    setPanStart({ x: e.clientX, origPan: panMonths })
  }
  useEffect(() => {
    if (!panStart) return
    const onMove = (e: MouseEvent) => setPan(Math.max(0, panStart.origPan - (e.clientX - panStart.x) / monthWidth))
    const onUp   = () => setPanStart(null)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [panStart, monthWidth])

  // ── Zoom on scroll ─────────────────────────────────────────────────────────
  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z + (e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP))))
  }

  // ── Pause CRUD ─────────────────────────────────────────────────────────────
  function addPause(sowId: string, label: string) {
    const sow   = data.sows.find(s => s.id === sowId)!
    const mid   = dateToMonthOffset(sow.startDate, calendarStart) + 1.5
    const base  = dayjs(calendarStart).startOf('month')
    const start = snapDate(base.add(mid * 30.437, 'day'))
    const end   = snapDate(base.add((mid + 0.5) * 30.437, 'day'))
    setData({ ...data, pauses: [...data.pauses, { id: uuidv4(), sowId, label, startDate: start, endDate: end }] })
    setPauseModal(null); setAddingPause(false)
  }
  function deletePause(id: string) { setData({ ...data, pauses: data.pauses.filter(p => p.id !== id) }) }

  // ── PP-4: Milestone CRUD ──────────────────────────────────────────────────
  function saveMilestone(m: Partial<Milestone>) {
    if (!m.label || !m.date) return
    const milestone: Milestone = {
      id:    m.id ?? uuidv4(),
      sowId: m.sowId ?? null,
      label: m.label!,
      date:  m.date!,
      color: m.color ?? '#38bdf8',
    }
    const milestones = m.id
      ? data.milestones.map(x => x.id === m.id ? milestone : x)
      : [...data.milestones, milestone]
    setData({ ...data, milestones })
    setMilestoneModal(null)
  }
  function deleteMilestone(id: string) {
    setData({ ...data, milestones: data.milestones.filter(m => m.id !== id) })
    setMilestoneModal(null)
  }

  // ── PP-3: Toggle SOW expansion ─────────────────────────────────────────────
  function toggleSOW(sowId: string) {
    setExpandedSOWs(prev => {
      const next = new Set(prev)
      next.has(sowId) ? next.delete(sowId) : next.add(sowId)
      return next
    })
  }

  // ── Block renderer (PP-2: lane-aware) ─────────────────────────────────────
  function renderBlock(
    key: string, startDate: string, endDate: string,
    sowY: number, lane: number, totalHeight: number,
    color: string, label: string, isPause: boolean,
    sowId: string, blockId: string, blockKind: 'phase' | 'pause',
  ) {
    const laneH   = totalHeight / Math.max(1, sowLaneData[sowId]?.laneCount ?? 1)
    const blockY  = sowY + lane * laneH
    const x1      = dateToX(startDate)
    const x2      = dateToX(endDate)
    const w       = Math.max(HANDLE_W * 2 + 4, x2 - x1)
    const isHov   = hoverId === blockId
    const isDrag  = drag?.blockId === blockId

    return (
      <g key={key} style={{ cursor: isDrag ? 'grabbing' : 'grab', opacity: isDrag ? 0.8 : 1 }}
        onMouseEnter={() => setHoverId(blockId)} onMouseLeave={() => setHoverId(null)}>

        <rect data-draggable="1"
          x={x1} y={blockY + 7} width={w} height={laneH - 14} rx={6}
          fill={isPause ? `url(#${HATCH_ID})` : color + 'cc'}
          stroke={isPause ? '#94A3B8' : color} strokeWidth={isHov ? 2 : 1}
          style={{ filter: isHov ? `drop-shadow(0 0 6px ${color}99)` : 'none' }}
          onMouseDown={e => startDrag(e, 'move', sowId, blockId, blockKind, startDate, endDate)}
        />

        {w > 40 && (
          <text x={x1 + w / 2} y={blockY + laneH / 2 + 5}
            textAnchor="middle" fill={isPause ? '#CBD5E1' : '#fff'}
            fontSize={10} fontFamily="Nunito" fontWeight={700}
            style={{ pointerEvents: 'none', userSelect: 'none' }}>
            {w > 80 ? label : label.slice(0, 3)}
          </text>
        )}

        <rect data-draggable="1"
          x={x1} y={blockY + 9} width={HANDLE_W} height={laneH - 18} rx={3}
          fill={isPause ? '#64748B' : color}
          style={{ cursor: 'ew-resize', opacity: isHov ? 1 : 0.4 }}
          onMouseDown={e => startDrag(e, 'resize-left', sowId, blockId, blockKind, startDate, endDate)}
        />
        <rect data-draggable="1"
          x={x1 + w - HANDLE_W} y={blockY + 9} width={HANDLE_W} height={laneH - 18} rx={3}
          fill={isPause ? '#64748B' : color}
          style={{ cursor: 'ew-resize', opacity: isHov ? 1 : 0.4 }}
          onMouseDown={e => startDrag(e, 'resize-right', sowId, blockId, blockKind, startDate, endDate)}
        />

        {isPause && isHov && (
          <g style={{ cursor: 'pointer' }} onClick={() => deletePause(blockId)}>
            <circle cx={x1 + w - 2} cy={blockY + 10} r={8} fill="#1E293B" stroke="#475569" strokeWidth={1} />
            <line x1={x1+w-6} y1={blockY+6} x2={x1+w+2} y2={blockY+14} stroke="#F87171" strokeWidth={1.5} />
            <line x1={x1+w+2} y1={blockY+6} x2={x1+w-6} y2={blockY+14} stroke="#F87171" strokeWidth={1.5} />
          </g>
        )}
      </g>
    )
  }

  // ── Build SVG rows ─────────────────────────────────────────────────────────
  const rows: React.ReactNode[] = []
  let yOffset = HEADER_H + milestoneBandH  // SOW rows start after header + milestone band

  for (const sow of data.sows) {
    const sowY       = yOffset
    const sowH       = getSowRowH(sow)
    const { lanes, laneCount } = sowLaneData[sow.id] ?? { lanes: new Map(), laneCount: 1 }
    const sowPauses  = data.pauses.filter(p => p.sowId === sow.id)

    // SOW row background + border
    rows.push(
      <rect key={`bg-${sow.id}`} x={0} y={sowY} width={totalW + 60} height={sowH} fill={sow.color + '07'} />,
      <line key={`ln-${sow.id}`} x1={0} y1={sowY + sowH - 1} x2={totalW + 60} y2={sowY + sowH - 1} stroke="#1E293B" strokeWidth={1} />
    )

    // Phase blocks — PP-2: lane-aware
    for (const phase of sow.phases) {
      rows.push(renderBlock(
        `phase-${phase.id}`, phase.startDate, phase.endDate,
        sowY, lanes.get(phase.id) ?? 0, sowH,
        PHASE_COLORS[phase.name], phase.name,
        false, sow.id, phase.id, 'phase',
      ))
    }

    // Pause blocks — PP-2: lane-aware
    for (const pause of sowPauses) {
      rows.push(renderBlock(
        `pause-${pause.id}`, pause.startDate, pause.endDate,
        sowY, lanes.get(pause.id) ?? 0, sowH,
        '#64748B', pause.label || 'Wait',
        true, sow.id, pause.id, 'pause',
      ))
    }

    yOffset += sowH

    // PP-3: Resource rows — only when SOW is expanded
    const resRows = getResourceRows(sow)
    for (const rid of resRows) {
      const res    = data.resources.find(r => r.id === rid)
      const allocs = data.allocations.filter(a => a.sowId === sow.id && a.resourceId === rid)
      const rowY   = yOffset

      rows.push(
        <rect key={`ar-bg-${rid}-${sow.id}`} x={0} y={rowY} width={totalW + 60} height={ALLOC_ROW_H} fill="#060D1A" />,
        <line key={`ar-ln-${rid}-${sow.id}`} x1={0} y1={rowY + ALLOC_ROW_H - 1} x2={totalW + 60} y2={rowY + ALLOC_ROW_H - 1} stroke="#1A2540" strokeWidth={1} />
      )

      for (const alloc of allocs) {
        // Use derivedAllocationDates for phase-based allocations
        const { startDate, endDate } = derivedAllocationDates(alloc, sow)
        const ax1 = dateToX(startDate)
        const ax2 = dateToX(endDate)
        const aw  = Math.max(4, ax2 - ax1)
        rows.push(
          <g key={`alloc-${alloc.id}`}>
            <rect x={ax1} y={rowY + 5} width={aw} height={ALLOC_ROW_H - 10}
              rx={4} fill={sow.color + '44'} stroke={sow.color + '88'} strokeWidth={1} />
            {aw > 55 && (
              <text x={ax1 + 8} y={rowY + ALLOC_ROW_H / 2 + 4}
                fill={sow.color} fontSize={9} fontFamily="Nunito" fontWeight={700}
                style={{ pointerEvents: 'none' }}>
                {alloc.daysPerWeek}d/wk
              </text>
            )}
          </g>
        )
      }
      yOffset += ALLOC_ROW_H
    }
  }

  // ── Milestone swimlane rendering ─────────────────────────────────────────────
  const milestoneBandY = HEADER_H
  const milestoneBandElements: React.ReactNode[] = [
    // Band background
    <rect key="ms-band-bg"
      x={0} y={milestoneBandY} width={totalW + 60} height={milestoneBandH}
      fill="#0B1628" />,
    // Band bottom border
    <line key="ms-band-ln"
      x1={0} y1={milestoneBandY + milestoneBandH - 1}
      x2={totalW + 60} y2={milestoneBandY + milestoneBandH - 1}
      stroke="#334155" strokeWidth={1} />,
  ]

  for (const m of data.milestones) {
    const mx    = (dateToMonthOffset(m.date, calendarStart) - panMonths) * monthWidth
    if (mx < -200 || mx > totalW + 60) continue

    const isHov  = msHoverId === m.id
    const dY     = milestoneBandY + 10   // diamond centre Y (centred in 20px band)
    const dSize  = 5

    // Full-height dashed line (amber/yellow — always, regardless of m.color)
    milestoneBandElements.push(
      <line key={`ms-line-${m.id}`}
        x1={mx} y1={0} x2={mx} y2={canvasH}
        stroke="#fbbf24" strokeWidth={isHov ? 2 : 1}
        strokeDasharray="5 3" opacity={isHov ? 0.9 : 0.45} />
    )

    // Diamond + hover area + hover label
    milestoneBandElements.push(
      <g key={`ms-${m.id}`}
        style={{ cursor: 'pointer' }}
        onMouseEnter={() => setMsHoverId(m.id)}
        onMouseLeave={() => setMsHoverId(null)}
        onClick={() => setMilestoneModal(m)}>

        {/* Wider transparent hit area */}
        <rect x={mx - 10} y={milestoneBandY} width={20} height={milestoneBandH}
          fill="transparent" />

        {/* Diamond */}
        <polygon
          points={`${mx},${dY - dSize} ${mx + dSize},${dY} ${mx},${dY + dSize} ${mx - dSize},${dY}`}
          fill={m.color} stroke="#0B1628" strokeWidth={0.5} opacity={0.95}
        />

        {/* Hover label — appears just below diamond */}
        {isHov && (
          <g>
            <rect
              x={mx + 8} y={dY - 1}
              width={m.label.length * 7 + 14} height={16}
              rx={4} fill="#1E293B" stroke="#fbbf24" strokeWidth={1} />
            <text
              x={mx + 15} y={dY + 11}
              fill="#fbbf24" fontSize={9} fontFamily="Nunito" fontWeight={800}
              style={{ pointerEvents: 'none', userSelect: 'none' }}>
              {m.label}
            </text>
          </g>
        )}
      </g>
    )
  }

  // ── Grid lines ─────────────────────────────────────────────────────────────
  const gridLines = months.flatMap((m, i) => {
    const x1  = i * monthWidth
    const x15 = x1 + monthWidth * 0.5
    return [
      <line key={`gm-${m}`} x1={x1} y1={HEADER_H} x2={x1} y2={canvasH} stroke="#1E293B" strokeWidth={1} />,
      <line key={`gh-${m}`} x1={x15} y1={HEADER_H} x2={x15} y2={canvasH} stroke="#131F35" strokeWidth={1} strokeDasharray="2 3" />,
    ]
  })

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="plan-root">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="plan-toolbar">
        <span className="plan-toolbar-title">Project Plan</span>
        <div className="toolbar-divider" />

        <button className="btn-toolbar icon-only" onClick={() => setPan(p => Math.max(0, p - PAN_STEP))} title="Pan left">
          <ChevronLeft size={15} />
        </button>
        <button className="btn-toolbar icon-only" onClick={() => setPan(p => p + PAN_STEP)} title="Pan right">
          <ChevronRight size={15} />
        </button>
        <div className="toolbar-divider" />
        <button className="btn-toolbar icon-only" onClick={() => setZoom(z => Math.max(MIN_ZOOM, z - ZOOM_STEP))} disabled={zoom <= MIN_ZOOM}>
          <ZoomOut size={15} />
        </button>
        <span className="zoom-indicator">{Math.round(zoom * 100)}%</span>
        <button className="btn-toolbar icon-only" onClick={() => setZoom(z => Math.min(MAX_ZOOM, z + ZOOM_STEP))} disabled={zoom >= MAX_ZOOM}>
          <ZoomIn size={15} />
        </button>
        <button className="btn-toolbar" onClick={() => { setZoom(1.0); setPan(0) }}>
          <RotateCcw size={13} /> Reset
        </button>
        <div className="toolbar-divider" />

        {/* Add wait */}
        <button className={`btn-toolbar ${addingPause ? 'active' : ''}`} onClick={() => setAddingPause(p => !p)}>
          <Pause size={13} /> Add wait
        </button>
        {addingPause && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {data.sows.map(s => (
              <button key={s.id} className="btn-toolbar" style={{ borderColor: s.color, color: s.color }}
                onClick={() => { setPauseModal({ sowId: s.id }); setAddingPause(false) }}>
                + {s.shortName}
              </button>
            ))}
            <button className="btn-toolbar icon-only" onClick={() => setAddingPause(false)}><X size={13} /></button>
          </div>
        )}

        {/* PP-4: Add milestone */}
        <button className="btn-toolbar" onClick={() => setMilestoneModal({ color: '#fbbf24' })}>
          <Flag size={13} /> Add milestone
        </button>

        {/* Legend */}
        <div className="phase-legend">
          {(Object.keys(PHASE_COLORS) as PhaseName[]).map(p => (
            <div key={p} className="legend-item">
              <div className="legend-dot" style={{ background: PHASE_COLORS[p] }} />
              <span>{p}</span>
            </div>
          ))}
          <div className="legend-item">
            <div className="legend-dot" style={{ background: 'repeating-linear-gradient(45deg,#475569 0,#475569 2px,transparent 0,transparent 6px)', border: '1px solid #64748B' }} />
            <span>Wait</span>
          </div>
          <div className="legend-item">
            <div style={{ width: 10, height: 10, transform: 'rotate(45deg)', background: '#fbbf24', flexShrink: 0 }} />
            <span>Milestone</span>
          </div>
        </div>
      </div>

      {/* ── Canvas ──────────────────────────────────────────────────────── */}
      <div
        className={`plan-canvas-wrap ${panStart ? 'panning' : ''}`}
        ref={containerRef}
        onWheel={onWheel}
      >
        <div style={{ display: 'flex', minWidth: LABEL_W + totalW + 40, minHeight: canvasH }}>

          {/* PP-3: Label column with collapsible chevrons */}
          <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 10, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
            <div style={{ height: HEADER_H, borderBottom: '1px solid var(--border)' }} />
            {/* Milestone swimlane label */}
            <div style={{
              height: milestoneBandH,
              display: 'flex', alignItems: 'center',
              padding: '0 12px', gap: 8,
              borderBottom: '1px solid #334155',
              background: '#0B1628',
              fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: '0.07em',
              cursor: 'default',
            }}>
              <span style={{ fontSize: 10 }}>&#9670;</span>
              Key Milestones
            </div>
            {data.sows.map(sow => {
              const sowH    = getSowRowH(sow)
              const resRows = getResourceRows(sow)
              const isOpen  = expandedSOWs.has(sow.id)
              const uniqRes = [...new Set(data.allocations.filter(a => a.sowId === sow.id).map(a => a.resourceId))]
              return (
                <React.Fragment key={sow.id}>
                  <div className="gantt-sow-label" style={{ height: sowH, borderLeftColor: sow.color }}
                    onClick={() => uniqRes.length > 0 && toggleSOW(sow.id)}>
                    {/* PP-3: Chevron toggle */}
                    {uniqRes.length > 0 && (
                      <span style={{ color: 'var(--text-3)', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        {isOpen
                          ? <ChevronDown size={13} />
                          : <ChevronRightIcon size={13} />
                        }
                      </span>
                    )}
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: sow.color, flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sow.shortName}
                    </span>
                    {uniqRes.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginLeft: 'auto', flexShrink: 0 }}>
                        {uniqRes.length}
                      </span>
                    )}
                  </div>
                  {resRows.map(rid => {
                    const res = data.resources.find(r => r.id === rid)
                    return (
                      <div key={rid} className="gantt-alloc-label" style={{ height: ALLOC_ROW_H }}>
                        {res?.name.split(' ')[0] ?? rid}
                      </div>
                    )
                  })}
                </React.Fragment>
              )
            })}
          </div>

          {/* SVG canvas */}
          <div style={{ flex: 1, overflowX: 'hidden', position: 'relative' }}>
            <svg width={totalW + 40} height={canvasH}
              style={{ display: 'block', userSelect: 'none' }}
              onMouseDown={onCanvasMouseDown}>

              <defs>
                <pattern id={HATCH_ID} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width={8} height={8} fill="#1E293B" />
                  <line x1={0} y1={0} x2={0} y2={8} stroke="#475569" strokeWidth={2} />
                </pattern>
              </defs>

              {/* Month headers */}
              {months.map((m, i) => (
                <g key={`hdr-${m}`}>
                  <rect x={i * monthWidth} y={0} width={monthWidth} height={HEADER_H}
                    fill={i % 2 === 0 ? '#0F172A' : '#111D2F'} />
                  <text x={i * monthWidth + monthWidth / 2} y={HEADER_H / 2 + 5}
                    textAnchor="middle" fill="#94A3B8" fontSize={zoom < 0.6 ? 9 : 12}
                    fontFamily="Nunito" fontWeight={700}>
                    {zoom < 0.5 ? dayjs(m + '-01').format('MMM') : dayjs(m + '-01').format('MMM YY')}
                  </text>
                </g>
              ))}
              <line x1={0} y1={HEADER_H} x2={totalW + 40} y2={HEADER_H} stroke="#1E293B" strokeWidth={1} />

              {/* Grid lines */}
              {gridLines}

              {/* Milestone swimlane — sits between header and SOW rows */}
              {milestoneBandElements}

              {/* Phase + resource rows */}
              {rows}

              {/* Today marker — always on top, red */}
              {todayX > -60 && todayX < totalW + 60 && (
                <g>
                  <line x1={todayX} y1={0} x2={todayX} y2={canvasH}
                    stroke="#ef4444" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} />
                  <rect x={todayX - 20} y={4} width={40} height={17} rx={4}
                    fill="#ef4444" opacity={0.95} />
                  <text x={todayX} y={16} textAnchor="middle" fill="#fff"
                    fontSize={9} fontFamily="Nunito" fontWeight={800}
                    style={{ pointerEvents: 'none' }}>
                    Today
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <div className="gantt-footer-note">
        <div className="legend-dot" style={{ background: '#38BDF8', borderRadius: 2 }} />
        <span className="text-xs" style={{ color: 'var(--text-3)', fontWeight: 600 }}>
          Drag to move · Drag edges to resize · Snaps to 1st/15th · Ctrl+scroll to zoom · Drag canvas to pan · Click SOW name to expand resources · Click milestone ◆ to edit
        </span>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      {pauseModal && (
        <PauseModal
          sowName={data.sows.find(s => s.id === pauseModal.sowId)?.shortName ?? ''}
          onConfirm={label => addPause(pauseModal.sowId, label)}
          onClose={() => setPauseModal(null)}
        />
      )}

      {/* PP-4: Milestone modal */}
      {milestoneModal !== null && (
        <MilestoneModal
          milestone={milestoneModal}
          onSave={saveMilestone}
          onDelete={milestoneModal.id ? () => deleteMilestone(milestoneModal.id!) : undefined}
          onClose={() => setMilestoneModal(null)}
        />
      )}
    </div>
  )
}

// ─── PauseModal ───────────────────────────────────────────────────────────────
function PauseModal({ sowName, onConfirm, onClose }: {
  sowName: string; onConfirm: (label: string) => void; onClose: () => void
}) {
  const [label, setLabel] = useState('')
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 380 }}>
        <div className="modal-header">
          <h3 className="modal-title">Add Wait Period — {sowName}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Label</label>
            <input className="field-input"
              placeholder="e.g. Waiting for sign-off, MS approval window"
              value={label} onChange={e => setLabel(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && label.trim() && onConfirm(label.trim())}
              autoFocus />
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginBottom: 14 }}>
            The block will be placed at the start of the SOW. Drag it and resize it on the plan.
          </p>
          <div className="modal-actions">
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => label.trim() && onConfirm(label.trim())}>Add wait</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── MilestoneModal (PP-4) ────────────────────────────────────────────────────
const PRESET_COLORS = ['#38bdf8', '#fbbf24', '#f87171', '#34d399', '#fb923c', '#a78bfa', '#e879f9', '#94a3b8']

function MilestoneModal({ milestone, onSave, onDelete, onClose }: {
  milestone: Partial<Milestone>
  onSave: (m: Partial<Milestone>) => void
  onDelete?: () => void
  onClose: () => void
}) {
  const [m, setM] = useState<Partial<Milestone>>(milestone)
  const isEdit = !!milestone.id

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ width: 420 }}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? 'Edit Milestone' : 'Add Milestone'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label className="field-label">Label</label>
            <input className="field-input" placeholder="e.g. MS funding deadline"
              value={m.label ?? ''} onChange={e => setM({ ...m, label: e.target.value })} autoFocus />
          </div>
          <div className="field">
            <label className="field-label">Date</label>
            <input className="field-input font-mono" type="date"
              value={m.date ?? ''} onChange={e => setM({ ...m, date: e.target.value })} />
          </div>
          <div className="field">
            <label className="field-label">Colour</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {PRESET_COLORS.map(c => (
                <div key={c} onClick={() => setM({ ...m, color: c })}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: c, cursor: 'pointer',
                    outline: m.color === c ? `3px solid ${c}` : 'none', outlineOffset: 2,
                    opacity: m.color === c ? 1 : 0.6,
                  }} />
              ))}
            </div>
          </div>
          <div className="modal-actions">
            {onDelete && (
              <button className="btn-danger" onClick={onDelete}>Delete</button>
            )}
            <button className="btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn-primary" onClick={() => onSave(m)} disabled={!m.label || !m.date}>
              {isEdit ? 'Save' : 'Add milestone'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
