import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'
import { validateDaemonKey, ActivityBatch } from '../types/activity'

const CONTAINER = 'pmtracking'

function getStorageClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(conn)
}

function activityBlobName(date: string): string {
  return `activity-log/${date}.json`
}

// ─── POST /api/activity ───────────────────────────────────────────────────────
// Accepts an ActivityBatch from the daemon and appends it to the daily log blob.
app.http('postActivity', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'activity',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!validateDaemonKey(req)) return { status: 401, body: 'Unauthorized' }

    let batch: ActivityBatch
    try {
      batch = await req.json() as ActivityBatch
      if (!batch?.date || !Array.isArray(batch?.entries)) throw new Error('invalid')
    } catch {
      return { status: 400, body: 'Missing or invalid request body' }
    }

    try {
      const svc       = getStorageClient()
      const container = svc.getContainerClient(CONTAINER)
      await container.createIfNotExists()
      const blobName  = activityBlobName(batch.date)
      const blobClient = container.getBlockBlobClient(blobName)

      // Read existing log (or start fresh)
      let existing: ActivityBatch[] = []
      if (await blobClient.exists()) {
        const dl = await blobClient.download()
        const chunks: Buffer[] = []
        for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
        try { existing = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { existing = [] }
      }

      existing.push(batch)
      const body = JSON.stringify(existing)
      await blobClient.upload(body, Buffer.byteLength(body), {
        blobHTTPHeaders: { blobContentType: 'application/json' },
      })

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ok: true, count: existing.reduce((n, b) => n + b.entries.length, 0) }),
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})

// ─── GET /api/activity ────────────────────────────────────────────────────────
// Returns the activity log for a given date (defaults to today).
// Callable by both the daemon (X-Daemon-Key) and the browser (SWA auth).
app.http('getActivity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'activity',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    // Accept daemon key OR an authenticated browser session (SWA handles session cookie)
    const hasDaemonKey = req.headers.get('x-daemon-key') !== null
    if (hasDaemonKey && !validateDaemonKey(req)) return { status: 401, body: 'Unauthorized' }

    const date = req.query.get('date') ?? new Date().toISOString().slice(0, 10)

    try {
      const svc        = getStorageClient()
      const blobClient = svc.getContainerClient(CONTAINER).getBlockBlobClient(activityBlobName(date))

      if (!await blobClient.exists()) {
        return { status: 200, headers: { 'Content-Type': 'application/json' }, body: '[]' }
      }

      const dl = await blobClient.download()
      const chunks: Buffer[] = []
      for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body: Buffer.concat(chunks).toString('utf8') }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})
