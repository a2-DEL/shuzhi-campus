/** Incremental SSE decoder for DeepSeek's OpenAI-compatible chat stream. */
export interface DeepSeekStreamChunk {
  id?: string
  model?: string
  choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; prompt_cache_hit_tokens?: number }
  error?: { message?: string }
}

export async function* decodeDeepSeekEvents(stream: ReadableStream<Uint8Array>): AsyncGenerator<DeepSeekStreamChunk> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let done = false
  try {
    while (true) {
      const item = await reader.read()
      buffer += decoder.decode(item.value, { stream: !item.done })
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.length > 1_000_000) throw new Error('Model stream event exceeded size limit')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary).replace(/\r/g, '')
        buffer = buffer.slice(boundary + 2)
        const data = event.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
        if (!data) continue
        if (data === '[DONE]') { done = true; break }
        yield JSON.parse(data) as DeepSeekStreamChunk
      }
      if (done || item.done) break
      // Proxies may use CRLF; normalize line endings before searching for boundaries.
      buffer = buffer.replace(/\r\n/g, '\n')
    }
    if (!done) throw new Error('Model stream closed without terminal marker')
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}
