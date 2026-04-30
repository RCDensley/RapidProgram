/**
 * Azure AI Foundry Responses API provider.
 *
 * Supports both text-only and multimodal (vision) messages.
 * When a message's content is an array of blocks, it is sent as a
 * structured content array supporting input_text and input_image blocks.
 */

import { AIProvider, AIMessage } from './index'

const DEFAULT_API_VERSION = '2025-04-01-preview'

function getConfig() {
  const endpoint   = process.env.FOUNDRY_ENDPOINT
  const key        = process.env.FOUNDRY_KEY ?? process.env.FOUNDRY_API_KEY
  const deployment = process.env.FOUNDRY_DEPLOYMENT
  const apiVersion = process.env.FOUNDRY_API_VERSION ?? DEFAULT_API_VERSION

  if (!endpoint || !key || !deployment) {
    throw new Error(
      'Missing Foundry config. Set FOUNDRY_ENDPOINT, FOUNDRY_KEY, and FOUNDRY_DEPLOYMENT.'
    )
  }

  const url = `${endpoint.replace(/\/$/, '')}/openai/responses?api-version=${apiVersion}`
  return { url, key, deployment }
}

/**
 * Convert an AIMessage content value to a Foundry content block array.
 * Strings become a single input_text block.
 * Arrays are passed through as-is (already structured content blocks).
 */
function toContentBlocks(content: string | any[]): any[] {
  if (typeof content === 'string') {
    return [{ type: 'input_text', text: content }]
  }
  return content
}

function buildBody(messages: AIMessage[], deployment: string, maxTokens: number, stream: boolean) {
  const systemMsg = messages.find(m => m.role === 'system')
  const turns     = messages.filter(m => m.role !== 'system')

  return {
    model:             deployment,
    instructions:      systemMsg?.content ?? undefined,
    input:             turns.map(m => ({
      role:    m.role,
      // If content is a string with no vision blocks, send as plain string for efficiency.
      // If content is an array (vision blocks present), send as structured content array.
      content: Array.isArray(m.content)
        ? toContentBlocks(m.content)
        : m.content,
    })),
    max_output_tokens: maxTokens,
    stream,
  }
}

// ─── Non-streaming ────────────────────────────────────────────────────────────
async function complete(messages: AIMessage[], maxTokens = 4096): Promise<string> {
  const { url, key, deployment } = getConfig()

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(buildBody(messages, deployment, maxTokens, false)),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Foundry error ${res.status}: ${err}`)
  }

  const data = await res.json() as any

  const text = (data.output ?? [])
    .filter((b: any) => b.type === 'message')
    .flatMap((b: any) => b.content ?? [])
    .filter((c: any) => c.type === 'output_text')
    .map((c: any) => c.text ?? '')
    .join('')

  return text
}

// ─── Streaming ────────────────────────────────────────────────────────────────
async function stream(
  messages: AIMessage[],
  onChunk: (delta: string) => void,
  maxTokens = 4096,
): Promise<void> {
  const { url, key, deployment } = getConfig()

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': key },
    body: JSON.stringify(buildBody(messages, deployment, maxTokens, true)),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Foundry stream error ${res.status}: ${err}`)
  }

  if (!res.body) throw new Error('No response body for streaming')

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer    = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        if (json.type === 'response.output_text.delta') {
          const delta = json.delta ?? ''
          if (delta) onChunk(delta)
          continue
        }
        if (json.type === 'response.completed') return
      } catch {
        // Ignore malformed lines
      }
    }
  }
}

export const getFoundryProvider = (): AIProvider => ({ complete, stream })
