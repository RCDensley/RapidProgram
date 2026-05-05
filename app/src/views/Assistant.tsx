import React, { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import { useApp } from '../App'
import { ProjectFile } from '../types'
import {
  Upload, Trash2, Bot, Send, Loader2, FileText, CheckCircle2,
  AlertTriangle, X, Image, Eye, Plus, ShieldAlert, AlertOctagon, Lightbulb, CheckSquare,
  ChevronDown, ChevronRight, Folder, FolderOpen,
} from 'lucide-react'
import dayjs from 'dayjs'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

const SUGGESTED_PROMPTS = [
  'What do I need to do this week?',
  'What risks are currently open across the program?',
  'Summarise the program status and budget position.',
  "What's the forecast vs budget on Automation Champion?",
  'What milestones are coming up in the next 30 days?',
]

// ─── File type helpers ────────────────────────────────────────────────────────
const IMAGE_MIME  = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']
const TEXT_MIME   = ['text/plain', 'text/markdown', 'application/json', 'text/html']
const PDF_MIME    = ['application/pdf']
const DOCX_MIME   = [
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]
const EXCEL_MIME  = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]
const CSV_MIME    = ['text/csv']

function isImage(f: ProjectFile) { return IMAGE_MIME.includes(f.mimeType) }
function isPDF(f: ProjectFile)   { return PDF_MIME.includes(f.mimeType) }
function isDOCX(f: ProjectFile)  { return DOCX_MIME.includes(f.mimeType) }
function isExcel(f: ProjectFile) { return EXCEL_MIME.includes(f.mimeType) }
function isCSV(f: ProjectFile)   { return CSV_MIME.includes(f.mimeType) }
function isText(f: ProjectFile)  { return TEXT_MIME.some(t => f.mimeType.startsWith(t)) || isCSV(f) }
function canPreview(f: ProjectFile) { return isImage(f) || isPDF(f) || isDOCX(f) || isExcel(f) || isCSV(f) || isText(f) }

// ─── Action metadata ──────────────────────────────────────────────────────────
const ACTION_META: Record<string, { label: string; icon: any; color: string; desc: (p: any) => string }> = {
  create_task:     { label: 'Create Task',   icon: CheckSquare,   color: '#38bdf8', desc: (p) => `"${p.title}" - ${p.bucket ?? 'backlog'} - ${p.priority ?? 'medium'} priority` },
  create_risk:     { label: 'Log Risk',      icon: ShieldAlert,   color: '#fbbf24', desc: (p) => `"${p.title}" - L${p.likelihood ?? '?'} x I${p.impact ?? '?'} = ${(p.likelihood ?? 0) * (p.impact ?? 0)}` },
  create_issue:    { label: 'Log Issue',     icon: AlertOctagon,  color: '#fb923c', desc: (p) => `"${p.title}" - ${p.impact ?? 'Medium'} impact` },
  create_decision: { label: 'Log Decision',  icon: Lightbulb,     color: '#a78bfa', desc: (p) => `"${p.title}" - ${p.date ?? 'today'}` },
  refile_file:     { label: 'Refile',        icon: FolderOpen,    color: '#34d399', desc: (p) => `Move to “${p.newFolder ?? 'new folder'}”${p.newSowId ? ` · reassign to ${p.newSowId}` : ''}` },
}

