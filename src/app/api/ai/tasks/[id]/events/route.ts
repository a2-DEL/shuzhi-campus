import { NextRequest } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getAccessibleAiTask } from '@/lib/ai/runtime/orchestrator'
import { isTerminalAiTaskState } from '@/lib/ai/runtime/task-terminal'
import { toAiProductTask } from '@/lib/ai/product-view'
import type { AiTaskRecord } from '@/lib/ai/runtime/types'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const POLL_INTERVAL_MS = 240
const CONNECTION_LIFETIME_MS = 110_000
const MAX_EVENT_BATCH = 100

interface PersistedTaskEventRow {
  id: string
  event_type: string
  created_at: string
  version: number
  task_snapshot: unknown
}

function encodeEvent(encoder: TextEncoder, name: string, id: string, payload: unknown): Uint8Array {
  return encoder.encode(`id: ${id}\nevent: ${name}\ndata: ${JSON.stringify(payload)}\n\n`)
}

function sleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, milliseconds)
    signal.addEventListener('abort', () => { clearTimeout(timer); resolve() }, { once: true })
  })
}

function taskRecord(value: unknown): AiTaskRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<AiTaskRecord>
  return typeof candidate.id === 'string' && typeof candidate.version === 'number' && typeof candidate.state === 'string'
    ? candidate as AiTaskRecord
    : null
}

async function readPersistedEvents(taskId: string, schoolId: string, afterVersion: number): Promise<PersistedTaskEventRow[]> {
  if (!hasPostgresDatabaseUrl()) return []
  const result = await getPostgresPool().query<PersistedTaskEventRow>(
    `SELECT
       id::text,
       event_type,
       created_at::text,
       CASE WHEN COALESCE(payload#>>'{task,version}','') ~ '^[0-9]+$'
         THEN (payload#>>'{task,version}')::int ELSE -1 END AS version,
       payload->'task' AS task_snapshot
     FROM ai_outbox_events
     WHERE school_id=$1::uuid
       AND aggregate_type='ai_task_run'
       AND aggregate_id=$2
       AND CASE WHEN COALESCE(payload#>>'{task,version}','') ~ '^[0-9]+$'
         THEN (payload#>>'{task,version}')::int ELSE -1 END > $3
     ORDER BY created_at,id
     LIMIT $4`,
    [schoolId, taskId, afterVersion, MAX_EVENT_BATCH],
  )
  return result.rows
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getAuthUser(request)
  if (!user) return Response.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const { id } = await params
  let initialTask: AiTaskRecord
  try {
    initialTask = await getAccessibleAiTask(user, id)
  } catch {
    return Response.json({ success: false, error: 'Task not found or inaccessible', code: 'TASK_ACCESS_DENIED' }, { status: 404 })
  }
  if (!initialTask.schoolId) return Response.json({ success: false, error: 'Task tenant binding is missing', code: 'TASK_TENANT_MISSING' }, { status: 409 })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      let lastVersion = -1
      let lastMessageCount = 0
      let lastNodeFingerprint = ''
      let lastHeartbeatAt = 0
      const startedAt = Date.now()

      const close = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch { /* connection already closed */ }
      }
      request.signal.addEventListener('abort', close, { once: true })

      const emitSnapshot = (record: AiTaskRecord, eventType: string, emittedAt: string, eventId: string) => {
        const task = toAiProductTask(record)
        const previousMessageCount = lastVersion < 0 ? 0 : lastMessageCount
        controller.enqueue(encodeEvent(encoder, 'task.snapshot', `${task.id}:${task.version}:${eventId}`, {
          sequence: task.version,
          emittedAt,
          eventType,
          persistedEventId: eventId,
          task,
          delta: {
            messages: task.messages.slice(previousMessageCount),
            nodes: task.nodes.map((node) => ({ id: node.id, state: node.state, effectStatus: node.effect?.status })),
          },
        }))
        lastVersion = task.version
        lastMessageCount = task.messages.length
        lastNodeFingerprint = task.nodes.map((node) => `${node.id}:${node.state}:${node.effect?.status ?? ''}`).join('|')
        return task
      }

      const run = async () => {
        try {
          controller.enqueue(encoder.encode('retry: 1000\n\n'))
          while (!closed && !request.signal.aborted && Date.now() - startedAt < CONNECTION_LIFETIME_MS) {
            let emitted = false
            let terminalTask: ReturnType<typeof toAiProductTask> | null = null

            const persisted = await readPersistedEvents(id, initialTask.schoolId!, lastVersion)
            for (const row of persisted) {
              const record = taskRecord(row.task_snapshot)
              if (!record || record.id !== id || record.schoolId !== initialTask.schoolId) continue
              const task = emitSnapshot(record, row.event_type, row.created_at, row.id)
              emitted = true
              if (isTerminalAiTaskState(task.state)) terminalTask = task
            }

            if (!emitted) {
              const record = await getAccessibleAiTask(user, id)
              const task = toAiProductTask(record)
              const nodeFingerprint = task.nodes.map((node) => `${node.id}:${node.state}:${node.effect?.status ?? ''}`).join('|')
              const changed = task.version > lastVersion || task.messages.length !== lastMessageCount || nodeFingerprint !== lastNodeFingerprint
              if (changed) {
                const snapshot = emitSnapshot(record, task.timeline.at(-1)?.reason ?? 'task.snapshot', new Date().toISOString(), `fallback-${task.version}`)
                if (isTerminalAiTaskState(snapshot.state)) terminalTask = snapshot
                emitted = true
              }
            }

            if (terminalTask) {
              controller.enqueue(encodeEvent(encoder, 'task.terminal', `${terminalTask.id}:${terminalTask.version}:terminal`, {
                sequence: terminalTask.version,
                state: terminalTask.state,
                emittedAt: new Date().toISOString(),
              }))
              await sleep(120, request.signal)
              close()
              return
            }

            if (!emitted && Date.now() - lastHeartbeatAt >= 10_000) {
              lastHeartbeatAt = Date.now()
              controller.enqueue(encodeEvent(encoder, 'heartbeat', `${id}:heartbeat:${lastHeartbeatAt}`, {
                emittedAt: new Date(lastHeartbeatAt).toISOString(), sequence: lastVersion,
              }))
            }
            await sleep(POLL_INTERVAL_MS, request.signal)
          }
        } catch (error) {
          if (!closed) {
            controller.enqueue(encodeEvent(encoder, 'task.error', `${id}:error:${Date.now()}`, {
              code: 'TASK_EVENT_STREAM_FAILED',
              message: error instanceof Error ? error.message : '\u4efb\u52a1\u4e8b\u4ef6\u6d41\u4e2d\u65ad',
              emittedAt: new Date().toISOString(),
            }))
          }
        } finally {
          close()
        }
      }
      void run()
    },
    cancel() { /* request.signal closes the producer loop */ },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
