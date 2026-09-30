import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { User } from '@/types'
import { getAuthUser } from '@/lib/auth'
import { AiPlanningError } from '@/lib/ai/runtime/planner'
import { AiRuntimeError } from '@/lib/ai/runtime/orchestrator'
import {
  BaizeAssistantError,
  type BaizeProgressCallbacks,
  handleBaizeRequest,
  summarizeBaizeTasks,
} from '@/lib/ai/assistant/engine'
import { toAiProductTask } from '@/lib/ai/product-view'
import { MAX_BAIZE_HISTORY_TURNS } from '@/lib/ai/assistant/conversation'
import { createBaizeConversation, getBaizeConversation, listBaizeMessages, appendBaizeMessage, loadBaizeEntities, rememberVerifiedEntity, summarizeBaizeConversation, BaizeMemoryError } from '@/lib/ai/assistant/memory'
import { BaizeExecutionError } from '@/lib/ai/assistant/tools/executor'
import { BaizeToolError } from '@/lib/ai/assistant/tools/registry'
import { assertBaizeInputSafe, enforceBaizeRateLimit, reviewBaizeOutput, isBaizeModelCircuitOpen, BaizeGuardError } from '@/lib/ai/assistant/guardrails'
import { recordBaizeSafetyEvent } from '@/lib/ai/assistant/safety-audit'

const workflowStepSchema = z.object({ skillId: z.string().trim().min(1).max(100), params: z.record(z.string(), z.unknown()).optional(), title: z.string().trim().max(255).optional(), dependsOn: z.array(z.string().trim().max(128)).max(8).optional() })

const requestSchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  conversationId: z.string().uuid().optional(),
  mode: z.enum(['auto', 'ask', 'dispatch']).default('auto'),
  skillId: z.string().trim().min(1).max(100).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  workflow: z.array(workflowStepSchema).max(7).optional(),
  history: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(500) }).strict()).max(MAX_BAIZE_HISTORY_TURNS).optional(),
})

