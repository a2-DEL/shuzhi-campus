export interface BaizeStreamEvent {
  event: 'start' | 'conversation' | 'phase' | 'delta' | 'done' | 'error'
  data: Record<string, unknown>
}

/** Parses fragmented fetch SSE events. A missing terminal event is a transport failure, never a successful answer. */
export async function readBaizeStream(response: Response, onEvent: (event: BaizeStreamEvent) => void): Promise<void> {
  if (!response.body) throw new Error('回复流不可用，请重试')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminal = false
  try {
    while (true) {
      const item = await reader.read()
      buffer += decoder.decode(item.value, { stream: !item.done })
      buffer = buffer.replace(/\r\n/g, '\n')
      if (buffer.length > 1_000_000) throw new Error('回复数据超出上限')
      let boundary: number
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const frame = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        const event = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim()
        const raw = frame.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n')
        if (!raw || !['start', 'conversation', 'phase', 'delta', 'done', 'error'].includes(event ?? '')) continue
        const data = JSON.parse(raw) as Record<string, unknown>
        onEvent({ event: event as BaizeStreamEvent['event'], data })
        if (event === 'done') terminal = true
        if (event === 'error') throw new Error(typeof data.error === 'string' ? data.error : '回复中断，请重试')
      }
      if (item.done) break
    }
    if (!terminal) throw new Error('回复中断，请重试')
  } finally { reader.releaseLock() }
}
