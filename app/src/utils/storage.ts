import { AppData } from '../types'
import { DEFAULT_DATA } from './defaultData'

const API_BASE = '/api'

export async function loadData(): Promise<AppData> {
  try {
    const res = await fetch(`${API_BASE}/data`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    // Deep merge — new top-level fields default from DEFAULT_DATA,
    // but arrays from the blob (sows, allocations etc.) always win.
    // Ensures milestones, pauses, and budgetSources exist even on old blobs.
    return {
      ...DEFAULT_DATA,
      ...json,
      milestones:   json.milestones   ?? DEFAULT_DATA.milestones,
      pauses:       json.pauses       ?? DEFAULT_DATA.pauses,
      tasks:        json.tasks        ?? DEFAULT_DATA.tasks,
      risks:        json.risks        ?? DEFAULT_DATA.risks,
      issues:       json.issues       ?? DEFAULT_DATA.issues,
      decisions:    json.decisions    ?? DEFAULT_DATA.decisions,
      projectFiles: json.projectFiles ?? DEFAULT_DATA.projectFiles,
      reports:      json.reports      ?? DEFAULT_DATA.reports,
      threads:      json.threads      ?? DEFAULT_DATA.threads,
    }
  } catch {
    // Offline / no backend yet — return defaults
    return DEFAULT_DATA
  }
}

export async function saveData(data: AppData): Promise<void> {
  // Merge server-created threads (e.g. check-in cards) that the local state
  // may not know about, so they aren't silently overwritten on every save.
  let threads = data.threads ?? []
  try {
    const peek = await fetch(`${API_BASE}/data`)
    if (peek.ok) {
      const serverJson = await peek.json()
      const serverThreads: any[] = serverJson.threads ?? []
      const localIds = new Set(threads.map(t => t.id))
      const newFromServer = serverThreads.filter((t: any) => !localIds.has(t.id))
      if (newFromServer.length > 0) {
        threads = [...newFromServer, ...threads]
      }
    }
  } catch { /* keep local threads on network error */ }

  const payload: AppData = { ...data, threads, lastUpdated: new Date().toISOString() }
  const res = await fetch(`${API_BASE}/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`)
}
