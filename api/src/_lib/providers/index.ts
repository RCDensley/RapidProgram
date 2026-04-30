// ─── AI Provider interface ────────────────────────────────────────────────────
// Everything outside this folder calls AIProvider — nothing imports Foundry directly.

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AIProvider {
  /**
   * Non-streaming completion — returns the full response text.
   */
  complete(messages: AIMessage[], maxTokens?: number): Promise<string>

  /**
   * Streaming completion — calls onChunk with each text delta,
   * resolves when the response is complete.
   */
  stream(
    messages: AIMessage[],
    onChunk: (delta: string) => void,
    maxTokens?: number,
  ): Promise<void>
}

export { getFoundryProvider as getAIProvider } from './foundry'