// ─── Action card ──────────────────────────────────────────────────────────────
function ActionCard({ actionType, payload, sows, onConfirm, onDismiss }: {
  actionType: string; payload: any; sows: any[]
  onConfirm: () => void; onDismiss: () => void
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [err,   setErr]   = useState('')
  const meta = ACTION_META[actionType]
  if (!meta) return null
  const sow  = sows.find((s: any) => s.id === payload.sowId)
  const Icon = meta.icon

  async function confirm() {
    setState('loading')
    try {
      const res = await fetch('/api/write', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: actionType, payload }),
      })
      if (!res.ok) throw new Error(await res.text())
      setState('done'); onConfirm()
    } catch (e: any) { setErr(e.message); setState('error') }
  }

  return (
    <div style={{ border: `1.5px solid ${meta.color}44`, borderLeft: `3px solid ${meta.color}`, borderRadius: 'var(--radius-sm)', background: meta.color + '0a', padding: '10px 12px', margin: '6px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <Icon size={12} style={{ color: meta.color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 800, color: meta.color, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }}>{meta.label}</span>
        {sow && <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: sow.color + '22', color: sow.color }}>{sow.shortName}</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 8, fontWeight: 600 }}>{meta.desc(payload)}</div>
      {state === 'done'  && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--emerald-bright)', fontWeight: 700 }}><CheckCircle2 size={13} /> Created</div>}
      {state === 'error' && <div style={{ fontSize: 11, color: 'var(--red-bright)', fontWeight: 600 }}>{err}</div>}
      {(state === 'idle' || state === 'loading') && (
        <div style={{ display: 'flex', gap: 7 }}>
          <button onClick={confirm} disabled={state === 'loading'} style={{ display: 'flex', alignItems: 'center', gap: 5, background: meta.color, color: '#0F172A', border: 'none', borderRadius: 'var(--radius-sm)', padding: '5px 12px', fontSize: 11, fontWeight: 800, cursor: state === 'loading' ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-main)', opacity: state === 'loading' ? 0.6 : 1 }}>
            {state === 'loading' ? <><Loader2 size={10} className="animate-spin" /> Saving...</> : <><Plus size={10} /> Confirm</>}
          </button>
          <button onClick={onDismiss} disabled={state === 'loading'} style={{ background: 'transparent', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-main)' }}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}

// ─── File preview modal ───────────────────────────────────────────────────────
function FilePreview({ file, onClose }: { file: ProjectFile; onClose: () => void }) {
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState('')
  const [textContent, setTextContent] = useState<string | null>(null)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [pdfBlobUrl,  setPdfBlobUrl]  = useState<string | null>(null)
  const [sheetData,   setSheetData]   = useState<{ name: string; rows: any[][] }[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const contentUrl = `/api/files/${encodeURIComponent(file.storageName)}/content`

  useEffect(() => {
    let revoke: string | null = null
    setLoading(true); setLoadError('');
    (async () => {
      try {
        if (isImage(file)) { setLoading(false); return }
        const res = await fetch(contentUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        if (isPDF(file)) {
          const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
          revoke = url; setPdfBlobUrl(url)
        } else if (isDOCX(file)) {
          const result = await mammoth.convertToHtml({ arrayBuffer: buf })
          setHtmlContent(result.value)
        } else if (isExcel(file)) {
          const wb = XLSX.read(buf, { type: 'array' })
          setSheetData(wb.SheetNames.map(name => ({
            name,
            rows: XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: '' }),
          })))
          setActiveSheet(0)
        } else {
          setTextContent(new TextDecoder().decode(buf))
        }
      } catch (e: any) {
        setLoadError(e.message)
      } finally {
        setLoading(false)
      }
    })()
    return () => { if (revoke) URL.revokeObjectURL(revoke) }
  }, [file.storageName])

  function renderBody() {
    if (loading)    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}><Loader2 size={28} className="animate-spin" style={{ color: 'var(--sky-bright)' }} /></div>
    if (loadError)  return <div style={{ padding: 32, textAlign: 'center', color: 'var(--red-bright)' }}><AlertTriangle size={28} style={{ margin: '0 auto 10px', opacity: 0.7 }} /><div style={{ fontSize: 13 }}>{loadError}</div></div>
    if (isImage(file)) return <img src={contentUrl} alt={file.name} style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block', margin: '0 auto', borderRadius: 8 }} />
    if (isPDF(file) && pdfBlobUrl) return <iframe src={pdfBlobUrl} style={{ width: '100%', height: '72vh', border: 'none' }} title={file.name} />
    if (isDOCX(file) && htmlContent !== null) return <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: htmlContent }} />
    if (isExcel(file) && sheetData.length > 0) {
      const sheet = sheetData[activeSheet]
      return (
        <div>
          {sheetData.length > 1 && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              {sheetData.map((s, i) => (
                <button key={s.name} onClick={() => setActiveSheet(i)} style={{
                  padding: '4px 12px', fontSize: 11, fontWeight: 700, borderRadius: 20, cursor: 'pointer', fontFamily: 'var(--font-main)',
                  border: `1.5px solid ${i === activeSheet ? 'var(--sky)' : 'var(--border)'}`,
                  background: i === activeSheet ? 'rgba(56,189,248,0.12)' : 'transparent',
                  color: i === activeSheet ? 'var(--sky-bright)' : 'var(--text-3)',
                }}>{s.name}</button>
              ))}
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
              <tbody>
                {sheet.rows.slice(0, 200).map((row: any[], ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ border: '1px solid var(--border)', padding: '5px 10px', background: ri === 0 ? 'var(--surface)' : 'transparent', fontWeight: ri === 0 ? 700 : 400, color: 'var(--text-1)', whiteSpace: 'nowrap' as const, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sheet.rows.length > 200 && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>Showing first 200 rows of {sheet.rows.length}</div>}
        </div>
      )
    }
    if (textContent !== null) return <pre style={{ fontSize: 12, color: 'var(--text-1)', fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.6 }}>{textContent}</pre>
    return (
      <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>
        <FileText size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Preview not available.</div>
        <div style={{ fontSize: 11, marginTop: 6 }}>Reference in chat with /{file.name}</div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1.5px solid var(--border-2)', borderRadius: 'var(--radius-lg)', width: '85vw', maxWidth: 1000, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{file.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{file.folder} · {(file.size / 1024).toFixed(0)} KB · {file.mimeType}</div>
          </div>
          <button className="modal-close" onClick={onClose}>&#x2715;</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: isPDF(file) ? 0 : 20 }}>{renderBody()}</div>
      </div>
    </div>
  )
}

// ─── Folder tree builder ───────────────────────────────────────────────────────────────
interface TreeNode {
  name:     string
  path:     string   // full dot-separated path e.g. 'Purview.Meeting Notes'
  children: Record<string, TreeNode>
  files:    ProjectFile[]
}

function buildTree(files: ProjectFile[]): TreeNode {
  const root: TreeNode = { name: '', path: '', children: {}, files: [] }
  for (const file of files) {
    const parts = (file.folder || 'Uncategorised').split('/').map(p => p.trim()).filter(Boolean)
    let node = root
    let pathSoFar = ''
    for (const part of parts) {
      pathSoFar = pathSoFar ? `${pathSoFar}/${part}` : part
      if (!node.children[part]) {
        node.children[part] = { name: part, path: pathSoFar, children: {}, files: [] }
      }
      node = node.children[part]
    }
    node.files.push(file)
  }
  return root
}

// ─── File leaf (inside a folder) ───────────────────────────────────────────────────────────────
function FileLeaf({ file, depth, onDelete, onPreview }: {
  file: ProjectFile; depth: number
  onDelete: () => void; onPreview: () => void
}) {
  const imgUrl      = `/api/files/${encodeURIComponent(file.storageName)}/content`
  const previewable = canPreview(file)

  return (
    <div
      onClick={previewable ? onPreview : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 10px 5px 0',
        paddingLeft: `${10 + depth * 16}px`,
        cursor: previewable ? 'pointer' : 'default',
        borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => previewable && (e.currentTarget.style.background = 'rgba(56,189,248,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      {/* Icon / thumbnail */}
      {isImage(file) ? (
        <div style={{ width: 18, height: 18, borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
          <img src={imgUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <FileText size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      )}

      {/* Filename */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 11, fontWeight: 600,
          color: previewable ? 'var(--sky-bright)' : 'var(--text-1)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
          {(file.size / 1024).toFixed(0)} KB
        </div>
      </div>

      {previewable && <Eye size={9} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}

      <button
        className="icon-btn"
        style={{ color: 'var(--text-3)', flexShrink: 0, opacity: 0.5 }}
        onClick={e => { e.stopPropagation(); onDelete() }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--red)' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--text-3)' }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  )
}

// ─── Folder node (recursive, collapsible) ───────────────────────────────────────────────────────────────
function FolderNode({ node, depth, collapsed, toggleCollapse, onDelete, onPreview }: {
  node: TreeNode; depth: number
  collapsed: Set<string>; toggleCollapse: (path: string) => void
  onDelete: (storageName: string) => void; onPreview: (file: ProjectFile) => void
}) {
  const isOpen      = !collapsed.has(node.path)
  const hasContent  = Object.keys(node.children).length > 0 || node.files.length > 0
  const totalFiles  = countFiles(node)
  const indent      = depth * 16

  return (
    <div>
      {/* Folder header row */}
      <div
        onClick={() => toggleCollapse(node.path)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `6px 10px 6px ${10 + indent}px`,
          cursor: 'pointer', borderBottom: '1px solid var(--border)',
          background: 'transparent',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(148,163,184,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        {/* Toggle chevron */}
        {isOpen
          ? <ChevronDown  size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
          : <ChevronRight size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
        }
        {/* Folder icon */}
        {isOpen
          ? <FolderOpen size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
          : <Folder     size={13} style={{ color: '#fbbf24', flexShrink: 0 }} />
        }
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
        <span style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{totalFiles}</span>
      </div>

      {/* Children (sub-folders and files) */}
      {isOpen && (
        <div>
          {Object.values(node.children)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(child => (
              <FolderNode
                key={child.path}
                node={child}
                depth={depth + 1}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                onDelete={onDelete}
                onPreview={onPreview}
              />
            ))
          }
          {node.files
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(file => (
              <FileLeaf
                key={file.id}
                file={file}
                depth={depth + 1}
                onDelete={() => onDelete(file.storageName)}
                onPreview={() => onPreview(file)}
              />
            ))
          }
        </div>
      )}
    </div>
  )
}

function countFiles(node: TreeNode): number {
  const own = node.files.length
  const nested = Object.values(node.children).reduce((s, c) => s + countFiles(c), 0)
  return own + nested
}

// ─── File row (kept for autocomplete — not used in tree) ────────────────────────────────────────────
function FileRow({ file, onDelete, onPreview }: { file: ProjectFile; onDelete: () => void; onPreview: () => void }) {
  const imgUrl     = `/api/files/${encodeURIComponent(file.storageName)}/content`
  const previewable = canPreview(file)

  return (
    <div
      onClick={previewable ? onPreview : undefined}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', cursor: previewable ? 'pointer' : 'default' }}>
      {isImage(file) ? (
        <div style={{ width: 32, height: 32, borderRadius: 4, overflow: 'hidden', flexShrink: 0, background: 'var(--border)' }}>
          <img src={imgUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      ) : (
        <FileText size={13} style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: previewable ? 'var(--sky-bright)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {file.name}
          </div>
          {previewable && <Eye size={10} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{file.folder}</div>
        {file.description && (
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {file.description}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
          {file.classificationStatus === 'classified' && <CheckCircle2 size={9} style={{ color: 'var(--emerald)' }} />}
          {file.classificationStatus === 'pending'    && <Loader2    size={9} style={{ color: 'var(--amber)' }} className="animate-spin" />}
          {file.classificationStatus === 'failed'     && <AlertTriangle size={9} style={{ color: 'var(--red)' }} />}
          <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{(file.size / 1024).toFixed(0)} KB · {dayjs(file.uploadedAt).format('D MMM')}</span>
        </div>
      </div>
      <button className="icon-btn" style={{ color: 'var(--text-3)', flexShrink: 0 }} onClick={e => { e.stopPropagation(); onDelete() }}>
        <Trash2 size={11} />
      </button>
    </div>
  )
}

// ─── Chat message ─────────────────────────────────────────────────────────────
function Message({ msg, sows, onRefileConfirm }: { msg: ChatMessage; sows: any[]; onRefileConfirm: () => void }) {
  const isUser = msg.role === 'user'
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())

  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && (
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'rgba(56,189,248,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={14} style={{ color: 'var(--sky-bright)' }} />
        </div>
      )}
      <div style={{
        maxWidth: '80%',
        background: isUser ? 'rgba(56,189,248,0.12)' : 'var(--card)',
        border: `1px solid ${isUser ? 'rgba(56,189,248,0.25)' : 'var(--border)'}`,
        borderRadius: isUser ? '12px 12px 4px 12px' : '4px 12px 12px 12px',
        padding: '10px 14px',
      }}>
        <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.7, wordBreak: 'break-word' }}>
          {isUser ? msg.content : (
            <ReactMarkdown components={{
              p:      ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
              strong: ({ children }) => <strong style={{ color: 'var(--text-1)', fontWeight: 800 }}>{children}</strong>,
              em:     ({ children }) => <em style={{ color: 'var(--text-2)' }}>{children}</em>,
              ul:     ({ children }) => <ul style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ul>,
              ol:     ({ children }) => <ol style={{ margin: '4px 0 8px', paddingLeft: 18 }}>{children}</ol>,
              li:     ({ children }) => <li style={{ marginBottom: 3, color: 'var(--text-1)' }}>{children}</li>,
              h1:     ({ children }) => <h1 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', margin: '8px 0 6px' }}>{children}</h1>,
              h2:     ({ children }) => <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', margin: '8px 0 5px' }}>{children}</h2>,
              h3:     ({ children }) => <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)', margin: '6px 0 4px' }}>{children}</h3>,
              hr:     () => <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />,
              code:   ({ className, children }) => {
                const lang = (className ?? '').replace('language-', '')
                if (lang.startsWith('action:')) {
                  const actionType = lang.replace('action:', '')
                  const key = `${msg.id}-${actionType}-${String(children).slice(0, 20)}`
                  if (dismissed.has(key)) return null
                  try {
                    const payload = JSON.parse(String(children))
                    return (
                      <ActionCard
                        actionType={actionType} payload={payload} sows={sows}
                        onConfirm={() => {
                          if (actionType === 'refile_file') onRefileConfirm()
                        }}
                        onDismiss={() => setDismissed(prev => new Set([...prev, key]))}
                      />
                    )
                  } catch { /* fall through */ }
                }
                return <code style={{ background: 'var(--surface)', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--sky-bright)' }}>{children}</code>
              },
            }}>
              {msg.content}
            </ReactMarkdown>
          )}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 5, fontFamily: 'var(--font-mono)' }}>
          {dayjs(msg.timestamp).format('HH:mm')}
        </div>
      </div>
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────
export default function Assistant() {
  const { data, setData, reloadData } = useApp()

  const [messages,         setMessages]         = useState<ChatMessage[]>([])
  const [input,            setInput]            = useState('')
  const [isStreaming,      setIsStreaming]      = useState(false)
  const [uploading,        setUploading]        = useState(false)
  const [previewFile,      setPreviewFile]      = useState<ProjectFile | null>(null)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [acQuery,          setAcQuery]          = useState('')
  const [acIndex,          setAcIndex]          = useState(0)
  const [collapsed,        setCollapsed]        = useState<Set<string>>(new Set())

  function toggleCollapse(path: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  // Build folder tree from files
  const fileTree = buildTree(data.projectFiles)

  const chatEndRef   = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inputRef     = useRef<HTMLInputElement>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const acFiles = data.projectFiles.filter(f =>
    acQuery === '' || f.name.toLowerCase().includes(acQuery.toLowerCase())
  ).slice(0, 8)

  function handleInputChange(val: string) {
    setInput(val)
    const lastSlash = val.lastIndexOf('/')
    if (lastSlash !== -1) {
      const query = val.slice(lastSlash + 1)
      if (!query.includes(' ')) { setAcQuery(query); setShowAutocomplete(true); setAcIndex(0); return }
    }
    setShowAutocomplete(false)
  }

  function insertFileRef(file: ProjectFile) {
    const lastSlash = input.lastIndexOf('/')
    const before    = lastSlash === -1 ? input : input.slice(0, lastSlash)
    setInput(`${before}/${file.name} `)
    setShowAutocomplete(false)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (showAutocomplete && acFiles.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAcIndex(i => Math.min(i + 1, acFiles.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setAcIndex(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); insertFileRef(acFiles[acIndex]); return }
      if (e.key === 'Escape') { setShowAutocomplete(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !showAutocomplete) sendMessage()
  }

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/files', { method: 'POST', body: form })
      if (!res.ok) throw new Error(await res.text())
      const projectFile: ProjectFile = await res.json()
      setData({ ...data, projectFiles: [...data.projectFiles, projectFile] })
    } catch (e: any) { alert(`Upload failed: ${e.message}`) }
    finally { setUploading(false) }
  }

  function onFileDrop(e: React.DragEvent) { e.preventDefault(); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]) }

  async function deleteFile(storageName: string) {
    await fetch(`/api/files/${encodeURIComponent(storageName)}`, { method: 'DELETE' })
    setData({ ...data, projectFiles: data.projectFiles.filter(f => f.storageName !== storageName) })
  }

  async function sendMessage(text?: string) {
    const msgText = (text ?? input).trim()
    if (!msgText || isStreaming) return
    setInput(''); setShowAutocomplete(false)

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: msgText, timestamp: new Date().toISOString() }
    const updated = [...messages, userMsg]
    setMessages(updated)
    setIsStreaming(true)

    const aId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: aId, role: 'assistant', content: '', timestamp: new Date().toISOString() }])

    try {
      const res = await fetch('/api/ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated.map(m => ({ role: m.role, content: m.content })) }),
      })
      if (!res.ok) throw new Error(await res.text())
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const dec    = new TextDecoder()
      let buf      = ''

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
            if (j.delta) setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: m.content + j.delta } : m))
            if (j.error) throw new Error(j.error)
          } catch { /* ignore malformed */ }
        }
      }
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === aId ? { ...m, content: `Error: ${e.message}` } : m))
    } finally {
      setIsStreaming(false)
    }
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

      {/* File library */}
      <div style={{ width: 280, flexShrink: 0, background: 'var(--surface)', borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 14px 10px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>File Repository</div>
          <div
            onDrop={onFileDrop} onDragOver={e => e.preventDefault()} onClick={() => fileInputRef.current?.click()}
            style={{ border: '1.5px dashed var(--border-2)', borderRadius: 'var(--radius-sm)', padding: 12, textAlign: 'center', cursor: 'pointer', background: 'var(--card)', transition: 'all 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--sky)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}>
            {uploading ? <Loader2 size={16} style={{ color: 'var(--sky)', margin: '0 auto' }} className="animate-spin" /> : <Upload size={16} style={{ color: 'var(--text-3)', margin: '0 auto 4px' }} />}
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{uploading ? 'Uploading and classifying...' : 'Drop file or click'}</div>
          </div>
          <input ref={fileInputRef} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]) }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {data.projectFiles.length === 0 && <div style={{ padding: 16, fontSize: 12, color: 'var(--text-3)', textAlign: 'center', fontWeight: 600 }}>No files yet. Upload documents, meeting notes, or transcripts.</div>}
          {Object.values(fileTree.children)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(node => (
              <FolderNode
                key={node.path}
                node={node}
                depth={0}
                collapsed={collapsed}
                toggleCollapse={toggleCollapse}
                onDelete={storageName => deleteFile(storageName)}
                onPreview={file => setPreviewFile(file)}
              />
            ))
          }
          {/* Root-level files (no folder assigned) */}
          {fileTree.files.sort((a, b) => a.name.localeCompare(b.name)).map(f => (
            <FileLeaf
              key={f.id}
              file={f}
              depth={0}
              onDelete={() => deleteFile(f.storageName)}
              onPreview={() => setPreviewFile(f)}
            />
          ))}
        </div>

        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, fontWeight: 600 }}>
          Type / in chat to reference a file. Click a file to preview it. Click a folder to collapse or expand it.
        </div>
      </div>

      {/* Chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bot size={16} style={{ color: 'var(--sky-bright)' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>Project Assistant</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Live project data always in context · Type / to reference an uploaded file</div>
          </div>
          {messages.length > 0 && <button className="btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setMessages([])}><X size={11} /> Clear</button>}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {messages.length === 0 && (
            <div>
              <div style={{ textAlign: 'center', marginBottom: 28 }}>
                <Bot size={36} style={{ color: 'var(--sky-bright)', margin: '0 auto 12px' }} />
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>How can I help with the program?</div>
                <div style={{ fontSize: 13, color: 'var(--text-3)' }}>I have access to all live project data. Type / to reference an uploaded file.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxWidth: 600, margin: '0 auto' }}>
                {SUGGESTED_PROMPTS.map(p => (
                  <button key={p} onClick={() => sendMessage(p)} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', fontFamily: 'var(--font-main)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--sky)'; e.currentTarget.style.color = 'var(--text-1)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-2)' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(m => <Message key={m.id} msg={m} sows={data.sows} onRefileConfirm={reloadData} />)}
          <div ref={chatEndRef} />
        </div>

        {/* Input + autocomplete */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', position: 'relative' }}>
          {showAutocomplete && acFiles.length > 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 20, right: 70, background: 'var(--surface)', border: '1.5px solid var(--border-2)', borderRadius: 'var(--radius-sm)', marginBottom: 6, boxShadow: '0 -8px 24px rgba(0,0,0,0.4)', overflow: 'hidden', zIndex: 10 }}>
              {acFiles.map((f, i) => (
                <div key={f.id} onClick={() => insertFileRef(f)} onMouseEnter={() => setAcIndex(i)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: i === acIndex ? 'rgba(56,189,248,0.1)' : 'transparent', borderBottom: i < acFiles.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {isImage(f) ? <Image size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <FileText size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: i === acIndex ? 'var(--sky-bright)' : 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{f.folder}</div>
                  </div>
                  {isImage(f) && <span style={{ fontSize: 9, color: 'var(--amber-bright)', fontWeight: 700 }}>image</span>}
                  {isPDF(f)   && <span style={{ fontSize: 9, color: 'var(--red-bright)',   fontWeight: 700 }}>pdf</span>}
                  {isDOCX(f)  && <span style={{ fontSize: 9, color: 'var(--violet-bright)', fontWeight: 700 }}>docx</span>}
                  {isExcel(f) && <span style={{ fontSize: 9, color: 'var(--emerald-bright)', fontWeight: 700 }}>xlsx</span>}
                </div>
              ))}
              <div style={{ padding: '5px 12px', fontSize: 9, color: 'var(--text-3)', background: 'var(--card)', fontWeight: 600 }}>
                Up/Down to navigate · Enter or Tab to select · Esc to dismiss
              </div>
            </div>
          )}
          {showAutocomplete && acFiles.length === 0 && (
            <div style={{ position: 'absolute', bottom: '100%', left: 20, right: 70, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 6, padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
              No files match "{acQuery}"
            </div>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            <input ref={inputRef} className="field-input" placeholder="Ask anything... or type / to reference a file"
              value={input} onChange={e => handleInputChange(e.target.value)} onKeyDown={handleKeyDown}
              disabled={isStreaming} style={{ flex: 1 }} />
            <button className="btn-primary" onClick={() => sendMessage()} disabled={isStreaming || !input.trim()} style={{ opacity: isStreaming || !input.trim() ? 0.4 : 1 }}>
              {isStreaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>
        </div>
      </div>

      {previewFile && <FilePreview file={previewFile} onClose={() => setPreviewFile(null)} />}
    </div>
  )
}
