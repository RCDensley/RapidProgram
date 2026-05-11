import { HttpRequest } from '@azure/functions'

// ─── Activity capture types ───────────────────────────────────────────────────

export type ActivityEntryType = 'app_focus' | 'audio_transcript' | 'screen_context'

export interface ActivityEntry {
  timestamp:       string              // ISO-8601
  type:            ActivityEntryType
  durationSeconds?: number             // app_focus
  appName?:         string             // app_focus
  windowTitle?:     string             // app_focus
  transcript?:      string             // audio_transcript
  screenTags?:      string             // screen_context — AI text description
}

export interface ActivityBatch {
  date:     string            // YYYY-MM-DD
  fromTime: string            // HH:mm
  toTime:   string            // HH:mm
  entries:  ActivityEntry[]
}

// ─── Daemon key validation ─────────────────────────────────────────────────────

export function validateDaemonKey(req: HttpRequest): boolean {
  const provided = req.headers.get('x-daemon-key') ?? ''
  const expected = process.env.DAEMON_API_KEY ?? ''
  // Reject if either side is empty — misconfigured is treated as invalid
  if (!provided || !expected) return false
  return provided === expected
}
