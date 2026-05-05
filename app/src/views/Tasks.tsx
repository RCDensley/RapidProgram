import React, { useState, useRef } from 'react'
import { useApp } from '../App'
import {
  Task, TaskBucket, TaskPriority, TaskStatus, TaskEffortUnit, TaskComment, TaskLink,
  PRIORITY_COLORS, BUCKET_LABELS, RecurrenceType, ProjectFile,
} from '../types'
import { completeTask, moveTask, formatEffort, formatRecurrence } from '../utils/taskUtils'
import { v4 as uuidv4 } from 'uuid'
import {
  Plus, X, ChevronDown, ChevronRight, RefreshCw, Link, MessageSquare,
  CheckCircle2, Circle, Trash2, ExternalLink, Paperclip, Loader2, FileText,
  Download, Upload as UploadIcon,
} from 'lucide-react'
import dayjs from 'dayjs'

const BUCKETS: TaskBucket[] = ['today', 'this-week', 'this-month', 'backlog']

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low', medium: 'Medium', high: 'High',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  'Open':        'var(--text-3)',
  'In Progress': '#38bdf8',
  'Done':        '#34d399',
}
const STATUS_BG: Record<TaskStatus, string> = {
  'Open':        'rgba(148,163,184,0.12)',
  'In Progress': 'rgba(56,189,248,0.12)',
  'Done':        'rgba(52,211,153,0.12)',
}

// ─── CSV helpers ───────────────────────────────────────────────────────────────
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
  let cur = '', field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') inQ = false
      else field += c
    } else if (c === '"') { inQ = true
    } else if (c === ',') {
      cur += field; rows[rows.length - 1]?.push(field) || rows.push([field]); field = ''
    } else if (c === '\n' || (c === '\r' && text[i + 1] === '\n')) {
      if (c === '\r') i++
      if (rows.length === 0) rows.push([])
      rows[rows.length - 1].push(field); rows.push([]); field = ''
    } else field += c
  }
  if (field || rows[rows.length - 1]?.length) {
    if (rows.length === 0) rows.push([])
    rows[rows.length - 1].push(field)
  }
  return rows.filter(r => r.some(c => c.trim()))
}

// ─── Drag state ───────────────────────────────────────────────────────────────
interface DragInfo {
  taskId:    string
  srcBucket: TaskBucket
  srcSowId:  string | null
}

// ─── Inline task card ─────────────────────────────────────────────────────────
function TaskCard({ task, sows, onOpen, onComplete, onDragStart }: {
  task: Task; sows: any[]
  onOpen: () => void; onComplete: () => void
  onDragStart: (e: React.DragEvent) => void
}) {
  const isComplete = !!task.completedAt
  const status     = task.status ?? 'Open'

  return (
    <div draggable onDragStart={onDragStart} onClick={onOpen}
      style={{
        background: 'var(--card)', borderLeft: `3px solid ${PRIORITY_COLORS[task.priority]}`,
        border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '10px 12px', marginBottom: 6, cursor: 'grab',
        opacity: isComplete ? 0.5 : 1, transition: 'all 0.15s', userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isComplete) { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = 'none'; (e.currentTarget as HTMLDivElement).style.transform = 'none' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <button onClick={e => { e.stopPropagation(); onComplete() }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: isComplete ? 'var(--emerald)' : 'var(--text-3)', flexShrink: 0, padding: 0, marginTop: 1 }}>
          {isComplete ? <CheckCircle2 size={14} /> : <Circle size={14} />}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: isComplete ? 'var(--text-3)' : 'var(--text-1)', textDecoration: isComplete ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {task.title}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLORS[task.priority], flexShrink: 0 }} />
            {status !== 'Open' && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 8, textTransform: 'uppercase' as const, letterSpacing: '0.04em', color: STATUS_COLORS[status], background: STATUS_BG[status] }}>
                {status}
              </span>
            )}
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-3)', background: 'var(--surface)', padding: '1px 5px', borderRadius: 4 }}>
              {formatEffort(task.effort)}
            </span>
            {task.recurrence    && <RefreshCw    size={10} style={{ color: 'var(--violet-bright)' }} />}
            {task.comments.length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-3)' }}><MessageSquare size={9} /> {task.comments.length}</span>}
            {task.links.length  > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-3)' }}><Link size={9} /> {task.links.length}</span>}
            {(task.attachments ?? []).length > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--text-3)' }}><Paperclip size={9} /> {task.attachments.length}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Bucket column ────────────────────────────────────────────────────────────
