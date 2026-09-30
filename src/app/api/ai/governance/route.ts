import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getAiTaskRuntimeRepository, getDevelopmentAiRuntimeDiagnostics } from '@/lib/ai/runtime/repository'
import type { AiTaskRecord } from '@/lib/ai/runtime/types'
import { getSupabaseAdminClient, hasSupabaseAdminCredentials } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { isAiOperationsAdmin } from '@/lib/ai/operations/access'

interface GovernanceEffect {
  id: string
  taskId: string
  nodeId: string
  effectType: string
  targetType?: string
  targetId?: string | null
  status: string
  verification: Record<string, unknown>
  createdAt: string
  verifiedAt?: string
}

interface GovernanceAuditEvent {
  id: string
  taskId?: string
  nodeId?: string
  actorType: string
  actorId: string
  eventType: string
  beforeState?: string
  afterState?: string
  metadata: Record<string, unknown>
  createdAt: string
}

interface GovernanceOutboxEvent {
  id: string
  taskId: string
  eventType: string
  status: string
  attemptCount: number
  lastError?: string
  createdAt: string
  publishedAt?: string
}

interface GovernanceToolInvocation {
  id: string
  taskId: string
  nodeId: string
  skillId: string
  status: string
  attempt: number
  error?: string
  createdAt: string
  completedAt?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function accessibleTasks(tasks: AiTaskRecord[], requestedTaskId: string | null): AiTaskRecord[] {
  return requestedTaskId ? tasks.filter((task) => task.id === requestedTaskId) : tasks
}

function memoryReport(tasks: AiTaskRecord[]) {
  const effects: GovernanceEffect[] = []
  const auditEvents: GovernanceAuditEvent[] = []
  const toolInvocations: GovernanceToolInvocation[] = []

  for (const task of tasks) {
    for (const [index, history] of task.stateHistory.entries()) {
      auditEvents.push({
        id: `${task.id}:state:${index}`,
        taskId: task.id,
        actorType: 'system',
        actorId: 'ai-orchestrator',
        eventType: `task.state.${history.to.toLowerCase()}`,
        beforeState: history.from,
        afterState: history.to,
        metadata: { reason: history.reason, taskVersion: task.version },
        createdAt: history.at,
      })
    }
    for (const node of task.nodes) {
      if (node.output && typeof node.output.effectId === 'string') {
        effects.push({
          id: node.output.effectId,
          taskId: task.id,
          nodeId: node.id,
          effectType: typeof node.output.effectType === 'string' ? node.output.effectType : node.skillId,
          targetType: typeof node.output.targetType === 'string' ? node.output.targetType : undefined,
          targetId: typeof node.output.targetId === 'string' || node.output.targetId === null ? node.output.targetId : undefined,
          status: typeof node.output.status === 'string' ? node.output.status : node.state,
          verification: isRecord(node.output.verification) ? node.output.verification : {},
          createdAt: node.completedAt ?? task.updatedAt,
          verifiedAt: node.state === 'COMPLETED' ? node.completedAt : undefined,
        })
      }
    }
    for (const observation of task.observations) {
      toolInvocations.push({
        id: observation.id,
        taskId: task.id,
        nodeId: observation.nodeId,
        skillId: task.nodes.find((node) => node.id === observation.nodeId)?.skillId ?? 'unknown',
        status: observation.kind === 'error' ? 'FAILED' : 'SUCCEEDED',
        attempt: task.nodes.find((node) => node.id === observation.nodeId)?.attemptCount ?? 0,
        error: observation.kind === 'error' && typeof observation.payload.message === 'string' ? observation.payload.message : undefined,
        createdAt: observation.createdAt,
        completedAt: observation.createdAt,
      })
    }
  }

  const taskIds = new Set(tasks.map((task) => task.id))
  const outboxEvents: GovernanceOutboxEvent[] = getDevelopmentAiRuntimeDiagnostics().outbox
    .filter((event) => taskIds.has(event.aggregateId))
    .map((event) => ({
      id: event.id,
      taskId: event.aggregateId,
      eventType: event.eventType,
      status: 'RECORDED_LOCAL',
      attemptCount: 0,
      createdAt: event.createdAt,
    }))

  return { effects, auditEvents, outboxEvents, toolInvocations }
}

function throwOnError(result: { error: { message: string } | null }, source: string): void {
  if (result.error) throw new Error(`${source}: ${result.error.message}`)
}


async function postgresReport(schoolId: string, taskIds: string[]) {
  if (taskIds.length === 0) return { effects: [], auditEvents: [], outboxEvents: [], toolInvocations: [] }
  const pool = getPostgresPool()
  const [effectResult, auditResult, outboxResult, toolResult] = await Promise.all([
    pool.query(`SELECT id, task_id, node_id, effect_type, target_type, target_id, status, verification, created_at, verified_at FROM ai_business_effects WHERE school_id=$1::uuid AND task_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 500`, [schoolId, taskIds]),
    pool.query(`SELECT id, task_id, node_id, actor_type, actor_id, event_type, before_state, after_state, metadata, created_at FROM ai_audit_events WHERE school_id=$1::uuid AND task_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 1000`, [schoolId, taskIds]),
    pool.query(`SELECT id, aggregate_id, event_type, status, attempt_count, last_error, created_at, published_at FROM ai_outbox_events WHERE school_id=$1::uuid AND aggregate_id=ANY($2::text[]) ORDER BY created_at DESC LIMIT 500`, [schoolId, taskIds]),
    pool.query(`SELECT id, task_id, node_id, skill_id, status, attempt, error, created_at, completed_at FROM ai_tool_invocations WHERE school_id=$1::uuid AND task_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 500`, [schoolId, taskIds]),
  ])
  return {
    effects: effectResult.rows.map((row) => ({ id: row.id, taskId: row.task_id, nodeId: row.node_id, effectType: row.effect_type, targetType: row.target_type, targetId: row.target_id, status: row.status, verification: row.verification ?? {}, createdAt: row.created_at, verifiedAt: row.verified_at ?? undefined })),
    auditEvents: auditResult.rows.map((row) => ({ id: row.id, taskId: row.task_id ?? undefined, nodeId: row.node_id ?? undefined, actorType: row.actor_type, actorId: row.actor_id, eventType: row.event_type, beforeState: row.before_state ?? undefined, afterState: row.after_state ?? undefined, metadata: row.metadata ?? {}, createdAt: row.created_at })),
    outboxEvents: outboxResult.rows.map((row) => ({ id: row.id, taskId: row.aggregate_id, eventType: row.event_type, status: row.status, attemptCount: row.attempt_count, lastError: row.last_error ?? undefined, createdAt: row.created_at, publishedAt: row.published_at ?? undefined })),
    toolInvocations: toolResult.rows.map((row) => ({ id: row.id, taskId: row.task_id, nodeId: row.node_id, skillId: row.skill_id, status: row.status, attempt: row.attempt, error: row.error ?? undefined, createdAt: row.created_at, completedAt: row.completed_at ?? undefined })),
  }
}

async function supabaseReport(schoolId: string, taskIds: string[]) {
  if (taskIds.length === 0) return { effects: [], auditEvents: [], outboxEvents: [], toolInvocations: [] }
  const client = getSupabaseAdminClient()
  const [effectResult, auditResult, outboxResult, toolResult] = await Promise.all([
    client.from('ai_business_effects').select('id, task_id, node_id, effect_type, target_type, target_id, status, verification, created_at, verified_at').eq('school_id', schoolId).in('task_id', taskIds).order('created_at', { ascending: false }).limit(500),
    client.from('ai_audit_events').select('id, task_id, node_id, actor_type, actor_id, event_type, before_state, after_state, metadata, created_at').eq('school_id', schoolId).in('task_id', taskIds).order('created_at', { ascending: false }).limit(1000),
    client.from('ai_outbox_events').select('id, aggregate_id, event_type, status, attempt_count, last_error, created_at, published_at').eq('school_id', schoolId).in('aggregate_id', taskIds).order('created_at', { ascending: false }).limit(500),
    client.from('ai_tool_invocations').select('id, task_id, node_id, skill_id, status, attempt, error, created_at, completed_at').eq('school_id', schoolId).in('task_id', taskIds).order('created_at', { ascending: false }).limit(500),
  ])
  throwOnError(effectResult, 'ai_business_effects')
  throwOnError(auditResult, 'ai_audit_events')
  throwOnError(outboxResult, 'ai_outbox_events')
  throwOnError(toolResult, 'ai_tool_invocations')

  return {
    effects: (effectResult.data ?? []).map((row) => ({ id: row.id, taskId: row.task_id, nodeId: row.node_id, effectType: row.effect_type, targetType: row.target_type, targetId: row.target_id, status: row.status, verification: row.verification ?? {}, createdAt: row.created_at, verifiedAt: row.verified_at ?? undefined })),
    auditEvents: (auditResult.data ?? []).map((row) => ({ id: row.id, taskId: row.task_id ?? undefined, nodeId: row.node_id ?? undefined, actorType: row.actor_type, actorId: row.actor_id, eventType: row.event_type, beforeState: row.before_state ?? undefined, afterState: row.after_state ?? undefined, metadata: row.metadata ?? {}, createdAt: row.created_at })),
    outboxEvents: (outboxResult.data ?? []).map((row) => ({ id: row.id, taskId: row.aggregate_id, eventType: row.event_type, status: row.status, attemptCount: row.attempt_count, lastError: row.last_error ?? undefined, createdAt: row.created_at, publishedAt: row.published_at ?? undefined })),
    toolInvocations: (toolResult.data ?? []).map((row) => ({ id: row.id, taskId: row.task_id, nodeId: row.node_id, skillId: row.skill_id, status: row.status, attempt: row.attempt, error: row.error ?? undefined, createdAt: row.created_at, completedAt: row.completed_at ?? undefined })),
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })

