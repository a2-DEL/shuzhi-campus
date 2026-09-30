import { createHash, randomUUID } from 'node:crypto'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { loadEnv } from '@/storage/database/supabase-client'
import { decodeDeepSeekEvents } from './stream'
import { isBaizeModelCircuitOpen, recordBaizeModelOutcome } from '@/lib/ai/assistant/guardrails'

export type GovernedModelRouteMode = 'external_preferred' | 'hybrid_fail_closed'
export type GovernedModelPurpose = 'assistant.answer' | 'assistant.clarification' | 'assistant.classification' | 'task.intent' | 'task.summary' | 'operations.probe' | 'knowledge.graph_extract' | 'knowledge.answer'

export interface GovernedModelMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GovernedModelRequest {
  schoolId: string
  userId?: string
  taskId?: string
  conversationId?: string
  toolCallCount?: number
  nodeId?: string
  purpose: GovernedModelPurpose
  systemPrompt: string
  messages: GovernedModelMessage[]
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  signal?: AbortSignal
}

export interface GovernedModelUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cacheHitTokens: number
  estimatedCostCents?: number
}

export interface GovernedModelResult {
  invocationId: string
  traceId: string
  provider: 'deepseek'
  model: string
  content: string
  finishReason?: string
  providerRequestId?: string
  latencyMs: number
  usage: GovernedModelUsage
}

export interface ModelUsageSnapshot {
  callsToday: number
  succeededToday: number
  failedToday: number
  promptTokensToday: number
  completionTokensToday: number
  totalTokensToday: number
  estimatedCostCentsToday: number
  latestCallAt?: string
}

type GatewayErrorCode =
  | 'MODEL_NOT_CONFIGURED'
  | 'MODEL_ROUTING_DISABLED'
  | 'MODEL_PROVIDER_UNSUPPORTED'
  | 'MODEL_BUDGET_EXCEEDED'
  | 'MODEL_CALL_LIMIT_EXCEEDED'
  | 'MODEL_AUDIT_REQUIRED'
  | 'MODEL_PROVIDER_REJECTED'
  | 'MODEL_PROVIDER_TIMEOUT'
  | 'MODEL_INVALID_RESPONSE'
  | 'MODEL_RATE_LIMITED'
  | 'MODEL_CIRCUIT_OPEN'

export class GovernedModelGatewayError extends Error {
  constructor(
    readonly code: GatewayErrorCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message)
    this.name = 'GovernedModelGatewayError'
  }
}

interface GatewayPolicy {
  routeMode: GovernedModelRouteMode
  primaryProvider: string
  maxModelCalls: number
  dailyBudgetCents: number
}

interface DeepSeekUsagePayload {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  prompt_cache_hit_tokens?: number
}

interface DeepSeekPayload {
  id?: string
  model?: string
  choices?: Array<{
    finish_reason?: string
    message?: { content?: string }
  }>
  usage?: DeepSeekUsagePayload
  error?: { code?: string; message?: string }
}

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_MODEL = 'deepseek-chat'
const MAX_PROMPT_CHARACTERS = 48_000
const MAX_MESSAGE_CHARACTERS = 16_000
const MAX_MESSAGES = 24
const MAX_ERROR_CHARACTERS = 1_000

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function optionalPositiveNumber(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

function clamp(value: number | undefined, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, Number(value)))
}

function redactSecrets(value: string): string {
  return value
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED_SECRET]')
    .replace(/(authorization\s*:\s*bearer)\s+[^\s]+/gi, '$1 [REDACTED_SECRET]')
    .replace(/(api[_ -]?key\s*[:=]\s*)[^\s,;]+/gi, '$1[REDACTED_SECRET]')
}

function safeErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? 'Unknown model error')
  return redactSecrets(message).slice(0, MAX_ERROR_CHARACTERS)
}

function normalizedPurpose(value: string): string {
  const safe = value.trim().slice(0, 80)
  if (!safe) throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'Model invocation purpose is required')
  return safe
}

function normalizedMessages(request: GovernedModelRequest): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const systemPrompt = redactSecrets(request.systemPrompt.trim()).slice(0, MAX_MESSAGE_CHARACTERS)
  if (!systemPrompt) throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'Model system boundary is required')
  const messages = request.messages.slice(-MAX_MESSAGES).map((message) => ({
    role: message.role,
    content: redactSecrets(message.content.trim()).slice(0, MAX_MESSAGE_CHARACTERS),
  })).filter((message) => message.content.length > 0)
  const result: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ]
  const characters = result.reduce((sum, message) => sum + message.content.length, 0)
  if (characters > MAX_PROMPT_CHARACTERS) {
    throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', `Model context exceeds the governed ${MAX_PROMPT_CHARACTERS}-character limit`)
  }
  return result
}