// isCollapsed: shrinks to a narrow vertical strip with rotated label.
// Open columns use flex:1 to fill the freed space.
function BucketColumn({ bucket, tasks, sows, sowId, isCollapsed, onToggle, onOpenTask, onCompleteTask, onDragStart, onDrop, onAddTask }: {
  bucket: TaskBucket; tasks: Task[]; sows: any[]; sowId: string | null
  isCollapsed: boolean; onToggle: () => void
  onOpenTask: (t: Task) => void; onCompleteTask: (id: string) => void
  onDragStart: (e: React.DragEvent, t: Task) => void
  onDrop: (bucket: TaskBucket, sowId: string | null) => void
  onAddTask: (bucket: TaskBucket, sowId: string | null) => void
}) {
  const [isDragOver, setIsDragOver] = useState(false)
  const incomplete = tasks.filter(t => !t.completedAt)
  const completed  = tasks.filter(t => !!t.completedAt)

  const dropProps = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) },
    onDragLeave: () => setIsDragOver(false),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); onDrop(bucket, sowId) },
  }

  if (isCollapsed) {
    // Narrow vertical strip — click to expand, still accepts drops
    return (
      <div
        {...dropProps}
        onClick={onToggle}
        title={`${BUCKET_LABELS[bucket]} — click to expand`}
        style={{
          flex: '0 0 36px', width: 36, cursor: 'pointer', userSelect: 'none',
          background: isDragOver ? 'rgba(56,189,248,0.08)' : 'var(--surface)',
          border: `1px solid ${isDragOver ? 'var(--sky)' : 'var(--border)'}`,
          borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.2s', minHeight: 80, padding: '12px 0',
        }}
      >
        <ChevronRight size={10} style={{ color: 'var(--text-3)' }} />
        <span style={{
          fontSize: 10, fontWeight: 800, color: 'var(--text-3)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
          writingMode: 'vertical-rl', transform: 'rotate(180deg)',
        }}>
          {BUCKET_LABELS[bucket]}
        </span>
        {incomplete.length > 0 && (
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', background: 'var(--border)', color: 'var(--text-2)', padding: '2px 5px', borderRadius: 8 }}>
            {incomplete.length}
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      {...dropProps}
      style={{ flex: 1, minWidth: 0, background: isDragOver ? 'rgba(56,189,248,0.05)' : 'var(--surface)', border: `1px solid ${isDragOver ? 'var(--sky)' : 'var(--border)'}`, borderRadius: 'var(--radius)', padding: '10px 10px 6px', transition: 'all 0.2s', minHeight: 80 }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        {/* Label — click to collapse */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }} onClick={onToggle} title="Click to collapse">
          <ChevronDown size={10} style={{ color: 'var(--text-3)' }} />
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
            {BUCKET_LABELS[bucket]}
          </span>
          {incomplete.length > 0 && (
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--border)', color: 'var(--text-2)', padding: '1px 6px', borderRadius: 10 }}>
              {incomplete.length}
            </span>
          )}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onAddTask(bucket, sowId) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, borderRadius: 4 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-1)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <Plus size={13} />
        </button>
      </div>
      {incomplete.map(t => (
        <TaskCard key={t.id} task={t} sows={sows} onOpen={() => onOpenTask(t)} onComplete={() => onCompleteTask(t.id)} onDragStart={e => onDragStart(e, t)} />
      ))}
      {completed.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, textAlign: 'center', fontWeight: 600 }}>
          {completed.length} completed
        </div>
      )}
    </div>
  )
}

