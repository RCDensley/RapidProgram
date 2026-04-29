import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'

const CONTAINER = 'pmtracking'
const BLOB_NAME  = 'appdata.json'

function getBlobClient() {
  const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connStr) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  const svc = BlobServiceClient.fromConnectionString(connStr)
  return svc.getContainerClient(CONTAINER).getBlockBlobClient(BLOB_NAME)
}

// GET /api/data
app.http('getData', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'data',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const blob = getBlobClient()
      const exists = await blob.exists()
      if (!exists) return { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{}' }
      const dl = await blob.download()
      const chunks: Buffer[] = []
      for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
      const body = Buffer.concat(chunks).toString('utf8')
      return { status: 200, headers: { 'Content-Type': 'application/json' }, body }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})

// POST /api/data
app.http('saveData', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'data',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const body = await req.text()
      const blob = getBlobClient()
      const svcForCreate = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING!)
      await svcForCreate.getContainerClient(CONTAINER).createIfNotExists()
      await blob.upload(body, Buffer.byteLength(body), {
        blobHTTPHeaders: { blobContentType: 'application/json' },
      })
      return { status: 200, body: JSON.stringify({ ok: true }) }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})
