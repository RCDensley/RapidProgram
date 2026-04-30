import React, { useState, useRef, useCallback } from 'react'
import { useApp } from '../App'
import {
  Task, TaskBucket, TaskPriority, TaskEffortUnit, TaskComment, TaskLink,
  PRIORITY_COLORS, BUCKET_LABELS, PhaseName, RecurrenceType,
} from '../types'
import { completeTask, reopenTask, moveTask, formatEffort, formatRecurrence } from '../utils/taskUtils'
import { v4 as uuidv4 } from 'uuid'
import {
  Plus, X, ChevronDown, ChevronRight, RefreshCw, Link, MessageSquare,
  CheckCircle2, Circle, Trash2, Pencil, ExternalLink,
} from 'lucide-react'
import dayjs from 'dayjs'

const BUCKETS: TaskBucket[] = ['today', 'this-week', 'this-month', 'backlog']

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
}

// ─── Drag state ───────────────────────────────────────────────────────────────
interface DragInfo {
  taskId:    string
  srcBucket: TaskBucket
  srcSowId:  string | null
}

// ─── Inline task card ─────────────────────────────────────────────────────────
function TaskCard({
  task, sows, onOpen, onComplete, onDragStart,
}: {
  task: Task
  sows: any[]
  onOpen: () => void
  onComplete: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const sow = sows.find(s => s.id === task.sowId)
  const isComplete = !!task.completedAt

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      style={{
        background: 'var(--card)',
        border: `1px solid ${isComplete ? 'var(--border)' : 'var(--border)'}`,
        borderLeft: `3px solid ${PRIORITY_COLORS[task.priority]}`,
        borderRadius: 'var(--radius-sm)',
        padding: '10px 12px',
        marginBottom: 6,
        cursor: 'grab',
        opacity: isComplete ? 0.5 : 1,
        transition: 'all 0.15s',
        userSelect: 'none',
      }}
      onMouseEnter={e => {
        if (!isComplete) {
          (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 12px rgba(0,0,0,0.3)`
          ;(e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'
        }
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
        ;(e.currentTarget as HTMLDivElement).style.transform = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {/* Complete button */}
        <button
          onClick={e => { e.stopPropagation(); onComplete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isComplete ? 'var(--emerald)' : 'var(--text-3)', flexShrink: 0, padding: 0, marginTop: 1 }}>
          {isComplete ? <CheckCircle2 size={14} /> : <Circle size={14} />}
        </button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: isComplete ? 'var(--text-3)' : 'var(--text-1)',
            textDecoration: isComplete ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {task.title}
          </div>

          {/* Meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {/* Priority dot */}
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />

            {/* Effort */}
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>
              {formatEffort(task.effort)}
            </span>

            {/* Recurrence */}
            {task.recurrence && (
              <RefreshCw size={10} style={{ color: 'var(--violet-bright)' }} />
            )}

            {/* Comment count */}
            {task.comments.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-3)' }}>
                <MessageSquare size={9} /> {task.comments.length}
              </span>
            )}

            {/* Link count */}
            {task.links.length > 0 && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-3)' }}>
                <Link size={9} /> {task.links.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Drop zone column ─────────────────────────────────────────────────────────
function BucketColumn({
  bucket, tasks, sows, sowId, onOpenTask, onCompleteTask,
  onDragStart, onDrop, onAddTask,
}: {
  bucket:        TaskBucket
  tasks:         Task[]
  sows:          any[]
  sowId:         string | null
  onOpenTask:    (t: Task) => void
  onCompleteTask:(id: string) => void
  onDragStart:   (e: React.DragEvent, t: Task) => void
  onDrop:        (bucket: TaskBucket, sowId: string | null) => void
  onAddTask:     (bucket: TaskBucket, sowId: string | null) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const incomplete = tasks.filter(t => !t.completedAt)
  const completed  = tasks.filter(t => !!t.completedAt)

  return (
    <div
      onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => { e.preventDefault(); setIsDragOver(false); onDrop(bucket, sowId) }}
      style={{
        flex: 1,
        minWidth: 0,
        background: isDragOver ? 'rgba(56,189,248,0.05)' : 'var(--surface)',
        border: `1px solid ${isDragOver ? 'var(--sky)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        padding: '10px 10px 6px',
        transition: 'all 0.15s',
        minHeight: 80,
      }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {BUCKET_LABELS[bucket]}
          </span>
          {incomplete.length > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--border)', color: 'var(--text-2)', padding: '1px 6px', borderRadius: 10 }}>
              {incomplete.length}
            </span>
          )}
        </div>
        <button
          onClick={() => onAddTask(bucket, sowId)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <Plus size={13} />
        </button>
      </div>

      {/* Incomplete tasks */}
      {incomplete.map(t => (
        <TaskCard
          key={t.id}
          task={t}
          sows={sows}
          onOpen={() => onOpenTask(t)}
          onComplete={() => onCompleteTask(t.id)}
          onDragStart={e => onDragStart(e, t)}
        />
      ))}

      {/* Completed tasks (collapsed count) */}
      {completed.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
          {completed.length} completed
        </div>
      )}
    </div>
  )
}

// ─── Task detail panel (slide-out) ────────────────────────────────────────────
function TaskPanel({
  task, sows, onClose, onSave, onDelete,
}: {
  task: Partial<Task>
  sows: any[]
  onClose: () => void
  onSave: (t: Partial<Task>) => void
  onDelete?: () => void
}) {
  const [t, setT] = useState<Partial<Task>>(task)
  const [newComment, setNewComment] = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl,   setNewLinkUrl]   = useState('')

  function addComment() {
    if (!newComment.trim()) return
    const comment: TaskComment = { id: uuidv4(), text: newComment.trim(), timestamp: new Date().toISOString() }
    setT(prev => ({ ...prev, comments: [...(prev.comments ?? []), comment] }))
    setNewComment('')
  }

  function addLink() {
    if (!newLinkUrl.trim()) return
    const link: TaskLink = { id: uuidv4(), label: newLinkLabel.trim() || newLinkUrl, url: newLinkUrl.trim() }
    setT(prev => ({ ...prev, links: [...(prev.links ?? []), link] }))
    setNewLinkLabel(''); setNewLinkUrl('')
  }

  function removeLink(id: string) {
    setT(prev => ({ ...prev, links: (prev.links ?? []).filter(l => l.id !== id) }))
  }

  const isNew = !task.id

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 420,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      zIndex: 50, display: 'flex', flexDirection: 'column',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>
          {isNew ? 'New Task' : 'Edit Task'}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isNew && onDelete && (
            <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={onDelete}><Trash2 size={14} /></button>
          )}
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
        {/* Title */}
        <div className="field">
          <label className="field-label">Title</label>
          <input className="field-input" value={t.title ?? ''} autoFocus
            onChange={e => setT(p => ({ ...p, title: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && onSave(t)} />
        </div>

        {/* Description */}
        <div className="field">
          <label className="field-label">Description</label>
          <textarea className="field-input" rows={3}
            style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }}
            value={t.description ?? ''}
            onChange={e => setT(p => ({ ...p, description: e.target.value }))} />
        </div>

        {/* SOW + Bucket row */}
        <div className="field-row">
          <div className="field">
            <label className="field-label">Project</label>
            <select className="field-input" value={t.sowId ?? '__program__'}
              onChange={e => setT(p => ({ ...p, sowId: e.target.value === '__program__' ? null : e.target.value }))}>
              <option value="__program__">Program</option>
              {sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Bucket</label>
            <select className="field-input" value={t.bucket ?? 'backlog'}
              onChange={e => setT(p => ({ ...p, bucket: e.target.value as TaskBucket }))}>
              {BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}
            </select>
          </div>
        </div>

        {/* Priority + Effort row */}
        <div className="field-row">
          <div className="field">
            <label className="field-label">Priority</label>
            <select className="field-input" value={t.priority ?? 'medium'}
              onChange={e => setT(p => ({ ...p, priority: e.target.value as TaskPriority }))}>
              {(['low', 'medium', 'high'] as TaskPriority[]).map(pr => (
                <option key={pr} value={pr}>{PRIORITY_LABELS[pr]}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Effort</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="field-input font-mono" type="number" min={0.5} step={0.5}
                style={{ width: 72 }}
                value={t.effort?.value ?? 1}
                onChange={e => setT(p => ({ ...p, effort: { ...(p.effort ?? { unit: 'hours' as TaskEffortUnit }), value: Number(e.target.value) } }))} />
              <select className="field-input" value={t.effort?.unit ?? 'hours'}
                onChange={e => setT(p => ({ ...p, effort: { ...(p.effort ?? { value: 1 }), unit: e.target.value as TaskEffortUnit } }))}>
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
            </div>
          </div>
        </div>

        {/* Recurrence */}
        <div className="field">
          <label className="field-label">Recurrence</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="field-input"
              value={t.recurrence?.type ?? '__none__'}
              onChange={e => {
                if (e.target.value === '__none__') setT(p => ({ ...p, recurrence: null }))
                else setT(p => ({ ...p, recurrence: { type: e.target.value as RecurrenceType, interval: p.recurrence?.interval ?? 1 } }))
              }}>
              <option value="__none__">No recurrence</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {t.recurrence && (
              <input className="field-input font-mono" type="number" min={1} max={12}
                style={{ width: 64 }}
                title="Interval"
                value={t.recurrence.interval}
                onChange={e => setT(p => ({ ...p, recurrence: { ...(p.recurrence!), interval: Number(e.target.value) } }))} />
            )}
          </div>
          {t.recurrence && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
              {formatRecurrence(t.recurrence)}
            </div>
          )}
        </div>

        {/* Links */}
        <div className="field">
          <label className="field-label">Links</label>
          {(t.links ?? []).map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <a href={l.url} target="_blank" rel="noopener noreferrer"
                style={{ flex: 1, fontSize: 12, color: 'var(--sky-bright)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                onClick={e => e.stopPropagation()}>
                <ExternalLink size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                {l.label}
              </a>
              <button className="icon-btn" style={{ color: 'var(--text-3)', flexShrink: 0 }} onClick={() => removeLink(l.id)}><X size={11} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field-input field-input-sm" placeholder="Label" value={newLinkLabel}
              style={{ flex: 1 }} onChange={e => setNewLinkLabel(e.target.value)} />
            <input className="field-input field-input-sm font-mono" placeholder="https://…" value={newLinkUrl}
              style={{ flex: 2 }} onChange={e => setNewLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLink()} />
            <button className="btn-ghost btn-sm" onClick={addLink}><Plus size={11} /></button>
          </div>
        </div>

        {/* Comments */}
        <div className="field">
          <label className="field-label">Comments</label>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
            {(t.comments ?? []).map(c => (
              <div key={c.id} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--card)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>{c.text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                  {dayjs(c.timestamp).format('D MMM YY HH:mm')}
                </div>
              </div>
            ))}
            {(t.comments ?? []).length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No comments yet.</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field-input field-input-sm" placeholder="Add a comment…" value={newComment}
              style={{ flex: 1 }} onChange={e => setNewComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addComment()} />
            <button className="btn-ghost btn-sm" onClick={addComment}><Plus size={11} /></button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(t)}>Save</button>
      </div>
    </div>
  )
}

// ─── Main Tasks view ──────────────────────────────────────────────────────────
export default function Tasks() {
  const { data, setData } = useApp()

  const [expandedRows,  setExpandedRows]  = useState<Set<string>>(new Set(['__program__', ...data.sows.map(s => s.id)]))
  const [panelTask,     setPanelTask]     = useState<Partial<Task> | null>(null)
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterSow,      setFilterSow]      = useState<string>('all')
  const [hideCompleted,  setHideCompleted]  = useState(false)

  const dragRef = useRef<DragInfo | null>(null)

  // ── Rows: Program + each SOW ────────────────────────────────────────────────
  const rows: { id: string | null; label: string; color?: string }[] = [
    { id: null, label: 'Program', color: '#94a3b8' },
    ...data.sows.map(s => ({ id: s.id, label: s.shortName, color: s.color })),
  ]

  // ── Task helpers ────────────────────────────────────────────────────────────
  function getTasksFor(bucket: TaskBucket, sowId: string | null): Task[] {
    return data.tasks.filter(t => {
      if (t.bucket !== bucket) return false
      if (t.sowId !== sowId) return false
      if (filterPriority !== 'all' && t.priority !== filterPriority) return false
      if (hideCompleted && t.completedAt) return false
      return true
    }).sort((a, b) => a.order - b.order)
  }

  function onCompleteTask(taskId: string) {
    setData(completeTask(taskId, data))
  }

  function onDragStart(e: React.DragEvent, task: Task) {
    dragRef.current = { taskId: task.id, srcBucket: task.bucket, srcSowId: task.sowId }
    const el = e.currentTarget as HTMLElement
    // Tilt effect via a temporary ghost
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDrop(targetBucket: TaskBucket, targetSowId: string | null) {
    const drag = dragRef.current
    if (!drag) return
    if (drag.srcBucket === targetBucket && drag.srcSowId === targetSowId) return
    setData(moveTask(drag.taskId, targetBucket, targetSowId, data))
    dragRef.current = null
  }

  function openNewTask(bucket: TaskBucket, sowId: string | null) {
    setPanelTask({
      title:       '',
      description: '',
      sowId,
      bucket,
      priority:    'medium',
      effort:      { value: 1, unit: 'hours' },
      recurrence:  null,
      links:       [],
      comments:    [],
      order:       data.tasks.filter(t => t.bucket === bucket && t.sowId === sowId).length,
    })
  }

  function saveTask(partial: Partial<Task>) {
    if (!partial.title?.trim()) return
    const isNew = !partial.id
    const task: Task = {
      id:          partial.id ?? uuidv4(),
      title:       partial.title!,
      description: partial.description ?? '',
      sowId:       partial.sowId ?? null,
      bucket:      partial.bucket ?? 'backlog',
      priority:    partial.priority ?? 'medium',
      effort:      partial.effort ?? { value: 1, unit: 'hours' },
      recurrence:  partial.recurrence ?? null,
      links:       partial.links ?? [],
      comments:    partial.comments ?? [],
      completedAt: partial.completedAt,
      createdAt:   partial.createdAt ?? new Date().toISOString(),
      order:       partial.order ?? data.tasks.length,
    }
    const tasks = isNew
      ? [...data.tasks, task]
      : data.tasks.map(t => t.id === task.id ? task : t)
    setData({ ...data, tasks })
    setPanelTask(null)
  }

  function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    setData({ ...data, tasks: data.tasks.filter(t => t.id !== id) })
    setPanelTask(null)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="view-root" style={{ paddingRight: panelTask ? 440 : 32, transition: 'padding-right 0.2s' }}>
      {/* Header */}
      <div className="view-header">
        <div>
          <h1 className="view-title">Tasks</h1>
          <p className="view-sub">Drag between buckets and projects to reorganise</p>
        </div>
        <button className="btn-primary" onClick={() => openNewTask('backlog', null)}>
          <Plus size={14} /> New Task
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="field-input field-input-sm" value={filterSow}
          onChange={e => setFilterSow(e.target.value)}>
          <option value="all">All projects</option>
          {data.sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
        </select>
        <select className="field-input field-input-sm" value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-2)', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} />
          Hide completed
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {data.tasks.filter(t => !t.completedAt).length} open · {data.tasks.filter(t => !!t.completedAt).length} done
        </span>
      </div>

      {/* Bucket header row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, paddingLeft: 180 }}>
        {BUCKETS.map(b => (
          <div key={b} style={{ flex: 1, textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {BUCKET_LABELS[b]}
          </div>
        ))}
      </div>

      {/* Project rows */}
      {rows.map(row => {
        if (filterSow !== 'all' && row.id !== null && row.id !== filterSow) return null
        const rowKey    = row.id ?? '__program__'
        const isExpanded = expandedRows.has(rowKey)
        const totalTasks = BUCKETS.reduce((n, b) => n + getTasksFor(b, row.id).length, 0)

        return (
          <div key={rowKey} style={{ marginBottom: 8 }}>
            {/* Row header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0', cursor: 'pointer', marginBottom: isExpanded ? 8 : 0,
              }}
              onClick={() => {
                setExpandedRows(prev => {
                  const n = new Set(prev)
                  n.has(rowKey) ? n.delete(rowKey) : n.add(rowKey)
                  return n
                })
              }}>
              <span style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: row.color ?? '#94a3b8', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{row.label}</span>
              {totalTasks > 0 && (
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--border)', color: 'var(--text-2)', padding: '1px 6px', borderRadius: 10 }}>
                  {totalTasks}
                </span>
              )}
            </div>

            {/* Bucket columns */}
            {isExpanded && (
              <div style={{ display: 'flex', gap: 12, paddingLeft: 180 }}>
                {BUCKETS.map(bucket => (
                  <BucketColumn
                    key={bucket}
                    bucket={bucket}
                    tasks={getTasksFor(bucket, row.id)}
                    sows={data.sows}
                    sowId={row.id}
                    onOpenTask={t => setPanelTask(t)}
                    onCompleteTask={onCompleteTask}
                    onDragStart={onDragStart}
                    onDrop={onDrop}
                    onAddTask={openNewTask}
                  />
                ))}
              </div>
            )}
          </div>
        )
      })}

      {/* Task detail panel */}
      {panelTask !== null && (
        <TaskPanel
          task={panelTask}
          sows={data.sows}
          onClose={() => setPanelTask(null)}
          onSave={saveTask}
          onDelete={panelTask.id ? () => deleteTask(panelTask.id!) : undefined}
        />
      )}

      {/* Backdrop when panel is open */}
      {panelTask !== null && (
        <div
          onClick={() => setPanelTask(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 49, cursor: 'default' }}
        />
      )}
    </div>
  )
}