// ─── Task panel ───────────────────────────────────────────────────────────────
function TaskPanel({ task, sows, projectFiles, onClose, onSave, onDelete, onAddAttachment }: {
  task: Partial<Task>; sows: any[]; projectFiles: ProjectFile[]
  onClose: () => void; onSave: (t: Partial<Task>) => void; onDelete?: () => void
  onAddAttachment: (file: File, taskTitle: string, sowId: string | null) => Promise<ProjectFile | null>
}) {
  const [t,            setT]           = useState<Partial<Task>>(task)
  const [newComment,   setNewComment]   = useState('')
  const [newLinkLabel, setNewLinkLabel] = useState('')
  const [newLinkUrl,   setNewLinkUrl]   = useState('')
  const [uploading,    setUploading]    = useState(false)
  const attachRef = useRef<HTMLInputElement>(null)

  const attachedFiles = projectFiles.filter(f => (t.attachments ?? []).includes(f.id))
  const isNew = !task.id

  function addComment() {
    if (!newComment.trim()) return
    const c: TaskComment = { id: uuidv4(), text: newComment.trim(), timestamp: new Date().toISOString() }
    setT(p => ({ ...p, comments: [...(p.comments ?? []), c] }))
    setNewComment('')
  }
  function addLink() {
    if (!newLinkUrl.trim()) return
    const l: TaskLink = { id: uuidv4(), label: newLinkLabel.trim() || newLinkUrl, url: newLinkUrl.trim() }
    setT(p => ({ ...p, links: [...(p.links ?? []), l] }))
    setNewLinkLabel(''); setNewLinkUrl('')
  }
  function removeLink(id: string)        { setT(p => ({ ...p, links:       (p.links       ?? []).filter(l => l.id !== id) })) }
  function removeAttachment(id: string)  { setT(p => ({ ...p, attachments: (p.attachments ?? []).filter(a => a !== id) })) }

  async function handleAttachFile(file: File) {
    setUploading(true)
    const result = await onAddAttachment(file, t.title ?? 'Task', t.sowId ?? null)
    if (result) setT(p => ({ ...p, attachments: [...(p.attachments ?? []), result.id] }))
    setUploading(false)
  }

  function handleStatusChange(status: TaskStatus) {
    setT(p => ({
      ...p, status,
      completedAt: status === 'Done' ? (p.completedAt ?? new Date().toISOString()) : undefined,
    }))
  }

  return (
    <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 440, background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 50, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{isNew ? 'New Task' : 'Edit Task'}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          {!isNew && onDelete && <button className="icon-btn" style={{ color: 'var(--red)' }} onClick={onDelete}><Trash2 size={14} /></button>}
          <button className="icon-btn" onClick={onClose}><X size={14} /></button>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
        <div className="field">
          <label className="field-label">Title</label>
          <input className="field-input" value={t.title ?? ''} autoFocus onChange={e => setT(p => ({ ...p, title: e.target.value }))} onKeyDown={e => e.key === 'Enter' && onSave(t)} />
        </div>
        <div className="field">
          <label className="field-label">Description</label>
          <textarea className="field-input" rows={3} style={{ resize: 'vertical', fontFamily: 'var(--font-main)' }} value={t.description ?? ''} onChange={e => setT(p => ({ ...p, description: e.target.value }))} />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Status</label>
            <select className="field-input" value={t.status ?? 'Open'} onChange={e => handleStatusChange(e.target.value as TaskStatus)} style={{ color: STATUS_COLORS[t.status ?? 'Open'], fontWeight: 700 }}>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Bucket</label>
            <select className="field-input" value={t.bucket ?? 'backlog'} onChange={e => setT(p => ({ ...p, bucket: e.target.value as TaskBucket }))}>
              {BUCKETS.map(b => <option key={b} value={b}>{BUCKET_LABELS[b]}</option>)}
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Project</label>
            <select className="field-input" value={t.sowId ?? '__program__'} onChange={e => setT(p => ({ ...p, sowId: e.target.value === '__program__' ? null : e.target.value }))}>
              <option value="__program__">Program</option>
              {sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Priority</label>
            <select className="field-input" value={t.priority ?? 'medium'} onChange={e => setT(p => ({ ...p, priority: e.target.value as TaskPriority }))}>
              {(['low', 'medium', 'high'] as TaskPriority[]).map(pr => <option key={pr} value={pr}>{PRIORITY_LABELS[pr]}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Effort</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field-input font-mono" type="number" min={0.5} step={0.5} style={{ width: 72 }} value={t.effort?.value ?? 1} onChange={e => setT(p => ({ ...p, effort: { ...(p.effort ?? { unit: 'hours' as TaskEffortUnit }), value: Number(e.target.value) } }))} />
            <select className="field-input" value={t.effort?.unit ?? 'hours'} onChange={e => setT(p => ({ ...p, effort: { ...(p.effort ?? { value: 1 }), unit: e.target.value as TaskEffortUnit } }))}>
              <option value="hours">hours</option>
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Recurrence</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <select className="field-input" value={t.recurrence?.type ?? '__none__'} onChange={e => { if (e.target.value === '__none__') setT(p => ({ ...p, recurrence: null })); else setT(p => ({ ...p, recurrence: { type: e.target.value as RecurrenceType, interval: p.recurrence?.interval ?? 1 } })) }}>
              <option value="__none__">No recurrence</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
            {t.recurrence && <input className="field-input font-mono" type="number" min={1} max={12} style={{ width: 64 }} value={t.recurrence.interval} onChange={e => setT(p => ({ ...p, recurrence: { ...(p.recurrence!), interval: Number(e.target.value) } }))} />}
          </div>
          {t.recurrence && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>{formatRecurrence(t.recurrence)}</div>}
        </div>
        <div className="field">
          <label className="field-label">Attachments</label>
          {attachedFiles.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 8px', background: 'var(--card)', borderRadius: 'var(--radius-sm)' }}>
              <FileText size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 12, color: 'var(--sky-bright)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{(f.size / 1024).toFixed(0)} KB</span>
              <button className="icon-btn" style={{ color: 'var(--text-3)', opacity: 0.5, flexShrink: 0 }} onClick={() => removeAttachment(f.id)} onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)' }} onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-3)' }}><X size={10} /></button>
            </div>
          ))}
          <button className="btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => attachRef.current?.click()} disabled={uploading}>
            {uploading ? <><Loader2 size={11} className="animate-spin" /> Uploading...</> : <><Paperclip size={11} /> Attach file</>}
          </button>
          <input ref={attachRef} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleAttachFile(e.target.files[0]) }} />
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Files are added to the repository and AI-classified using the task context.</div>
        </div>
        <div className="field">
          <label className="field-label">Links</label>
          {(t.links ?? []).map(l => (
            <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <a href={l.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ flex: 1, fontSize: 12, color: 'var(--sky-bright)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <ExternalLink size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />{l.label}
              </a>
              <button className="icon-btn" style={{ color: 'var(--text-3)', flexShrink: 0 }} onClick={() => removeLink(l.id)}><X size={11} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field-input field-input-sm" placeholder="Label" value={newLinkLabel} style={{ flex: 1 }} onChange={e => setNewLinkLabel(e.target.value)} />
            <input className="field-input field-input-sm font-mono" placeholder="https://..." value={newLinkUrl} style={{ flex: 2 }} onChange={e => setNewLinkUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addLink()} />
            <button className="btn-ghost btn-sm" onClick={addLink}><Plus size={11} /></button>
          </div>
        </div>
        <div className="field">
          <label className="field-label">Comments</label>
          <div style={{ maxHeight: 200, overflowY: 'auto', marginBottom: 8 }}>
            {(t.comments ?? []).map(c => (
              <div key={c.id} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--card)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: 12, color: 'var(--text-1)', lineHeight: 1.5 }}>{c.text}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{dayjs(c.timestamp).format('D MMM YY HH:mm')}</div>
              </div>
            ))}
            {(t.comments ?? []).length === 0 && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>No comments yet.</div>}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="field-input field-input-sm" placeholder="Add a comment..." value={newComment} style={{ flex: 1 }} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === 'Enter' && addComment()} />
            <button className="btn-ghost btn-sm" onClick={addComment}><Plus size={11} /></button>
          </div>
        </div>
      </div>
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

  const [expandedRows,     setExpandedRows]     = useState<Set<string>>(new Set(['__program__', ...data.sows.map(s => s.id)]))
  const [panelTask,        setPanelTask]        = useState<Partial<Task> | null>(null)
  const [filterPriority,   setFilterPriority]   = useState<string>('all')
  const [filterSow,        setFilterSow]        = useState<string>('all')
  const [filterStatus,     setFilterStatus]     = useState<string>('all')
  const [hideCompleted,    setHideCompleted]    = useState(false)
  const [collapsedBuckets, setCollapsedBuckets] = useState<Set<TaskBucket>>(new Set())

  function toggleBucket(b: TaskBucket) {
    setCollapsedBuckets(prev => { const n = new Set(prev); n.has(b) ? n.delete(b) : n.add(b); return n })
  }

  const dragRef    = useRef<DragInfo | null>(null)
  const importRef  = useRef<HTMLInputElement>(null)

  const rows: { id: string | null; label: string; color?: string }[] = [
    { id: null, label: 'Program', color: '#94a3b8' },
    ...data.sows.map(s => ({ id: s.id, label: s.shortName, color: s.color })),
  ]

  function getTasksFor(bucket: TaskBucket, sowId: string | null): Task[] {
    return data.tasks.filter(t => {
      if (t.bucket !== bucket)                                                  return false
      if (t.sowId !== sowId)                                                    return false
      if (filterPriority !== 'all' && t.priority !== filterPriority)            return false
      if (filterStatus   !== 'all' && (t.status ?? 'Open') !== filterStatus)   return false
      if (hideCompleted && t.completedAt)                                       return false
      return true
    }).sort((a, b) => a.order - b.order)
  }

  function onCompleteTask(taskId: string) { setData(completeTask(taskId, data)) }

  function onDragStart(e: React.DragEvent, task: Task) {
    dragRef.current = { taskId: task.id, srcBucket: task.bucket, srcSowId: task.sowId }
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDrop(targetBucket: TaskBucket, targetSowId: string | null) {
    const drag = dragRef.current
    if (!drag || (drag.srcBucket === targetBucket && drag.srcSowId === targetSowId)) return
    setData(moveTask(drag.taskId, targetBucket, targetSowId, data))
    dragRef.current = null
  }

  function openNewTask(bucket: TaskBucket, sowId: string | null) {
    setPanelTask({
      title: '', description: '', sowId, bucket,
      priority: 'medium', status: 'Open',
      effort: { value: 1, unit: 'hours' },
      recurrence: null, links: [], comments: [], attachments: [],
      order: data.tasks.filter(t => t.bucket === bucket && t.sowId === sowId).length,
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
      status:      partial.status ?? 'Open',
      effort:      partial.effort ?? { value: 1, unit: 'hours' },
      recurrence:  partial.recurrence ?? null,
      links:       partial.links ?? [],
      comments:    partial.comments ?? [],
      attachments: partial.attachments ?? [],
      completedAt: partial.completedAt,
      createdAt:   partial.createdAt ?? new Date().toISOString(),
      order:       partial.order ?? data.tasks.length,
    }
    const tasks = isNew ? [...data.tasks, task] : data.tasks.map(t => t.id === task.id ? task : t)
    setData({ ...data, tasks })
    setPanelTask(null)
  }

  function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return
    setData({ ...data, tasks: data.tasks.filter(t => t.id !== id) })
    setPanelTask(null)
  }

  async function handleAddAttachment(file: File, taskTitle: string, sowId: string | null): Promise<ProjectFile | null> {
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('taskHint', taskTitle)
      if (sowId) form.append('sowHint', sowId)
      const res = await fetch('/api/files', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const projectFile: ProjectFile = await res.json()
      setData({ ...data, projectFiles: [...data.projectFiles, projectFile] })
      return projectFile
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`)
      return null
    }
  }

  function exportTasksCsv() {
    const header = ['ID','Title','Description','Project','SOW_ID','Bucket','Priority','Status','Effort_Value','Effort_Unit','Created','Completed']
    const rows = data.tasks.map(t => {
      const sow = data.sows.find(s => s.id === t.sowId)
      return [t.id, t.title, t.description, sow?.shortName ?? 'Program', t.sowId ?? '', t.bucket, t.priority, t.status ?? 'Open', String(t.effort.value), t.effort.unit, t.createdAt, t.completedAt ?? '']
    })
    downloadCsv(`tasks-${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows])
  }

  function importTasksCsv(file: File) {
    const reader = new FileReader()
    reader.onload = ev => {
      const rows = parseCsvRows(ev.target?.result as string)
      if (rows.length < 2) return
      const header = rows[0].map(h => h.trim().toLowerCase())
      const idx = (name: string) => header.indexOf(name)
      const newTasks: Task[] = rows.slice(1).map((row, i) => ({
        id:          row[idx('id')]?.trim()      || uuidv4(),
        title:       row[idx('title')]?.trim()   || 'Imported task',
        description: row[idx('description')]?.trim() || '',
        sowId:       row[idx('sow_id')]?.trim()  || null,
        bucket:      (row[idx('bucket')]?.trim() || 'backlog') as TaskBucket,
        priority:    (row[idx('priority')]?.trim() || 'medium') as TaskPriority,
        status:      (row[idx('status')]?.trim() || 'Open') as TaskStatus,
        effort:      { value: Number(row[idx('effort_value')] || 1), unit: (row[idx('effort_unit')] || 'hours') as TaskEffortUnit },
        recurrence:  null, links: [], comments: [], attachments: [],
        createdAt:   row[idx('created')]?.trim() || new Date().toISOString(),
        completedAt: row[idx('completed')]?.trim() || undefined,
        order:       data.tasks.length + i,
      }))
      const existingIds = new Set(data.tasks.map(t => t.id))
      const toAdd = newTasks.filter(t => !existingIds.has(t.id))
      setData({ ...data, tasks: [...data.tasks, ...toAdd] })
      alert(`Imported ${toAdd.length} new tasks (${newTasks.length - toAdd.length} duplicates skipped).`)
    }
    reader.readAsText(file)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="view-root" style={{ paddingRight: panelTask ? 460 : 32, transition: 'padding-right 0.2s' }}>
      <div className="view-header">
        <div>
          <h1 className="view-title">Tasks</h1>
          <p className="view-sub">Drag between buckets · click a bucket header to collapse it</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost btn-sm" onClick={exportTasksCsv} title="Export tasks as CSV"><Download size={13} /> Export CSV</button>
          <button className="btn-ghost btn-sm" onClick={() => importRef.current?.click()} title="Import tasks from CSV"><UploadIcon size={13} /> Import CSV</button>
          <input ref={importRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) importTasksCsv(e.target.files[0]) }} />
          <button className="btn-primary" onClick={() => openNewTask('backlog', null)}><Plus size={14} /> New Task</button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="field-input field-input-sm" value={filterSow} onChange={e => setFilterSow(e.target.value)}>
          <option value="all">All projects</option>
          {data.sows.map(s => <option key={s.id} value={s.id}>{s.shortName}</option>)}
        </select>
        <select className="field-input field-input-sm" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select className="field-input field-input-sm" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="Open">Open</option>
          <option value="In Progress">In Progress</option>
          <option value="Done">Done</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--text-2)', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} />
          Hide completed
        </label>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {data.tasks.filter(t => !t.completedAt).length} open · {data.tasks.filter(t => !!t.completedAt).length} done
        </span>
      </div>

      {/* Project rows — each row contains BucketColumns that handle their own header + collapse */}
      {rows.map(row => {
        if (filterSow !== 'all' && row.id !== null && row.id !== filterSow) return null
        const rowKey     = row.id ?? '__program__'
        const isExpanded = expandedRows.has(rowKey)
        const totalTasks = BUCKETS.reduce((n, b) => n + getTasksFor(b, row.id).length, 0)
        return (
          <div key={rowKey} style={{ marginBottom: 12 }}>
            {/* Row header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', marginBottom: isExpanded ? 8 : 0 }}
              onClick={() => setExpandedRows(prev => { const n = new Set(prev); n.has(rowKey) ? n.delete(rowKey) : n.add(rowKey); return n })}>
              <span style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </span>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: row.color ?? '#94a3b8', flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{row.label}</span>
              {totalTasks > 0 && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', background: 'var(--border)', color: 'var(--text-2)', padding: '1px 6px', borderRadius: 10 }}>{totalTasks}</span>}
            </div>

            {/* Bucket columns — collapsed ones shrink to 36px, expanded ones share remaining space */}
            {isExpanded && (
              <div style={{ display: 'flex', gap: 12, paddingLeft: 180 }}>
                {BUCKETS.map(bucket => (
                  <BucketColumn
                    key={bucket}
                    bucket={bucket}
                    tasks={getTasksFor(bucket, row.id)}
                    sows={data.sows}
                    sowId={row.id}
                    isCollapsed={collapsedBuckets.has(bucket)}
                    onToggle={() => toggleBucket(bucket)}
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

      {panelTask !== null && (
        <TaskPanel
          task={panelTask} sows={data.sows} projectFiles={data.projectFiles}
          onClose={() => setPanelTask(null)} onSave={saveTask}
          onDelete={panelTask.id ? () => deleteTask(panelTask.id!) : undefined}
          onAddAttachment={handleAddAttachment}
        />
      )}
      {panelTask !== null && <div onClick={() => setPanelTask(null)} style={{ position: 'fixed', inset: 0, zIndex: 49, cursor: 'default' }} />}
    </div>
  )
}