  try {
    const requestedTaskId = request.nextUrl.searchParams.get('task_id')
    const repository = getAiTaskRuntimeRepository()
    const listed = await repository.listTasks({
      schoolId: user.school_id,
      ownerUserId: isAiOperationsAdmin(user) ? undefined : user.id,
    })
    const tasks = accessibleTasks(listed, requestedTaskId)
    if (requestedTaskId && tasks.length === 0) return NextResponse.json({ success: false, error: 'Task not found or inaccessible', code: 'NOT_FOUND' }, { status: 404 })

    const postgres = hasPostgresDatabaseUrl()
    // PostgreSQL is authoritative; production governance never falls back to legacy Supabase.
    const supabase = process.env.NODE_ENV !== 'production' && !postgres && hasSupabaseAdminCredentials()
    const persistent = supabase || postgres
    const report = postgres
      ? await postgresReport(user.school_id, tasks.map((task) => task.id))
      : supabase
        ? await supabaseReport(user.school_id, tasks.map((task) => task.id))
        : memoryReport(tasks)

    return NextResponse.json({
      success: true,
      data: {
        backend: postgres ? 'postgres' : supabase ? 'supabase' : 'development_memory',
        persistent,
        taskCount: tasks.length,
        summary: {
          effects: report.effects.length,
          verifiedEffects: report.effects.filter((effect) => effect.status === 'VERIFIED').length,
          auditEvents: report.auditEvents.length,
          outboxPending: report.outboxEvents.filter((event) => event.status === 'PENDING' || event.status === 'FAILED' || event.status === 'DEAD_LETTER').length,
          toolFailures: report.toolInvocations.filter((tool) => tool.status === 'FAILED').length,
        },
        ...report,
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Governance report failed', code: 'GOVERNANCE_UNAVAILABLE' }, { status: 503 })
  }
}
