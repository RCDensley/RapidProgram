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
      milestones: json.milestones ?? DEFAULT_DATA.milestones,
      pauses:     json.pauses     ?? DEFAULT_DATA.pauses,
    }
  } catch {
    // Offline / no backend yet — return defaults
    return DEFAULT_DATA
  }
}

export async function saveData(data: AppData): Promise<void> {
  const payload: AppData = { ...data, lastUpdated: new Date().toISOString() }
  const res = await fetch(`${API_BASE}/data`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Save failed: HTTP ${res.status}`)
}
