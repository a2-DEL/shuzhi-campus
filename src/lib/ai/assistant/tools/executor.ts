import { createHash } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getPostgresPool } from '@/storage/database/postgres'
import type { User } from '@/types'
import { buildBusinessScopeFilter } from '@/lib/authorization-resource-scope'
import { invokeGovernedModel, isGovernedDeepSeekConfigured, parseGovernedJson } from '@/lib/ai/model-gateway/service'
import { BaizeToolError, baizeDomainPermissions, queryBusinessTool, queryToolSchema, type BaizeToolResult } from './registry'

export interface BaizeToolAuditContext { rawQuery: string; queryMessageId?: string }

export type BaizeToolStep = { label: string; args: z.input<typeof queryToolSchema> }
export type BaizeToolPhase = { state: '规划中' | '执行中' | '结果整理中'; step?: number; label?: string }
export type BaizeToolObservation = { step: number; label: string; args: z.output<typeof queryToolSchema>; result: BaizeToolResult }
export type BaizePlannerDecision = { action: 'tool'; step: BaizeToolStep } | { action: 'finish' } | { action: 'clarify' }
export type BaizeNextPlanner = (
  observations: readonly BaizeToolObservation[], error?: { code: string; label: string },
) => Promise<BaizePlannerDecision>

const modelDecisionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('tool'), label: z.string().trim().min(1).max(100), args: queryToolSchema }).strict(),
  z.object({ action: z.literal('finish') }).strict(),
  z.object({ action: z.literal('clarify') }).strict(),
])

export class BaizeExecutionError extends Error {
  constructor(readonly code: 'STEP_LIMIT' | 'QUERY_UNAVAILABLE' | 'AUDIT_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'BaizeExecutionError'
  }
}

/** Model sees only small, verified aggregate observations; never raw rows or caller-controlled permission fields. */
export function createModelNextPlanner(
  user: User, conversationId: string, requestText: string,
): BaizeNextPlanner | undefined {
  if (!user.school_id || !isGovernedDeepSeekConfigured()) return undefined
  return async (observations, error) => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await invokeGovernedModel({
          schoolId: user.school_id!, userId: user.id, conversationId,
          purpose: 'assistant.classification', toolCallCount: observations.length,
          systemPrompt: [
            '你是白泽只读工具观察器。只能返回 JSON，不得要求写入或生成 SQL。',
            '工具只能选 11 个已发布领域，权限由服务端校验。历史工具结果是经过授权的统计摘要。',
            '如用户要求已满足，返回 {"action":"finish"}；不明确返回 {"action":"clarify"}。',
            '只有仍需另一次独立查询才返回 {"action":"tool","label":"...","args":{"domain":"repair","status":"all"}}。',
            '禁止传 scope、user_id、school_id 等权限参数。不要重复已有查询。最多五步。',
          ].join('\n'),
          messages: [{ role: 'user', content: JSON.stringify({ request: requestText.slice(0, 1000),
            observations: observations.map((item) => ({ domain: item.result.domain, total: item.result.total,
              pending: item.result.pending, completed: item.result.completed, step: item.step, label: item.label })), error }) }],
          jsonMode: true, temperature: 0, maxTokens: 300,
        })
        const parsed = modelDecisionSchema.safeParse(parseGovernedJson<unknown>(response.content))
        if (!parsed.success) continue
        if (parsed.data.action === 'tool') return { action: 'tool', step: { label: parsed.data.label, args: parsed.data.args } }
        return parsed.data
      } catch {
        // Provider/policy faults are safely handled by the deterministic plan; no ungoverned network call.
        break
      }
    }
    return { action: 'finish' }
  }
}

