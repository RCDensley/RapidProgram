import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'
import { v4 as uuidv4 } from 'uuid'

const DATA_CONTAINER = 'pmtracking'
const DATA_BLOB      = 'appdata.json'

function getStorageClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(conn)
}

async function readAppData(svc: BlobServiceClient): Promise<any> {
  try {
    const blob = svc.getContainerClient(DATA_CONTAINER).getBlockBlobClient(DATA_BLOB)
    if (!await blob.exists()) return {}
    const dl = await blob.download()
    const chunks: Buffer[] = []
    for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

async function writeAppData(svc: BlobServiceClient, data: any): Promise<void> {
  const body = JSON.stringify({ ...data, lastUpdated: new Date().toISOString() })
  const blob = svc.getContainerClient(DATA_CONTAINER).getBlockBlobClient(DATA_BLOB)
  await svc.getContainerClient(DATA_CONTAINER).createIfNotExists()
  await blob.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: 'application/json' },
  })
}

// ─── POST /api/write ──────────────────────────────────────────────────────────
// Handles AI-suggested create actions for tasks and RAID entries.
// Body: { type: 'create_task' | 'create_risk' | 'create_issue' | 'create_decision', payload: {...} }
app.http('writeAction', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'write',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const body    = await req.json() as { type: string; payload: any }
      const { type, payload } = body

      if (!type || !payload) {
        return { status: 400, body: JSON.stringify({ error: 'Missing type or payload' }) }
      }

      const svc     = getStorageClient()
      const appData = await readAppData(svc)

      switch (type) {

        case 'create_task': {
          const task = {
            id:          uuidv4(),
            title:       payload.title ?? 'Untitled task',
            description: payload.description ?? '',
            sowId:       payload.sowId ?? null,
            bucket:      payload.bucket ?? 'backlog',
            priority:    payload.priority ?? 'medium',
            effort:      payload.effort ?? { value: 1, unit: 'hours' },
            recurrence:  null,
            links:       [],
            comments:    payload.notes ? [{ id: uuidv4(), text: `Created by assistant: ${payload.notes}`, timestamp: new Date().toISOString() }] : [],
            createdAt:   new Date().toISOString(),
            order:       (appData.tasks ?? []).length,
          }
          appData.tasks = [...(appData.tasks ?? []), task]
          await writeAppData(svc, appData)
          return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task) }
        }

        case 'create_risk': {
          const likelihood = Number(payload.likelihood ?? 3)
          const impact     = Number(payload.impact     ?? 3)
          const risk = {
            id:          uuidv4(),
            sowId:       payload.sowId ?? null,
            title:       payload.title ?? 'Untitled risk',
            description: payload.description ?? '',
            likelihood,
            impact,
            status:      'Open',
            owner:       payload.owner ?? '',
            history:     [{ id: uuidv4(), timestamp: new Date().toISOString(), type: 'comment', text: 'Created by assistant' }],
            createdAt:   new Date().toISOString(),
          }
          appData.risks = [...(appData.risks ?? []), risk]
          await writeAppData(svc, appData)
          return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(risk) }
        }

        case 'create_issue': {
          const issue = {
            id:          uuidv4(),
            sowId:       payload.sowId ?? null,
            title:       payload.title ?? 'Untitled issue',
            description: payload.description ?? '',
            impact:      payload.impact ?? 'Medium',
            status:      'Open',
            owner:       payload.owner ?? '',
            createdAt:   new Date().toISOString(),
          }
          appData.issues = [...(appData.issues ?? []), issue]
          await writeAppData(svc, appData)
          return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(issue) }
        }

        case 'create_decision': {
          const decision = {
            id:          uuidv4(),
            sowId:       payload.sowId ?? null,
            title:       payload.title ?? 'Untitled decision',
            description: payload.description ?? '',
            rationale:   payload.rationale ?? '',
            decidedBy:   payload.decidedBy ?? '',
            date:        payload.date ?? new Date().toISOString().slice(0, 10),
          }
          appData.decisions = [...(appData.decisions ?? []), decision]
          await writeAppData(svc, appData)
          return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(decision) }
        }

        case 'refile_file': {
          const { storageName, newFolder, newSowId } = payload
          if (!storageName) return { status: 400, body: JSON.stringify({ error: 'Missing storageName' }) }
          const files = appData.projectFiles ?? []
          const target = files.find((f: any) => f.storageName === storageName || f.name === storageName || f.id === storageName)
          if (!target) return { status: 404, body: JSON.stringify({ error: `File not found: ${storageName}` }) }
          const updated = { ...target, folder: newFolder ?? target.folder, sowId: newSowId !== undefined ? newSowId : target.sowId }
          appData.projectFiles = files.map((f: any) => f.id === target.id ? updated : f)
          await writeAppData(svc, appData)
          return { status: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) }
        }

        default:
          return { status: 400, body: JSON.stringify({ error: `Unknown action type: ${type}` }) }
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})
