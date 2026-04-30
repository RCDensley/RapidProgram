import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { BlobServiceClient } from '@azure/storage-blob'
import { v4 as uuidv4 } from 'uuid'
import { getAIProvider } from '../_lib/providers'

const FILES_CONTAINER = 'pmtracking-files'
const DATA_CONTAINER  = 'pmtracking'
const DATA_BLOB       = 'appdata.json'

function getStorageClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) throw new Error('AZURE_STORAGE_CONNECTION_STRING not set')
  return BlobServiceClient.fromConnectionString(conn)
}

async function readAppData(svc: BlobServiceClient): Promise<any> {
  try {
    const blob = svc.getContainerClient(DATA_CONTAINER).getBlockBlobClient(DATA_BLOB)
    if (!await blob.exists()) return { projectFiles: [] }
    const dl = await blob.download()
    const chunks: Buffer[] = []
    for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return { projectFiles: [] }
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

async function ensureFilesContainer(svc: BlobServiceClient): Promise<void> {
  await svc.getContainerClient(FILES_CONTAINER).createIfNotExists()
}

async function classifyFile(
  filename: string,
  textPreview: string,
  sows: { id: string; name: string; shortName: string }[],
): Promise<{ sowId: string | null; folder: string; description: string }> {
  try {
    const ai      = getAIProvider()
    const sowList = sows.map(s => `- ${s.id}: ${s.name}`).join('\n')
    const prompt  = `You are a document classifier for a consulting project management tool.

Available projects (SOW IDs and names):
${sowList}

File name: "${filename}"
File preview (first 500 chars):
${textPreview.slice(0, 500)}

Respond with ONLY a JSON object (no markdown, no explanation):
{
  "sowId": "<matching SOW id from the list above, or null if program-level>",
  "folder": "<suggested folder path e.g. 'Purview/Meeting Notes' or 'Program/Contracts'>",
  "description": "<one-line description of what this document contains>"
}`
    const result = await ai.complete([{ role: 'user', content: prompt }], 256)
    const clean  = result.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { sowId: null, folder: 'Uncategorised', description: filename }
  }
}

function extractTextPreview(buffer: Buffer, mimeType: string): string {
  if (mimeType.startsWith('text/') || mimeType === 'application/json') {
    return buffer.toString('utf8').slice(0, 500)
  }
  return ''
}

// ─── GET /api/files ───────────────────────────────────────────────────────────
app.http('listFiles', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files',
  handler: async (_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const svc  = getStorageClient()
      const data = await readAppData(svc)
      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data.projectFiles ?? []),
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})

// ─── POST /api/files ──────────────────────────────────────────────────────────
app.http('uploadFile', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'files',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const svc = getStorageClient()
      await ensureFilesContainer(svc)

      let formData: FormData
      try {
        formData = await req.formData()
      } catch (e: any) {
        return { status: 400, body: JSON.stringify({ error: `Could not parse form data: ${e.message}` }) }
      }

      const filePart = formData.get('file')
      if (!filePart || typeof filePart === 'string') {
        return { status: 400, body: JSON.stringify({ error: 'No file field in form data' }) }
      }

      const file         = filePart as File
      const originalName = file.name ?? 'upload'
      const mimeType     = file.type || 'application/octet-stream'
      const arrayBuf     = await file.arrayBuffer()
      const fileBuffer   = Buffer.from(arrayBuf)
      const storageName  = `${uuidv4()}-${originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const fileBlob = svc.getContainerClient(FILES_CONTAINER).getBlockBlobClient(storageName)
      await fileBlob.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: { blobContentType: mimeType },
      })

      const appData        = await readAppData(svc)
      const textPreview    = extractTextPreview(fileBuffer, mimeType)
      const classification = await classifyFile(originalName, textPreview, appData.sows ?? [])

      const projectFile = {
        id:                   uuidv4(),
        name:                 originalName,
        storageName,
        sowId:                classification.sowId,
        folder:               classification.folder,
        size:                 fileBuffer.length,
        uploadedAt:           new Date().toISOString(),
        classifiedAt:         new Date().toISOString(),
        mimeType,
        description:          classification.description,
        classificationStatus: 'classified' as const,
      }

      const existingFiles = appData.projectFiles ?? []
      await writeAppData(svc, { ...appData, projectFiles: [...existingFiles, projectFile] })

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectFile),
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})

// ─── DELETE /api/files/{storageName} ─────────────────────────────────────────
app.http('deleteFile', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'files/{storageName}',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const storageName = req.params.storageName
      if (!storageName) return { status: 400, body: JSON.stringify({ error: 'Missing storageName' }) }

      const svc      = getStorageClient()
      const fileBlob = svc.getContainerClient(FILES_CONTAINER).getBlockBlobClient(storageName)
      if (await fileBlob.exists()) await fileBlob.delete()

      const appData = await readAppData(svc)
      const updated = (appData.projectFiles ?? []).filter((f: any) => f.storageName !== storageName)
      await writeAppData(svc, { ...appData, projectFiles: updated })

      return { status: 200, body: JSON.stringify({ ok: true }) }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})

// ─── GET /api/files/{storageName}/content ────────────────────────────────────
// Returns raw binary with the file's actual MIME type.
// The frontend fetches as ArrayBuffer and uses the appropriate library to render.
app.http('getFileContent', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'files/{storageName}/content',
  handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
    try {
      const storageName = req.params.storageName
      const svc  = getStorageClient()
      const blob = svc.getContainerClient(FILES_CONTAINER).getBlockBlobClient(storageName)

      if (!await blob.exists()) {
        return { status: 404, body: JSON.stringify({ error: 'File not found' }) }
      }

      const props    = await blob.getProperties()
      const mimeType = props.contentType ?? 'application/octet-stream'

      const dl = await blob.download()
      const chunks: Buffer[] = []
      for await (const chunk of dl.readableStreamBody as any) chunks.push(chunk)
      const buffer = Buffer.concat(chunks)

      return {
        status: 200,
        headers: {
          'Content-Type':        mimeType,
          'Content-Disposition': `inline; filename="${storageName}"`,
          'Cache-Control':       'private, max-age=3600',
        },
        body: buffer,
      }
    } catch (e: any) {
      return { status: 500, body: JSON.stringify({ error: e.message }) }
    }
  },
})