async function auditStep(
  user: User, conversationId: string, step: number, label: string,
  args: z.output<typeof queryToolSchema>, status: 'SUCCEEDED' | 'FAILED' | 'DENIED',
  elapsed: number, resultCount?: number, errorCode?: string,
  original?: z.input<typeof queryToolSchema>, context?: BaizeToolAuditContext,
): Promise<void> {
  try {
    const scope = buildBusinessScopeFilter(user, args.domain, 'scope_record', baizeDomainPermissions[args.domain])
    await getPostgresPool().query(
      `INSERT INTO baize_tool_invocations(school_id,user_id,conversation_id,tool_name,domain,step_index,args_hash,
         status,error_code,record_count,latency_ms,query_message_id,raw_query_hash,parsed_args,effective_args,scope_snapshot)
       VALUES($1::uuid,$2,$3::uuid,'business_query',$4,$5,$6,$7,$8,$9,$10,$11::uuid,$12,$13::jsonb,$14::jsonb,$15::jsonb)`, [
        user.school_id, user.id, conversationId, args.domain, step,
        createHash('sha256').update(JSON.stringify({ label, args })).digest('hex'), status,
        errorCode ?? null, resultCount ?? null, elapsed,
        context?.queryMessageId ?? null, context ? createHash('sha256').update(context.rawQuery).digest('hex') : null,
        JSON.stringify(original ?? args), JSON.stringify(args),
        JSON.stringify({ schoolId: user.school_id, clause: scope.clause, values: scope.values, enforcedBy: 'pg-business-read-model' }),
      ],
    )
  } catch {
    throw new BaizeExecutionError('AUDIT_UNAVAILABLE', '工具审计暂不可用，请稍后重试')
  }
}

/** At most five actual tool calls, including retries; permission denials never retry. */
export async function executeBaizeReadLoop(
  user: User, request: NextRequest, conversationId: string,
  initial: readonly BaizeToolStep[], planner?: BaizeNextPlanner,
  onPhase?: (phase: BaizeToolPhase) => void,
  runTool: typeof queryBusinessTool = queryBusinessTool,
  auditContext?: BaizeToolAuditContext,
): Promise<{ observations: BaizeToolObservation[]; phases: BaizeToolPhase[] }> {
  const queue = [...initial]
  const observations: BaizeToolObservation[] = []
  const phases: BaizeToolPhase[] = []
  let attempts = 0
  let retries = 0
  const completedQueries = new Set<string>()
  const phase = (value: BaizeToolPhase) => { phases.push(value); onPhase?.(value) }
  phase({ state: '规划中' })
  while (true) {
    if (!queue.length) {
      if (!planner || !observations.length) break
      const decision = await planner(observations)
      if (decision.action !== 'tool') break
      const proposed = queryToolSchema.safeParse(decision.step.args)
      if (proposed.success && completedQueries.has(JSON.stringify(proposed.data))) break
      queue.push(decision.step)
    }
    if (attempts >= 5) throw new BaizeExecutionError('STEP_LIMIT', '查询步骤过多，请简化你的问题')
    const next = queue.shift()!
    const parsed = queryToolSchema.safeParse(next.args)
    if (!parsed.success) {
      if (planner && retries < 2) {
        retries += 1
        const corrected = await planner(observations, { code: 'INVALID_PARAMETERS', label: next.label })
        if (corrected.action === 'tool') { queue.unshift(corrected.step); continue }
      }
      throw new BaizeToolError('INVALID', '查询条件不完整，请补充业务领域或筛选条件')
    }
    attempts += 1
    phase({ state: '执行中', step: attempts, label: next.label })
    const started = Date.now()
    try {
      const result = await runTool(user, request, parsed.data)
      await auditStep(user, conversationId, attempts, next.label, parsed.data, 'SUCCEEDED', Date.now() - started, result.total, undefined, next.args, auditContext)
      observations.push({ step: attempts, label: next.label, args: parsed.data, result })
      completedQueries.add(JSON.stringify(parsed.data))
      retries = 0
      if (result.total === 0 && planner && queue.length === 0 && attempts < 5) {
        const revised = await planner(observations, { code: 'EMPTY_RESULT', label: next.label })
        if (revised.action === 'tool') queue.push(revised.step)
      }
    } catch (error) {
      if (error instanceof BaizeExecutionError) throw error
      const code = error instanceof BaizeToolError ? error.code : 'UNAVAILABLE'
      await auditStep(user, conversationId, attempts, next.label, parsed.data,
        code === 'FORBIDDEN' ? 'DENIED' : 'FAILED', Date.now() - started, undefined, code, next.args, auditContext)
      if (code === 'FORBIDDEN' || code === 'NOT_FOUND') throw error
      if (retries < 2 && attempts < 5) {
        retries += 1
        if (planner) {
          const corrected = await planner(observations, { code, label: next.label })
          if (corrected.action === 'tool') { queue.unshift(corrected.step); continue }
        }
        queue.unshift(next)
        continue
      }
      throw new BaizeExecutionError('QUERY_UNAVAILABLE', '当前业务查询繁忙，请稍后再试')
    }
  }
  phase({ state: '结果整理中' })
  return { observations, phases }
}