function deepSeekConfiguration(): { key: string; model: string; baseUrl: string; timeoutMs: number } {
  loadEnv()
  const key = process.env.DEEPSEEK_API_KEY?.trim()
  if (!key) throw new GovernedModelGatewayError('MODEL_NOT_CONFIGURED', 'DeepSeek server credential is not configured')
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL
  const configuredBase = process.env.DEEPSEEK_BASE_URL?.trim() || DEFAULT_BASE_URL
  let url: URL
  try {
    url = new URL(configuredBase)
  } catch {
    throw new GovernedModelGatewayError('MODEL_NOT_CONFIGURED', 'DeepSeek service URL is invalid')
  }
  if (url.protocol !== 'https:' || url.hostname !== 'api.deepseek.com') {
    throw new GovernedModelGatewayError('MODEL_NOT_CONFIGURED', 'DeepSeek service URL is invalid')
  }
  const timeoutMs = clamp(Number(process.env.DEEPSEEK_TIMEOUT_MS), 5_000, 90_000, 12_000)
  return { key, model, baseUrl: url.origin, timeoutMs }
}

export function isGovernedDeepSeekConfigured(): boolean {
  try {
    deepSeekConfiguration()
    return true
  } catch {
    return false
  }
}

export interface GovernedModelReadiness {
  configured: boolean
  ready: boolean
  circuitOpen: boolean
  lastProbeAt?: string
}

/** A configured key is not proof of a working provider. Only a recent, in-process governed probe is readiness evidence. */
export async function getGovernedModelReadiness(schoolId: string): Promise<GovernedModelReadiness> {
  if (!isGovernedDeepSeekConfigured() || !hasPostgresDatabaseUrl()) return { configured: false, ready: false, circuitOpen: false }
  try {
    await loadGatewayPolicy(schoolId)
    const state = await getPostgresPool().query<{ open: boolean; last_probe_at: Date | null }>(
      `SELECT COALESCE((SELECT open_until>now() FROM baize_model_circuits WHERE school_id=$1::uuid),false) AS open,
         (SELECT max(started_at) FROM ai_model_invocations WHERE school_id=$1::uuid AND purpose='operations.probe'
           AND status='SUCCEEDED' AND started_at >= $2::timestamptz AND started_at >= now()-interval '30 minutes') AS last_probe_at`,
      [schoolId, new Date(Date.now() - process.uptime() * 1000 - 1_000).toISOString()],
    )
    const row = state.rows[0]
    return { configured: true, ready: Boolean(row?.last_probe_at && !row.open), circuitOpen: Boolean(row?.open),
      lastProbeAt: row?.last_probe_at?.toISOString() }
  } catch { return { configured: true, ready: false, circuitOpen: false } }
}

function modelLimit(name: string, fallback: number, maximum: number): number {
  const value = Number(process.env[name])
  return Number.isInteger(value) && value >= 1 && value <= maximum ? value : fallback
}

