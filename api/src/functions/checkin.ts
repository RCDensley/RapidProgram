import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'
import { getAIProvider, AIMessage } from '../_lib/providers'
import { validateDaemonKey } from '../types/activity'

const CONTAINER = 'pmtracking'
const DATA_BLOB  = 'appdata.json'

function getStorageClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(conn)
}

async function readBlob(svc: BlobServiceClient, name: string): Promise<string | null> {
  try {
    const blob = svc.getContainerClient(CONTAINER).getBlockBlobClient(name)
    if (!await blob.exists()) return null
    const dl = await blob.download()
    const chunks: Buffer[] = []
    for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
  } catch { return null }
}

async function writeBlob(svc: BlobServiceClient, name: string, content: string) {
  const blob = svc.getContainerClient(CONTAINER).getBlockBlobClient(name)
  await blob.upload(content, Buffer.byteLength(content), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function checkinTitle(localTitle?: string): string {
  if (localTitle) return localTitle
  // Fallback: server UTC time (only used if daemon doesn't send a title)
  const now = new Date()
  const hh  = String(now.getUTCHours()).padStart(2, '0')
  const mm  = String(now.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm} Check-in (UTC)`
}

function buildCheckinPrompt(appData: any, activityBatches: any[]): string {
  const today     = todayDate()
  const sows      = (appData.sows ?? []).map((s: any) => s.name).join(', ')
  const openTasks = (appData.tasks ?? [])
    .filter((t: any) => t.status !== 'Done')
    .map((t: any) => `• [${t.priority}] ${t.title}`)
    .slice(0, 10)
    .join('\n')
  const openRisks = (appData.risks ?? [])
    .filter((r: any) => r.status === 'Open')
    .map((r: any) => `• ${r.title} (score ${r.likelihood * r.impact})`)
    .slice(0, 5)
    .join('\n')

  const activityLines = activityBatches.flatMap((b: any) =>
    (b.entries ?? []).map((e: any) => {
      const t = String(e.timestamp ?? '').slice(11, 16)
      if (e.type === 'app_focus')        return `  ${t}  ${e.appName} — ${e.windowTitle} (${Math.round((e.durationSeconds ?? 0) / 60)} min)`
      if (e.type === 'audio_transcript') return `  ${t}  [Transcript] ${e.transcript}`
      if (e.type === 'screen_context')   return `  ${t}  [Screen] ${e.screenTags}`
      return null
    }).filter(Boolean)
  ).join('\n')

  return `You are reviewing an hourly activity check-in for ${today}.

ACTIVE PROJECTS: ${sows}

TODAY'S ACTIVITY:
${activityLines || '  No activity recorded yet today.'}

OPEN TASKS (top 10):
${openTasks || '  None.'}

OPEN RISKS:
${openRisks || '  None.'}

Write a brief, friendly check-in summary (3-5 sentences) covering:
1. What the person appears to have been working on based on the activity log
2. Which SOW(s) that maps to (if determinable)
3. Any open tasks or risks that look relevant to what they've been doing
4. One suggested next action or focus area

If there's no meaningful activity yet, acknowledge that and suggest what they should focus on based on the open tasks.

Keep it conversational and practical — this is an internal check-in, not a formal report. You may also include action blocks (create_task, create_risk, etc.) if something in the activity clearly warrants logging.`
}

// ─── POST /api/checkin ────────────────────────────────────────────────────────
// Called by the daemon on the hour. Reads today's activity + project state,
// generates an AI summary, saves it as a checkin ChatThread in appdata.json.
app.http('checkin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'checkin',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!validateDaemonKey(req)) return { status: 401, body: 'Unauthorized' }

    let localTitle: string | undefined
    try { const body = await req.json() as any; localTitle = body?.title } catch { /* no body */ }

    try {
      const svc = getStorageClient()

      // Load project data and today's activity in parallel
      const [rawData, activityRaw] = await Promise.all([
        readBlob(svc, DATA_BLOB),
        readBlob(svc, `activity-log/${todayDate()}.json`),
      ])

      const appData        = rawData      ? JSON.parse(rawData)      : {}
      const activityBatches = activityRaw ? JSON.parse(activityRaw)  : []

      // Generate check-in summary
      const ai       = getAIProvider()
      const prompt   = buildCheckinPrompt(appData, activityBatches)
      const summary  = await ai.complete([
        { role: 'user', content: prompt } as AIMessage,
      ], 600)

      // Build the ChatThread
      const now     = new Date().toISOString()
      const threadId = crypto.randomUUID()
      const thread = {
        id:        threadId,
        type:      'checkin',
        title:     checkinTitle(localTitle),
        createdAt: now,
        updatedAt: now,
        messages: [
          {
            id:        crypto.randomUUID(),
            role:      'assistant',
            content:   summary,
            timestamp: now,
          },
        ],
      }

      // Append thread to appdata.json
      const threads: any[] = appData.threads ?? []
      threads.unshift(thread)        // newest first
      appData.threads    = threads
      appData.lastUpdated = now

      await writeBlob(svc, DATA_BLOB, JSON.stringify(appData))

      return {
        status:  200,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ threadId, title: thread.title }),
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})