function failure(error: unknown): NextResponse {
  if (error instanceof BaizeExecutionError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'STEP_LIMIT' ? 400 : 503 })
  if (error instanceof BaizeToolError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID' ? 400 : error.code === 'NOT_FOUND' ? 404 : 503 })
  if (error instanceof BaizeMemoryError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'NOT_FOUND' ? 404 : 503, headers: { 'Cache-Control': 'no-store' } })
  if (error instanceof BaizeGuardError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'CONTENT_BLOCKED' ? 400 : 429, headers: { 'Cache-Control': 'no-store' } })
  if (error instanceof AiPlanningError) {
    const status = error.code === 'PERMISSION_DENIED' ? 403 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  if (error instanceof AiRuntimeError) {
    const status = error.code === 'TASK_ACCESS_DENIED' ? 403 : error.code === 'TASK_NOT_FOUND' ? 404 : 409
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  if (error instanceof BaizeAssistantError) {
    const status = error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403
      : error.code === 'TENANT_REQUIRED' ? 409
        : error.code === 'BACKEND_UNAVAILABLE' ? 503
          : error.code === 'INVALID_REQUEST' ? 400
            : 401
    return NextResponse.json(
      { success: false, error: error.message, code: error.code },
      { status, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  console.error('Baize assistant request failed', error)
  return NextResponse.json(
    { success: false, error: '白泽暂时无法完成请求，请稍后重试', code: 'BAIZE_ASSISTANT_FAILED' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  )
}

type AssistantRequest = z.infer<typeof requestSchema>

async function executeAssistant(request: NextRequest, user: User, data: AssistantRequest, messageId: string, progress?: BaizeProgressCallbacks, onConversation?: (id: string) => void) {
  const conversation = data.conversationId
    ? await getBaizeConversation(user, data.conversationId)
    : await createBaizeConversation(user)
  onConversation?.(conversation.id)
  const recent = data.conversationId ? await listBaizeMessages(user, conversation.id, 20) : []
  const entities = await loadBaizeEntities(user)
  const priorDraft = [...recent].reverse().find((item) => item.toolSnapshot.applicationDraft)?.toolSnapshot.applicationDraft
  const draft = priorDraft && typeof priorDraft === 'object' && (priorDraft as Record<string, unknown>).type === 'repair'
    ? { type: 'repair' as const, description: typeof (priorDraft as Record<string, unknown>).description === 'string' ? String((priorDraft as Record<string, unknown>).description).slice(0, 500) : undefined,
      location: typeof (priorDraft as Record<string, unknown>).location === 'string' ? String((priorDraft as Record<string, unknown>).location).slice(0, 120) : undefined }
    : undefined
  const priorKeys = [...recent].reverse().find((item) => Array.isArray(item.toolSnapshot.recordKeys))?.toolSnapshot.recordKeys
  const referencesPrevious = /(?:上次|之前|上回|那个|那条)/.test(data.message) && /(?:报修|工单|维修)/.test(data.message)
  const rememberedRepairs = entities.filter((entity) => entity.type === 'repair')
  const ambiguousMemory = referencesPrevious && !priorKeys && rememberedRepairs.length > 1
  const verifiedId = /(?:第一个|第一条|它的|详情|这条)/.test(data.message) && Array.isArray(priorKeys) && typeof priorKeys[0] === 'string'
    ? String(priorKeys[0]).slice(0, 120) : referencesPrevious && rememberedRepairs.length === 1 ? rememberedRepairs[0].key : undefined
  const history = data.conversationId
    ? recent.map(({ role, content }) => ({ role, content: content.slice(0, 950) }))
    : data.history ?? [] // Legacy client history is only a routing hint, never an authorization source.
  const context = [
    ...(conversation.summary ? [{ role: 'assistant' as const, content: `历史结构化摘要（非实时业务数据）：${conversation.summary}` }] : []),
    ...history.slice(-16),
    ...(entities.length ? [{ role: 'assistant' as const, content: `已核验的历史记录索引（状态可能过期，查询时必须重新鉴权）：${entities.map((entity) => `${entity.type}:${entity.key}`).join('，')}` }] : []),
  ]
  const userMessage = await appendBaizeMessage(user, conversation.id, { role: 'user', content: data.message })
  const result = await handleBaizeRequest(user, { ...data, conversationId: conversation.id, queryMessageId: userMessage.id, history: context, draft, verifiedId, ambiguousMemory }, request, progress)
  const reviewed = reviewBaizeOutput(result.message, result.sources.length > 0)
  if (reviewed.reason) await recordBaizeSafetyEvent(user, 'OUTPUT', reviewed.reason, result.message, conversation.id)
  result.message = reviewed.text
  if (user.school_id && await isBaizeModelCircuitOpen(user.school_id) && result.kind === 'clarify') {
    result.message = `当前智能助手运行于基础模式，复杂语义理解可能受限。\n${result.message}`
    result.code = 'BAIZE_BASIC_MODE'
  }
  await appendBaizeMessage(user, conversation.id, { role: 'assistant', content: result.message }, {
    id: messageId, inputTokens: result.model?.inputTokens, outputTokens: result.model?.outputTokens, modelVersion: result.model?.model,
    toolSnapshot: { domain: result.answer?.domain, count: result.answer?.total, toolCalls: result.toolCalls, phases: result.toolPhases, recordKeys: result.verifiedEntities?.map((entity) => entity.key), modelInvocationId: result.model?.invocationId, applicationDraft: result.application ? { type: result.application.type, description: result.application.description, location: result.application.location } : undefined },
  })
  for (const entity of result.verifiedEntities ?? []) {
    if (['repair', 'dormitory', 'classroom', 'lost_found', 'duty', 'visitor', 'energy'].includes(entity.type)) {
      await rememberVerifiedEntity(user, conversation.id, entity as Parameters<typeof rememberVerifiedEntity>[2])
    }
  }
  await summarizeBaizeConversation(user, conversation.id).catch(() => console.warn('Baize summary unavailable'))
  return { ...result, verifiedEntities: undefined, messageId, conversationId: conversation.id,
    task: result.task ? toAiProductTask(result.task) : undefined }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  let data: AssistantRequest
  try {
    let body: unknown
    try { body = await request.json() }
    catch { return NextResponse.json({ success: false, error: 'Invalid JSON body', code: 'INVALID_BAIZE_REQUEST' }, { status: 400 }) }
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid Baize request', code: 'INVALID_BAIZE_REQUEST', details: parsed.error.flatten() }, { status: 400 })
    data = parsed.data
    await enforceBaizeRateLimit(user)
    try { assertBaizeInputSafe(data.message) }
    catch (error) {
      if (error instanceof BaizeGuardError) await recordBaizeSafetyEvent(user, 'INPUT', error.reason ?? error.code, data.message)
      throw error
    }
  } catch (error) { return failure(error) }
  const messageId = randomUUID()
  if (!request.headers.get('accept')?.includes('text/event-stream')) {
    try { return NextResponse.json({ success: true, data: await executeAssistant(request, user, data, messageId) }, { headers: { 'Cache-Control': 'no-store' } }) }
    catch (error) { return failure(error) }
  }
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let sent = ''
      let released = ''
      let open = true
      const emit = (event: string, value: unknown) => {
        if (open) try { controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`)) } catch { open = false }
      }
      emit('start', { messageId })
      void (async () => {
        try {
          const result = await executeAssistant(request, user, data, messageId, {
            onPhase: (phase) => emit('phase', phase),
            onModelDelta: (delta) => {
              // Hold back the trailing fragment, then review cumulative output before releasing any prefix.
              const next = sent + delta
              const checked = reviewBaizeOutput(next, false)
              if (checked.reason || checked.text !== next) { sent = next; return }
              const safeLength = Math.max(0, next.length - 48)
              const safePrefix = next.slice(0, safeLength)
              if (safePrefix.startsWith(released) && safePrefix.length > released.length) {
                emit('delta', { messageId, text: safePrefix.slice(released.length) })
                released = safePrefix
              }
              sent = next
            },
          }, (id) => emit('conversation', { messageId, conversationId: id }))
          // The authoritative final text is emitted only after the message is committed to PostgreSQL.
          emit('done', { success: true, data: result })
        } catch (error) {
          const response = failure(error)
          const payload = await response.json() as { error?: string; code?: string }
          emit('error', { messageId, error: payload.error ?? '回复中断，请重试', code: payload.code ?? 'STREAM_INTERRUPTED' })
        } finally { open = false; controller.close() }
      })()
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' } })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const result = await summarizeBaizeTasks(user)
    return NextResponse.json({ success: true, data: result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    return failure(error)
  }
}