/** Shared PostgreSQL buckets enforce a per-user model budget across application instances. */
async function enforceModelCallRateLimit(request: GovernedModelRequest): Promise<void> {
  const client = await getPostgresPool().connect()
  const userHash = hash(`${request.schoolId}:${request.userId ?? 'system'}`).slice(0, 40)
  try {
    await client.query('BEGIN')
    for (const [bucket, granularity, limit] of [
      [`model:user:${userHash}`, 'minute', modelLimit('BAIZE_MODEL_USER_QPM', 30, 300)],
      ['model:global', 'second', modelLimit('BAIZE_MODEL_GLOBAL_QPS', 20, 200)],
    ] as const) {
      const result = await client.query(
        `INSERT INTO baize_request_windows(bucket,window_start,request_count)
         VALUES($1,date_trunc($2,clock_timestamp()),1)
         ON CONFLICT(bucket,window_start) DO UPDATE SET request_count=baize_request_windows.request_count+1
         WHERE baize_request_windows.request_count<$3 RETURNING request_count`, [bucket, granularity, limit],
      )
      if (!result.rowCount) throw new GovernedModelGatewayError('MODEL_RATE_LIMITED', '模型调用较频繁，请稍后再试')
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

async function loadGatewayPolicy(schoolId: string): Promise<GatewayPolicy> {
  if (!hasPostgresDatabaseUrl()) {
    throw new GovernedModelGatewayError('MODEL_AUDIT_REQUIRED', 'External model calls require the PostgreSQL audit ledger')
  }
  const result = await getPostgresPool().query<{
    route_mode: string
    primary_provider: string | null
    max_model_calls: number
    daily_budget_cents: number
  }>(
    `SELECT route_mode,primary_provider,max_model_calls,daily_budget_cents
     FROM ai_runtime_settings WHERE school_id=$1::uuid`,
    [schoolId],
  )
  const row = result.rows[0]
  if (!row || row.route_mode === 'local_governed') {
    throw new GovernedModelGatewayError('MODEL_ROUTING_DISABLED', 'This tenant is using local governed routing')
  }
  if (row.route_mode !== 'external_preferred' && row.route_mode !== 'hybrid_fail_closed') {
    throw new GovernedModelGatewayError('MODEL_ROUTING_DISABLED', 'This tenant is using local governed routing')
  }
  const primaryProvider = row.primary_provider?.trim() || ''
  if (primaryProvider !== 'deepseek') {
    throw new GovernedModelGatewayError('MODEL_PROVIDER_UNSUPPORTED', 'The selected provider has no executable governed adapter')
  }
  return {
    routeMode: row.route_mode,
    primaryProvider,
    maxModelCalls: Math.max(1, Number(row.max_model_calls ?? 24)),
    dailyBudgetCents: Math.max(0, Number(row.daily_budget_cents ?? 0)),
  }
}

async function enforceBudget(
  schoolId: string,
  taskId: string | undefined,
  policy: GatewayPolicy,
): Promise<void> {
  const pool = getPostgresPool()
  if (taskId) {
    const task = await pool.query<{ present: boolean; plan_max_calls: number | null }>(
      `SELECT EXISTS(SELECT 1 FROM ai_task_runs WHERE id=$1::uuid AND school_id=$2::uuid) AS present,
         (SELECT NULLIF(snapshot #>> '{plan,budget,maxModelCalls}','')::int
          FROM ai_task_runs WHERE id=$1::uuid AND school_id=$2::uuid) AS plan_max_calls`,
      [taskId, schoolId],
    )
    if (task.rows[0]?.present !== true) {
      throw new GovernedModelGatewayError('MODEL_AUDIT_REQUIRED', 'The linked task does not belong to the current tenant')
    }
    const taskLimit = Number(task.rows[0]?.plan_max_calls ?? policy.maxModelCalls)
    const effectiveLimit = Math.min(policy.maxModelCalls, Number.isFinite(taskLimit) && taskLimit > 0 ? taskLimit : policy.maxModelCalls)
    const calls = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ai_model_invocations
       WHERE school_id=$1::uuid AND task_id=$2::uuid AND status IN ('RUNNING','SUCCEEDED','FAILED')`,
      [schoolId, taskId],
    )
    if (Number(calls.rows[0]?.count ?? 0) >= effectiveLimit) {
      throw new GovernedModelGatewayError('MODEL_CALL_LIMIT_EXCEEDED', `The task has reached its ${effectiveLimit}-call model budget`)
    }
  }
  if (policy.dailyBudgetCents > 0) {
    const inputRate = optionalPositiveNumber(process.env.DEEPSEEK_INPUT_COST_PER_MILLION_CENTS)
    const outputRate = optionalPositiveNumber(process.env.DEEPSEEK_OUTPUT_COST_PER_MILLION_CENTS)
    if (inputRate === undefined || outputRate === undefined) {
      throw new GovernedModelGatewayError('MODEL_BUDGET_EXCEEDED', 'Monetary budget enforcement requires configured DeepSeek price rates')
    }
    const usage = await pool.query<{ spent: string | number }>(
      `SELECT COALESCE(sum(estimated_cost_cents),0) AS spent FROM ai_model_invocations
       WHERE school_id=$1::uuid AND status='SUCCEEDED' AND started_at >= date_trunc('day', now())`,
      [schoolId],
    )
    if (number(usage.rows[0]?.spent) >= policy.dailyBudgetCents) {
      throw new GovernedModelGatewayError('MODEL_BUDGET_EXCEEDED', 'The tenant has reached its daily model budget')
    }
  }
}

function estimatedCost(usage: GovernedModelUsage): number | undefined {
  loadEnv()
  const inputRate = optionalPositiveNumber(process.env.DEEPSEEK_INPUT_COST_PER_MILLION_CENTS)
  const outputRate = optionalPositiveNumber(process.env.DEEPSEEK_OUTPUT_COST_PER_MILLION_CENTS)
  if (inputRate === undefined || outputRate === undefined) return undefined
  return (usage.promptTokens * inputRate + usage.completionTokens * outputRate) / 1_000_000
}

function responseUsage(payload: DeepSeekPayload): GovernedModelUsage {
  const promptTokens = number(payload.usage?.prompt_tokens)
  const completionTokens = number(payload.usage?.completion_tokens)
  const totalTokens = number(payload.usage?.total_tokens) || promptTokens + completionTokens
  const usage: GovernedModelUsage = {
    promptTokens,
    completionTokens,
    totalTokens,
    cacheHitTokens: number(payload.usage?.prompt_cache_hit_tokens),
  }
  usage.estimatedCostCents = estimatedCost(usage)
  return usage
}

function retryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function callDeepSeek(
  configuration: ReturnType<typeof deepSeekConfiguration>,
  messages: ReturnType<typeof normalizedMessages>,
  request: GovernedModelRequest,
  onDelta?: (delta: string) => void,
): Promise<{ payload: DeepSeekPayload; requestId?: string; attempts: number }> {
  let lastError: GovernedModelGatewayError | undefined
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController()
    let emitted = false
    const timeout = setTimeout(() => controller.abort(), onDelta ? Math.max(configuration.timeoutMs, 60_000) : configuration.timeoutMs)
    const cancel = () => controller.abort()
    request.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const response = await fetch(`${configuration.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${configuration.key}`,
        },
        body: JSON.stringify({
          model: configuration.model,
          messages,
          temperature: clamp(request.temperature, 0, 1.5, 0.25),
          max_tokens: Math.round(clamp(request.maxTokens, 64, 4_096, 900)),
          stream: Boolean(onDelta),
          ...(onDelta ? { stream_options: { include_usage: true } } : {}),
          ...(request.jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: controller.signal,
      })
      const requestId = response.headers.get('x-request-id') ?? undefined
      if (onDelta && response.ok) {
        if (!response.body) throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'DeepSeek returned no stream', true)
        let content = ''
        let model = configuration.model
        let finishReason: string | undefined
        let usage: DeepSeekUsagePayload | undefined
        let streamedId: string | undefined
        for await (const chunk of decodeDeepSeekEvents(response.body)) {
          if (chunk.error) throw new GovernedModelGatewayError('MODEL_PROVIDER_REJECTED', safeErrorMessage(chunk.error.message))
          if (chunk.id) streamedId = chunk.id
          if (chunk.model) model = chunk.model
          if (chunk.usage) usage = chunk.usage
          const delta = chunk.choices?.[0]?.delta?.content ?? ''
          if (delta) {
            content += delta
            if (content.length > 16_000) throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'DeepSeek stream exceeded output limit')
            emitted = true
            onDelta(delta)
          }
          if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason ?? undefined
        }
        if (!content.trim()) throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'DeepSeek returned empty stream', true)
        return { payload: { id: streamedId, model, choices: [{ message: { content }, finish_reason: finishReason }], usage }, requestId: requestId ?? streamedId, attempts: attempt }
      }
      const text = await response.text()
      let payload: DeepSeekPayload
      try {
        payload = JSON.parse(text) as DeepSeekPayload
      } catch {
        throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'DeepSeek returned an unparsable response', true)
      }
      if (response.ok && !payload.choices?.[0]?.message?.content?.trim()) {
        throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'DeepSeek returned empty content', true)
      }
      if (!response.ok) {
        const providerMessage = safeErrorMessage(payload.error?.message ?? `HTTP ${response.status}`)
        const error = new GovernedModelGatewayError(
          'MODEL_PROVIDER_REJECTED',
          `DeepSeek request failed (${response.status}): ${providerMessage}`,
          retryableStatus(response.status),
        )
        if (error.retryable && attempt < 3) {
          lastError = error
          await delay(400 * (2 ** (attempt - 1)))
          continue
        }
        throw error
      }
      return { payload, requestId: requestId ?? payload.id, attempts: attempt }
    } catch (error) {
      const normalized = error instanceof GovernedModelGatewayError
        ? error
        : error instanceof Error && error.name === 'AbortError'
          ? new GovernedModelGatewayError('MODEL_PROVIDER_TIMEOUT', 'DeepSeek request timed out; no business write was affected', true)
          : new GovernedModelGatewayError('MODEL_PROVIDER_REJECTED', safeErrorMessage(error), true)
      if (!emitted && !request.signal?.aborted && normalized.retryable && attempt < 3) {
        lastError = normalized
        await delay(400 * (2 ** (attempt - 1)))
        continue
      }
      throw normalized
    } finally {
      clearTimeout(timeout)
      request.signal?.removeEventListener('abort', cancel)
    }
  }
  throw lastError ?? new GovernedModelGatewayError('MODEL_PROVIDER_REJECTED', 'DeepSeek request failed')
}

export async function invokeGovernedModel(request: GovernedModelRequest, onDelta?: (delta: string) => void): Promise<GovernedModelResult> {
  const purpose = normalizedPurpose(request.purpose)
  const policy = await loadGatewayPolicy(request.schoolId)
  const configuration = deepSeekConfiguration()
  if (await isBaizeModelCircuitOpen(request.schoolId)) {
    throw new GovernedModelGatewayError('MODEL_CIRCUIT_OPEN', '模型暂时不可用，当前以基础规则模式提供服务')
  }
  await enforceBudget(request.schoolId, request.taskId, policy)
  await enforceModelCallRateLimit(request)
  const messages = normalizedMessages(request)
  const promptPayload = JSON.stringify(messages)
  const invocationId = randomUUID()
  const traceId = randomUUID().replaceAll('-', '')
  const startedAt = Date.now()
  const pool = getPostgresPool()

  const auditClient = await pool.connect()
  try {
    await auditClient.query('BEGIN')
    await auditClient.query(
      `INSERT INTO ai_model_invocations(
         id,school_id,task_id,node_id,user_id,trace_id,provider,model,purpose,route_mode,status,
         prompt_hash,prompt_message_count,prompt_characters,metadata,started_at,created_at,updated_at
       ) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,'deepseek',$7,$8,$9,'RUNNING',$10,$11,$12,$13::jsonb,now(),now(),now())`,
      [
        invocationId, request.schoolId, request.taskId ?? null, request.nodeId ?? null, request.userId ?? null,
        traceId, configuration.model, purpose, policy.routeMode, hash(promptPayload), messages.length,
        messages.reduce((sum, message) => sum + message.content.length, 0),
        JSON.stringify({ streaming: Boolean(onDelta), jsonMode: request.jsonMode === true, maxTokens: Math.round(clamp(request.maxTokens, 64, 4_096, 900)), conversationId: request.conversationId ?? null, toolCallCount: request.toolCallCount ?? 0 }),
      ],
    )
    if (request.taskId) {
      await auditClient.query(
        `INSERT INTO ai_trace_links(school_id,task_id,node_id,trace_id,span_id,parent_span_id)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,NULL)`,
        [request.schoolId, request.taskId, request.nodeId ?? null, traceId, invocationId.replaceAll('-', '').slice(0, 32)],
      )
    }
    await auditClient.query('COMMIT')
  } catch (error) {
    await auditClient.query('ROLLBACK').catch(() => undefined)
    throw new GovernedModelGatewayError('MODEL_AUDIT_REQUIRED', `Model audit initialization failed: ${safeErrorMessage(error)}`)
  } finally {
    auditClient.release()
  }

  try {
    const called = await callDeepSeek(configuration, messages, request, onDelta)
    const content = called.payload.choices?.[0]?.message?.content?.trim() ?? ''
    if (!content) throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'DeepSeek returned empty content')
    const usage = responseUsage(called.payload)
    const latencyMs = Date.now() - startedAt
    const finishReason = called.payload.choices?.[0]?.finish_reason
    const providerRequestId = called.requestId ?? called.payload.id
    await pool.query(
      `UPDATE ai_model_invocations SET status='SUCCEEDED',response_hash=$2,response_characters=$3,
         prompt_tokens=$4,completion_tokens=$5,total_tokens=$6,cache_hit_tokens=$7,estimated_cost_cents=$8,
         latency_ms=$9,provider_request_id=$10,finish_reason=$11,
         metadata=metadata||$12::jsonb,completed_at=now(),updated_at=now()
       WHERE id=$1::uuid`,
      [
        invocationId, hash(content), content.length, usage.promptTokens, usage.completionTokens, usage.totalTokens,
        usage.cacheHitTokens, usage.estimatedCostCents ?? null, latencyMs, providerRequestId ?? null, finishReason ?? null,
        JSON.stringify({ attempts: called.attempts, returnedModel: called.payload.model ?? configuration.model }),
      ],
    )
    await recordBaizeModelOutcome(request.schoolId, true).catch(() => undefined)
    return {
      invocationId,
      traceId,
      provider: 'deepseek',
      model: called.payload.model ?? configuration.model,
      content,
      finishReason,
      providerRequestId,
      latencyMs,
      usage,
    }
  } catch (error) {
    const normalized = error instanceof GovernedModelGatewayError
      ? error
      : new GovernedModelGatewayError('MODEL_PROVIDER_REJECTED', safeErrorMessage(error))
    await pool.query(
      `UPDATE ai_model_invocations SET status='FAILED',latency_ms=$2,error_code=$3,error_message=$4,
       completed_at=now(),updated_at=now() WHERE id=$1::uuid`,
      [invocationId, Date.now() - startedAt, normalized.code, safeErrorMessage(normalized)],
    ).catch(() => undefined)
    if (normalized.retryable || normalized.code === 'MODEL_INVALID_RESPONSE') {
      await recordBaizeModelOutcome(request.schoolId, false).catch(() => undefined)
    }
    throw normalized
  }
}

export function parseGovernedJson<T>(content: string): T {
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  try {
    return JSON.parse(cleaned) as T
  } catch {
    throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'The structured model response is not valid JSON')
  }
}

export async function runGovernedModelProbe(schoolId: string, userId: string): Promise<GovernedModelResult> {
  const response = await invokeGovernedModel({
    schoolId,
    userId,
    purpose: 'operations.probe',
    systemPrompt: 'You are a connectivity probe. Reply with exactly: BAIZE_MODEL_OK',
    messages: [{ role: 'user', content: 'health check' }],
    temperature: 0,
    maxTokens: 32,
  })
  if (response.content.trim() !== 'BAIZE_MODEL_OK') {
    await getPostgresPool().query(
      "UPDATE ai_model_invocations SET status='FAILED',error_code='MODEL_INVALID_RESPONSE',error_message='Probe challenge response mismatch',updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid",
      [response.invocationId, schoolId],
    )
    await recordBaizeModelOutcome(schoolId, false).catch(() => undefined)
    throw new GovernedModelGatewayError('MODEL_INVALID_RESPONSE', 'Model probe response did not match the challenge')
  }
  return response
}

export async function getModelUsageSnapshot(schoolId: string): Promise<ModelUsageSnapshot> {
  if (!hasPostgresDatabaseUrl()) {
    return { callsToday: 0, succeededToday: 0, failedToday: 0, promptTokensToday: 0, completionTokensToday: 0, totalTokensToday: 0, estimatedCostCentsToday: 0 }
  }
  const result = await getPostgresPool().query<{
    calls_today: number
    succeeded_today: number
    failed_today: number
    prompt_tokens_today: number
    completion_tokens_today: number
    total_tokens_today: number
    estimated_cost_cents_today: string | number
    latest_call_at: Date | string | null
  }>(
    `SELECT count(*)::int AS calls_today,
       count(*) FILTER (WHERE status='SUCCEEDED')::int AS succeeded_today,
       count(*) FILTER (WHERE status='FAILED')::int AS failed_today,
       COALESCE(sum(prompt_tokens),0)::bigint AS prompt_tokens_today,
       COALESCE(sum(completion_tokens),0)::bigint AS completion_tokens_today,
       COALESCE(sum(total_tokens),0)::bigint AS total_tokens_today,
       COALESCE(sum(estimated_cost_cents),0) AS estimated_cost_cents_today,
       max(started_at) AS latest_call_at
     FROM ai_model_invocations
     WHERE school_id=$1::uuid AND started_at >= date_trunc('day', now())`,
    [schoolId],
  )
  const row = result.rows[0]
  const latest = row?.latest_call_at
  return {
    callsToday: Number(row?.calls_today ?? 0),
    succeededToday: Number(row?.succeeded_today ?? 0),
    failedToday: Number(row?.failed_today ?? 0),
    promptTokensToday: Number(row?.prompt_tokens_today ?? 0),
    completionTokensToday: Number(row?.completion_tokens_today ?? 0),
    totalTokensToday: Number(row?.total_tokens_today ?? 0),
    estimatedCostCentsToday: number(row?.estimated_cost_cents_today),
    latestCallAt: latest instanceof Date ? latest.toISOString() : typeof latest === 'string' ? latest : undefined,
  }
}
