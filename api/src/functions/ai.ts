import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'
import { getAIProvider, AIMessage } from '../_lib/providers'

const FILES_CONTAINER = 'pmtracking-files'
const DATA_CONTAINER  = 'pmtracking'
const DATA_BLOB       = 'appdata.json'

function getStorageClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(conn)
}

async function readBlob(svc: BlobServiceClient, container: string, name: string): Promise<string | null> {
  try {
    const blob = svc.getContainerClient(container).getBlockBlobClient(name)
    if (!await blob.exists()) return null
    const dl = await blob.download()
    const chunks: Buffer[] = []
    for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
    return Buffer.concat(chunks).toString('utf8')
  } catch {
    return null
  }
}

async function readBlobRaw(svc: BlobServiceClient, container: string, name: string): Promise<Buffer | null> {
  try {
    const blob = svc.getContainerClient(container).getBlockBlobClient(name)
    if (!await blob.exists()) return null
    const dl = await blob.download()
    const chunks: Buffer[] = []
    for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
    return Buffer.concat(chunks)
  } catch {
    return null
  }
}

// ─── Detect /filename references in a message ─────────────────────────────────
// Matches /some-file.pdf or /path/to/file.docx anywhere in the message text.
function detectFileReferences(text: string): string[] {
  const matches = text.match(/\/[\w\-. /]+\.\w{2,5}/g) ?? []
  return [...new Set(matches.map(m => m.trim().replace(/^\//, '')))]
}

// ─── Build system prompt from project data ────────────────────────────────────
function buildSystemPrompt(appData: any, activityBatches?: any[]): string {
  const sows       = appData.sows ?? []
  const resources  = appData.resources ?? []
  const tasks      = appData.tasks ?? []
  const risks      = appData.risks ?? []
  const issues     = appData.issues ?? []
  const decisions  = appData.decisions ?? []
  const milestones = appData.milestones ?? []
  const files      = appData.projectFiles ?? []

  const today = new Date().toISOString().slice(0, 10)

  const sowSummary = sows.map((s: any) => {
    const budget  = (s.budgetSources ?? []).reduce((t: number, b: any) => t + b.amount, 0)
    const phases  = (s.phases ?? []).map((p: any) => {
      const base = `${p.name}: ${p.startDate} → ${p.endDate}`
      const criteria = (p.criteria ?? []) as { text: string; done: boolean }[]
      if (criteria.length === 0) return base
      const cText = criteria.map(c => `${c.done ? '✓' : '○'} ${c.text}`).join('; ')
      return `${base} [criteria: ${cText}]`
    }).join(', ')
    const sources = (s.budgetSources ?? []).map((b: any) => `${b.label}: $${b.amount.toLocaleString()}`).join(', ')
    return `  - ${s.name} (${s.shortName}) | Status: ${s.status} | Budget: $${budget.toLocaleString()} [${sources}] | ${s.startDate} → ${s.endDate} | Phases: ${phases}`
  }).join('\n')

  const resSummary = resources.map((r: any) =>
    `  - ${r.name} (${r.role}, $${r.hourlyRate}/hr)`
  ).join('\n')

  const taskSummary = tasks.length === 0
    ? '  No tasks yet.'
    : tasks.map((t: any) => {
        const sow = sows.find((s: any) => s.id === t.sowId)
        return `  - [${t.bucket.toUpperCase()}][${t.priority}] ${t.title}${sow ? ` (${sow.shortName})` : ' (Program)'}`
      }).join('\n')

  const riskSummary = risks.length === 0
    ? '  No risks logged.'
    : risks.map((r: any) => {
        const score    = r.likelihood * r.impact
        const residual = Math.max(0, score - (r.mitigationScore ?? 0))
        const sow      = sows.find((s: any) => s.id === r.sowId)
        return `  - [${r.status}] ${r.title} | Score: ${score}${r.mitigationScore ? ` → Residual: ${residual}` : ''} | ${sow ? sow.shortName : 'Program'}`
      }).join('\n')

  const issueSummary = issues.length === 0
    ? '  No issues logged.'
    : issues.map((i: any) => {
        const sow = sows.find((s: any) => s.id === i.sowId)
        return `  - [${i.status}][${i.impact}] ${i.title} | ${sow ? sow.shortName : 'Program'}`
      }).join('\n')

  const decisionSummary = decisions.length === 0
    ? '  No decisions logged.'
    : decisions.map((d: any) => {
        const sow = sows.find((s: any) => s.id === d.sowId)
        return `  - ${d.date}: ${d.title} (by ${d.decidedBy})${sow ? ` | ${sow.shortName}` : ''}`
      }).join('\n')

  const milestoneSummary = milestones.map((m: any) =>
    `  - ${m.date}: ${m.label}`
  ).join('\n')

  const fileSummary = files.length === 0
    ? '  No files uploaded.'
    : files.map((f: any) => {
        const sow = sows.find((s: any) => s.id === f.sowId)
        return `  - name:${f.name} | storageName:${f.storageName} | folder:${f.folder} | sowId:${f.sowId ?? 'null'} | ${sow ? sow.shortName : 'Program'}${f.description ? ` | ${f.description}` : ''}`
      }).join('\n')

  return `You are an intelligent project management assistant for a consulting engagement between Rapid Circle (consultant) and IntoWork Australia (client).
Today's date: ${today}

You have access to live project data. Answer questions accurately and concisely. When referencing budget figures, use Australian dollars. Be direct and practical — this is an operational tool, not a general chat.

If the user references a file with /filename syntax (e.g. /meeting-notes.pdf), its content will be injected into the conversation automatically.

== CREATING ITEMS ==
You can create tasks and RAID log entries on behalf of the user. When it makes sense to do so (e.g. the user says "add a task", "log a risk", "create a decision"), include one or more action blocks in your response using this exact format — a fenced code block with the language tag starting with action:

\`\`\`action:create_task
{
  "title": "Short task title",
  "description": "Optional detail",
  "sowId": "sow-1a",
  "bucket": "this-week",
  "priority": "high",
  "effort": { "value": 2, "unit": "hours" }
}
\`\`\`

\`\`\`action:create_risk
{
  "title": "Risk title",
  "description": "Description",
  "sowId": "sow-3",
  "likelihood": 4,
  "impact": 3,
  "owner": "Chris Densley"
}
\`\`\`

\`\`\`action:create_issue
{
  "title": "Issue title",
  "description": "Description",
  "sowId": "sow-3",
  "impact": "High",
  "owner": "Chris Densley"
}
\`\`\`

\`\`\`action:create_decision
{
  "title": "Decision title",
  "description": "What was decided",
  "rationale": "Why",
  "sowId": null,
  "decidedBy": "Chris Densley",
  "date": "${today}"
}
\`\`\`

Available sowId values: ${sows.map((s: any) => `${s.id} (${s.shortName})`).join(', ')}, or null for program-level.
Buckets: today, this-week, this-month, backlog.
Priority: low, medium, high.
Issue impact: Low, Medium, High, Critical.
Likelihood/impact: 1 (low) to 5 (high).

The user will see a confirmation card and must click to confirm before the item is saved — do not worry about creating duplicates.

== REFILING FILES ==
You can also re-organise files in the file repository. When the user asks you to move, rename folder, or re-classify existing files, use this action:

\`\`\`action:refile_file
{
  "storageName": "<exact storageName value from the FILE REPOSITORY list above>",
  "newFolder": "New Folder/Sub-folder",
  "newSowId": "sow-1a"
}
\`\`\`

The storageName MUST be copied exactly from the FILE REPOSITORY list (the storageName: field). You may omit newSowId to keep the current project assignment. You may suggest multiple refile actions in one response if the user asks to reorganise several files at once.

== PROGRAM OVERVIEW ==
${sowSummary}

== TEAM ==
${resSummary}

== MILESTONES ==
${milestoneSummary}

== TASKS ==
${taskSummary}

== RISKS ==
${riskSummary}

== ISSUES ==
${issueSummary}

== DECISIONS ==
${decisionSummary}

== FILE REPOSITORY ==
${fileSummary}
${buildActivitySection(activityBatches)}
`
}

function buildActivitySection(batches?: any[]): string {
  if (!batches?.length) return ''
  const lines: string[] = []
  for (const batch of batches) {
    for (const e of (batch.entries ?? [])) {
      const t = String(e.timestamp ?? '').slice(11, 16)
      if (e.type === 'app_focus') {
        const mins = Math.round((e.durationSeconds ?? 0) / 60)
        lines.push(`  ${t}  ${e.appName ?? 'App'} — ${e.windowTitle ?? ''} (${mins} min)`)
      } else if (e.type === 'audio_transcript' && e.transcript) {
        lines.push(`  ${t}  [Transcript] ${e.transcript}`)
      } else if (e.type === 'screen_context' && e.screenTags) {
        lines.push(`  ${t}  [Screen] ${e.screenTags}`)
      }
    }
  }
  if (!lines.length) return ''
  return `\n== TODAY'S ACTIVITY LOG ==\n${lines.join('\n')}`
}

// ─── POST /api/ai ─────────────────────────────────────────────────────────────
app.http('aiChat', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const body = await req.json() as { messages: { role: string; content: string }[] }
      const incomingMessages = body.messages ?? []

      if (incomingMessages.length === 0) {
        return { status: 400, body: JSON.stringify({ error: 'No messages provided' }) }
      }

      const svc     = getStorageClient()
      const rawData = await readBlob(svc, DATA_CONTAINER, DATA_BLOB)
      const appData = rawData ? JSON.parse(rawData) : {}

      // Read today's activity log (if any) and inject into system prompt
      const todayDate   = new Date().toISOString().slice(0, 10)
      const activityRaw = await readBlob(svc, DATA_CONTAINER, `activity-log/${todayDate}.json`)
      const activityLog = activityRaw ? JSON.parse(activityRaw) : []

      // Build system prompt from live project data + today's activity
      const systemPrompt = buildSystemPrompt(appData, activityLog)

      // Detect /filename references in the last user message
      const lastUserMsg   = [...incomingMessages].reverse().find(m => m.role === 'user')
      const fileRefs      = lastUserMsg ? detectFileReferences(lastUserMsg.content) : []
      let fileContext     = ''
      const imageBlocks: any[] = []

      if (fileRefs.length > 0) {
        const projectFiles: any[] = appData.projectFiles ?? []
        const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']

        for (const ref of fileRefs) {
          const match = projectFiles.find((f: any) =>
            f.name.toLowerCase() === ref.toLowerCase() ||
            f.name.toLowerCase().includes(ref.toLowerCase())
          )

          if (!match) continue

          if (IMAGE_TYPES.includes(match.mimeType)) {
            // Vision: read binary, encode as base64, attach as an image block
            const rawContent = await readBlobRaw(svc, FILES_CONTAINER, match.storageName)
            if (rawContent) {
              const base64     = rawContent.toString('base64')
              const dataUrl    = `data:${match.mimeType};base64,${base64}`
              imageBlocks.push({
                type:      'input_image',
                image_url: dataUrl,
              })
              fileContext += `\n[Image attached: ${match.name} — ${match.description ?? 'no description'}]`
            }
          } else {
            // Text file: inject content directly
            const content = await readBlob(svc, FILES_CONTAINER, match.storageName)
            if (content) {
              fileContext += `\n\n== FILE: ${match.name} ==\n${content.slice(0, 8000)}`
            }
          }
        }
      }

      // Assemble messages — if images were referenced, the last user message
      // becomes a structured content array with text + image blocks.
      const messages: AIMessage[] = [
        { role: 'system', content: systemPrompt + (fileContext ? `\n\n== REFERENCED FILE CONTENT ==${fileContext}` : '') },
        ...incomingMessages.map((m, idx) => {
          const isLastUser = m.role === 'user' && idx === incomingMessages.length - 1
          if (isLastUser && imageBlocks.length > 0) {
            // Structured content: text block + image blocks
            return {
              role: 'user' as const,
              content: [
                { type: 'input_text', text: m.content },
                ...imageBlocks,
              ] as any,
            }
          }
          return {
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }
        }),
      ]

      // Stream response back as SSE
      const encoder = new TextEncoder()
      let streamError: Error | null = null

      const readable = new ReadableStream({
        async start(controller) {
          try {
            const ai = getAIProvider()
            await ai.stream(
              messages,
              (delta) => {
                const sseData = `data: ${JSON.stringify({ delta })}\n\n`
                controller.enqueue(encoder.encode(sseData))
              },
            )
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          } catch (e: any) {
            streamError = e
            const errData = `data: ${JSON.stringify({ error: e.message })}\n\n`
            controller.enqueue(encoder.encode(errData))
          } finally {
            controller.close()
          }
        },
      })

      return {
        status: 200,
        headers: {
          'Content-Type':  'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection':    'keep-alive',
        },
        body: readable,
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})
