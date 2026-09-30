import { User, UserRole } from '@/types'
import { isAiOperationsAdmin } from '@/lib/ai/operations/access'
import { getIdentityRepository } from '@/lib/identity/repository'
import {
  EnterpriseSkillGatewayError,
  executePreparedEnterpriseSkill,
  prepareEnterpriseSkillOperation,
  requiredApprovalCount,
} from '@/lib/ai/skills/gateway'
import type { SkillOperationContext } from '@/lib/ai/skills/contracts'
import { hasEnterpriseSkillPort } from '@/lib/ai/skills/port'
import { getEnterpriseSkillContract } from '@/lib/ai/skills/registry'
import { getRoleAgentTeam, getSpiritPersonaForSkill } from './agent-catalog'
import { buildAiPlan, classifyAiCommand, getAiSkill, AiPlanningError } from './planner'
import { createTaskFinalNarrative, createTaskIntentBrief, type BaizeModelEvidence } from '@/lib/ai/model-gateway/baize'
import { canTransitionAiTask, transitionAiTask } from './state-machine'
import { createAiTaskRecord } from './store'
import {
  AiTaskRepositoryError,
  canAccessAiTask,
  getAiTaskRuntimeRepository,
} from './repository'
import {
  AiApprovalRecord,
  AiTaskMessage,
  AiTaskNode,
  AiTaskRecord,
  AiTaskState,
  CreateAiTaskInput,
} from './types'

export class AiRuntimeError extends Error {
  constructor(
    readonly code: 'TASK_NOT_FOUND' | 'TASK_ACCESS_DENIED' | 'APPROVAL_REQUIRED' | 'DUAL_APPROVAL_REQUIRED' | 'EXECUTION_BLOCKED' | 'VERSION_CONFLICT',
    message: string
  ) {
    super(message)
    this.name = 'AiRuntimeError'
  }
}

function now(): string {
  return new Date().toISOString()
}

function message(
  task: AiTaskRecord,
  agentId: string,
  agentName: string,
  agentAvatar: string,
  type: AiTaskMessage['type'],
  content: string,
  data?: Record<string, unknown>
): AiTaskMessage {
  return {
    id: `${task.id}-message-${task.messages.length + 1}`,
    taskId: task.id,
    agentId,
    agentName,
    agentAvatar,
    type,
    content,
    createdAt: now(),
    data,
  }
}

function updateTask(task: AiTaskRecord, patch: Partial<AiTaskRecord>): AiTaskRecord {
  return { ...task, ...patch, updatedAt: now() }
}

function addMessage(task: AiTaskRecord, nextMessage: AiTaskMessage): AiTaskRecord {
  return updateTask(task, { messages: [...task.messages, nextMessage] })
}

function transition(task: AiTaskRecord, state: AiTaskState, reason: string): AiTaskRecord {
  return transitionAiTask(task, state, reason)
}

async function persistTask(
  task: AiTaskRecord,
  eventType: string,
  eventPayload: Record<string, unknown> = {}
): Promise<AiTaskRecord> {
  try {
    return await getAiTaskRuntimeRepository().saveTask(task, {
      expectedVersion: task.version,
      eventType,
      eventPayload,
    })
  } catch (error) {
    if (error instanceof AiTaskRepositoryError && error.code === 'VERSION_CONFLICT') {
      throw new AiRuntimeError('VERSION_CONFLICT', 'The task changed concurrently; reload before retrying')
    }
    throw error
  }
}

function buildNodes(task: AiTaskRecord): AiTaskNode[] {
  const createdAt = now()
  return task.plan.subtasks.map((subtask) => ({
    id: subtask.id,
    taskId: task.id,
    agentId: subtask.preferredAgent,
    agentName: subtask.preferredAgentName,
    agentAvatar: getSpiritPersonaForSkill(subtask.skillId).avatar,
    title: subtask.title,
    skillId: subtask.skillId,
    state: 'PENDING',
    dependsOn: subtask.dependsOn,
    input: subtask.inputParams ? { ...subtask.inputParams } : {},
    attemptCount: 0,
    maxAttempts: subtask.retryPolicy.maxAttempts,
    createdAt,
    updatedAt: createdAt,
  }))
}

function nodeInput(task: AiTaskRecord, node: AiTaskNode): Record<string, unknown> {
  const rootParams = Object.keys(node.input).length > 0 ? node.input : task.intent.params
  if (node.skillId === 'repair_policy_guard') {
    return { ...rootParams, count: Number(rootParams.count ?? 1) }
  }
  if (node.skillId === 'smart_dispatch' || node.skillId === 'batch_dispatch' || node.skillId === 'repair_dispatch') {
    return { ...rootParams, count: Number(rootParams.count ?? 1) }
  }
  if (node.skillId === 'send_notification' || node.skillId === 'notification_publish') {
    const target = typeof rootParams.target === 'string' ? rootParams.target.toLowerCase() : undefined
    const validRoles = new Set<string>(Object.values(UserRole))
    const audience = rootParams.audience && typeof rootParams.audience === 'object' && !Array.isArray(rootParams.audience)
      ? rootParams.audience
      : {
          roles: target === 'all' ? Object.values(UserRole) : target && validRoles.has(target) ? [target] : [UserRole.STUDENT],
          userIds: [],
          organizationIds: [],
        }
    return {
      title: rootParams.title ?? 'System notification',
      content: rootParams.content ?? task.command,
      type: rootParams.type ?? 'SYSTEM',
      audience,
      channels: rootParams.channels ?? ['platform'],
      requireAcknowledgement: rootParams.requireAcknowledgement ?? false,
      ...(rootParams.scheduledAt ? { scheduledAt: rootParams.scheduledAt } : {}),
    }
  }
  return { ...rootParams }
}
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function businessTime(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toLocaleString('zh-CN')
}

function describeBusinessOutcome(node: AiTaskNode, output: Record<string, unknown>): string {
  const result = asRecord(output.result)
  if (node.skillId === 'repair_policy_guard') {
    const count = numeric(result.checkedRepairs)
    return `\u5df2\u6838\u9a8c ${count} \u5f20\u771f\u5b9e\u5f85\u6d3e\u5de5\u5355\uff1b\u79df\u6237\u3001\u72b6\u6001\u3001\u4eba\u5458\u6c60\u4e0e\u5ba1\u6279\u8fb9\u754c\u5747\u901a\u8fc7\u3002\u5408\u89c4\u8bc1\u636e\u5df2\u5c01\u5b58\uff0c\u62a5\u4fee\u4e1a\u52a1\u5199\u5165\u4e3a\u96f6\u3002`
  }
  if (['repair_dispatch', 'smart_dispatch', 'batch_dispatch'].includes(node.skillId)) {
    const assignments = Array.isArray(result.assignments) ? result.assignments.map(asRecord) : []
    const count = numeric(result.dispatched) || assignments.length
    const details = assignments.slice(0, 2).map((item) => `${String(item.repairTitle ?? '\u62a5\u4fee\u5de5\u5355')}\u5df2\u4ea4\u7ed9${String(item.workerName ?? '\u7ef4\u4fee\u4eba\u5458')}`).join('\uff0c')
    return `\u5df2\u5c06 ${count} \u5f20\u771f\u5b9e\u62a5\u4fee\u5de5\u5355\u5b8c\u6210\u6d3e\u5de5${details ? `\uff1a${details}` : ''}\uff1b\u5de5\u5355\u72b6\u6001\u5df2\u56de\u8bfb\u4e3a\u201c\u5df2\u6d3e\u5de5\u201d\u3002`
  }
  if (['notification_publish', 'send_notification'].includes(node.skillId)) {
    const audience = numeric(result.audienceCount)
    const deliveries = numeric(result.deliveryTasks)
    const state = result.status === 'SCHEDULED' ? '\u5df2\u5b9a\u65f6' : '\u5df2\u53d1\u5e03'
    return `\u901a\u77e5${state}\uff0c\u8986\u76d6 ${audience} \u540d\u771f\u5b9e\u63a5\u6536\u4eba\uff0c\u5df2\u751f\u6210 ${deliveries} \u9879\u53ef\u8ffd\u8e2a\u89e6\u8fbe\u4efb\u52a1\u3002`
  }
  if (node.skillId === 'classroom_book') {
    const startsAt = businessTime(result.startsAt)
    const endsAt = businessTime(result.endsAt)
    return `\u6559\u5ba4\u9884\u7ea6\u5df2\u767b\u8bb0\u5e76\u901a\u8fc7\u51b2\u7a81\u56de\u8bfb${startsAt && endsAt ? `\uff0c\u65f6\u6bb5\u4e3a ${startsAt} \u81f3 ${endsAt}` : ''}\uff0c\u5f53\u524d\u8fdb\u5165\u5f85\u5ba1\u6838\u72b6\u6001\u3002`
  }
  if (node.skillId === 'lost_found_claim') {
    return '\u5931\u7269\u8ba4\u9886\u5df2\u5b8c\u6210\u771f\u5b9e\u767b\u8bb0\uff0c\u4eba\u5de5\u6838\u9a8c\u8bc1\u636e\u53ea\u4fdd\u7559\u5b89\u5168\u6458\u8981\uff0c\u4e0d\u5728\u6c47\u62a5\u4e2d\u66b4\u9732\u3002'
  }
  if (node.skillId === 'hygiene_rectification_create') {
    const dueAt = businessTime(result.dueAt)
    return `\u536b\u751f\u6574\u6539\u4efb\u52a1\u5df2\u5efa\u7acb${dueAt ? `\uff0c\u622a\u6b62 ${dueAt}` : ''}\uff1b\u8bc4\u5206\u4ec5\u4f5c\u5efa\u8bae\uff0c\u4e0d\u4ee3\u66ff\u4eba\u5de5\u88c1\u51b3\u3002`
  }
  if (node.skillId === 'dorm_safety_confirm') {
    const labels: Record<string, string> = { FALSE_ALARM: '\u786e\u8ba4\u8bef\u62a5', RECTIFICATION_REQUIRED: '\u9700\u8981\u6574\u6539', ESCALATED: '\u5df2\u5347\u7ea7\u5904\u7f6e' }
    return `\u5bbf\u820d\u5b89\u5168\u4e8b\u4ef6\u5df2\u7531\u73b0\u573a\u4eba\u5458\u590d\u6838\uff0c\u7ed3\u8bba\u4e3a\u201c${labels[String(result.status)] ?? '\u5df2\u786e\u8ba4'}\u201d\uff0c\u767d\u6cfd\u672a\u4f5c\u60e9\u6212\u6027\u63a8\u65ad\u3002`
  }
  if (node.skillId === 'visitor_approve') {
    const validUntil = businessTime(result.validUntil)
    return result.status === 'APPROVED'
      ? `\u8bbf\u5ba2\u51c6\u5165\u5df2\u6279\u51c6\uff0c\u4e00\u6b21\u6027\u51ed\u8bc1${validUntil ? `\u6709\u6548\u81f3 ${validUntil}` : '\u5df2\u53d7\u9650\u751f\u6210'}\uff0c\u539f\u59cb\u51ed\u8bc1\u4e0d\u8fdb\u5165\u5ba1\u8ba1\u660e\u6587\u3002`
      : '\u8bbf\u5ba2\u51c6\u5165\u5df2\u6309\u4eba\u5de5\u88c1\u51b3\u62d2\u7edd\uff0c\u672a\u751f\u6210\u51c6\u5165\u51ed\u8bc1\u3002'
  }
  if (node.skillId === 'maintenance_recommendation_create') {
    return `\u5df2\u6839\u636e ${numeric(result.validReadingCount)} \u6761\u8d28\u91cf\u5408\u683c\u7684\u771f\u5b9e\u8bfb\u6570\u5efa\u7acb\u7ef4\u62a4\u5efa\u8bae\uff0c\u5f53\u524d\u4fdd\u6301\u201c\u5efa\u8bae\u5f85\u590d\u6838\u201d\uff0c\u672a\u4f7f\u7528\u6a21\u62df\u66f2\u7ebf\u3002`
  }
  return `\u300c${node.title}\u300d\u5df2\u771f\u5b9e\u843d\u5730\uff0c\u4e14\u4e1a\u52a1\u5e93\u56de\u8bfb\u7ed3\u679c\u4e0e\u6267\u884c\u76ee\u6807\u4e00\u81f4\u3002`
}

function aggregateBusinessReport(task: AiTaskRecord): string {
  const outcomes = task.nodes
    .filter((node) => node.output)
    .map((node) => describeBusinessOutcome(node, node.output ?? {}))
  const detail = outcomes.length > 0 ? outcomes.join('\u3000') : '\u6240\u6709\u5b50\u4efb\u52a1\u5747\u5df2\u56de\u4f20\u53ef\u9a8c\u6536\u6210\u679c\u3002'
  return `\u8bf8\u4e8b\u5f52\u62e2\uff1a${task.nodes.length}/${task.nodes.length} \u4e2a\u5206\u7075\u4f53\u5747\u5df2\u5f52\u4f4d\u3002${detail}\u5168\u7a0b\u5df2\u5b8c\u6210\u5e42\u7b49\u4fdd\u62a4\u3001\u5ba1\u8ba1\u7559\u75d5\u4e0e\u4e1a\u52a1\u56de\u8bfb\u9a8c\u8bc1\u3002`
}

function verifyGatewayBusinessReadback(node: AiTaskNode): boolean {
  const output = node.output ?? {}
  const verification = asRecord(output.verification)
  return output.status === 'VERIFIED' && verification.verified === true && typeof output.effectId === 'string'
}
function appendObservation(
  task: AiTaskRecord,
  node: AiTaskNode,
  kind: 'tool_result' | 'business_readback' | 'error',
  payload: Record<string, unknown>
): AiTaskRecord {
  return updateTask(task, {
    observations: [...task.observations, {
      id: `${task.id}-observation-${task.observations.length + 1}`,
      taskId: task.id,
      nodeId: node.id,
      kind,
      payload,
      createdAt: now(),
    }],
  })
}

function skillOperationContext(task: AiTaskRecord, node: AiTaskNode, actor: User): SkillOperationContext {
  const approvalCount = new Set(
    (task.approval?.decisions ?? [])
      .filter((decision) => decision.decision === 'APPROVED')
      .map((decision) => decision.userId)
  ).size
  return {
    taskId: task.id,
    nodeId: node.id,
    schoolId: task.schoolId!,
    actor,
    agentId: node.agentId,
    idempotencyKey: `${task.id}:${node.id}:${getAiSkill(node.skillId)?.gatewaySkillKey ?? node.skillId}:effect`,
    approvalStatus: task.approvalPolicy === 'automatic'
      ? 'NOT_REQUIRED'
      : task.approval?.status === 'APPROVED' ? 'APPROVED' : 'NOT_REQUIRED',
    approvalCount,
  }
}

async function prepareEnterpriseNodes(task: AiTaskRecord, actor: User): Promise<AiTaskRecord> {
  let requiredApprovals = task.approvalPolicy === 'dual_approval' ? 2 : task.approvalPolicy === 'single_approval' ? 1 : 0
  for (const node of task.nodes) {
    const skill = getAiSkill(node.skillId)
    if (!skill?.gatewaySkillKey) continue
    const input = nodeInput(task, node)
    const prepared = await prepareEnterpriseSkillOperation(
      skill.gatewaySkillKey,
      input,
      skillOperationContext(task, { ...node, input }, actor)
    )
    const contract = getEnterpriseSkillContract(skill.gatewaySkillKey)!
    requiredApprovals = Math.max(requiredApprovals, requiredApprovalCount(contract, prepared))
    task = updateTask(task, {
      nodes: task.nodes.map((candidate) => candidate.id === node.id
        ? { ...candidate, input, preparedOperation: prepared, updatedAt: now() }
        : candidate),
    })
    const coordinator = getRoleAgentTeam(task.ownerRole).coordinator
    task = addMessage(task, message(
      task,
      coordinator.id,
      coordinator.name,
      coordinator.avatar,
      'chat',
      `白泽已铺开「${getAiSkill(node.skillId)?.name ?? contract.displayName}」的真实执行预览，尚未触碰业务数据。`,
      { nodeId: node.id, skillKey: contract.key, previewId: prepared.previewId, preview: prepared.preview, expiresAt: prepared.expiresAt }
    ))
  }
  if (requiredApprovals > (task.approvalPolicy === 'dual_approval' ? 2 : task.approvalPolicy === 'single_approval' ? 1 : 0)) {
    task = updateTask(task, {
      riskLevel: 'critical',
      approvalPolicy: requiredApprovals === 2 ? 'dual_approval' : 'single_approval',
      plan: {
        ...task.plan,
        subtasks: task.plan.subtasks.map((subtask) => ({
          ...subtask,
          riskLevel: 'critical',
          approvalPolicy: requiredApprovals === 2 ? 'dual_approval' as const : 'single_approval' as const,
        })),
      },
    })
  }
  return task
}

function failTask(task: AiTaskRecord, code: string, errorMessage: string, retryable = false): AiTaskRecord {
  const failedAt = now()
  const nodes = task.nodes.map((node) => node.state === 'PENDING'
    ? { ...node, state: 'BLOCKED' as const, error: errorMessage, updatedAt: failedAt }
    : node)
  task = updateTask(task, {
    nodes,
    blocker: { code, message: errorMessage },
    summary: `此事未能办结：${errorMessage}`,
    retryEligible: retryable,
  })
  if (task.state !== 'FAILED' && canTransitionAiTask(task.state, 'FAILED')) task = transition(task, 'FAILED', code)

  if (retryable) {
    if (task.attemptCount >= task.maxAttempts) {
      task = updateTask(task, {
        deadLetteredAt: failedAt,
        retryEligible: false,
        nextAttemptAt: undefined,
        blocker: { code: 'MAX_ATTEMPTS_EXCEEDED', message: errorMessage },
      })
    } else {
      const delaySeconds = Math.min(300, 2 ** Math.max(1, task.attemptCount))
      task = updateTask(task, { nextAttemptAt: new Date(Date.now() + delaySeconds * 1000).toISOString() })
    }
  }

  const coordinator = getRoleAgentTeam(task.ownerRole).coordinator
  return addMessage(task, message(task, coordinator.id, coordinator.name, coordinator.avatar, 'error', errorMessage, { code, retryable }))
}

async function persistFailedTask(
  task: AiTaskRecord,
  code: string,
  errorMessage: string,
  retryable = false
): Promise<AiTaskRecord> {
  const failed = failTask(task, code, errorMessage, retryable)
  return persistTask(
    failed,
    failed.deadLetteredAt ? 'task.dead_lettered' : retryable ? 'task.retry_scheduled' : 'task.failed',
    { code, retryable, nextAttemptAt: failed.nextAttemptAt }
  )
}

type ExecutionBatchMode = 'policy_guard' | 'fan_out'

function isPolicyGuardNode(node: AiTaskNode): boolean {
  return getAiSkill(node.skillId)?.gatewaySkillKey === 'repair.policy.guard.v1'
}

async function executeNodeBatch(
  task: AiTaskRecord,
  candidates: AiTaskNode[],
  executionActor: User,
  coordinator: ReturnType<typeof getRoleAgentTeam>['coordinator'],
  mode: ExecutionBatchMode,
): Promise<AiTaskRecord> {
  if (candidates.length === 0) return task
  const startedAt = new Map<string, string>()
  task = updateTask(task, {
    nodes: task.nodes.map((node) => {
      if (!candidates.some((candidate) => candidate.id === node.id)) return node
      const at = now()
      startedAt.set(node.id, at)
      return { ...node, state: 'RUNNING' as const, input: nodeInput(task, node), startedAt: at, attemptCount: node.attemptCount + 1, updatedAt: at }
    }),
  })
  for (const node of candidates) {
    const content = mode === 'policy_guard'
      ? `\u767d\u6cfd\u4ee4\u736c\u8c78\u5148\u884c\uff0c\u6838\u9a8c\u300c${node.title}\u300d\u7684\u79df\u6237\u3001\u72b6\u6001\u3001\u6743\u9650\u4e0e\u5ba1\u6279\u8fb9\u754c\u3002`
      : `\u767d\u6cfd\u89d2\u5c16\u4e00\u4eae\uff0c${node.agentName} \u5df2\u5316\u4f5c\u6d41\u5149\u79bb\u9635\uff0c\u63a5\u624b\u300c${node.title}\u300d\u3002`
    task = addMessage(task, message(task, coordinator.id, coordinator.name, coordinator.avatar, 'handover', content))
  }
  task = await persistTask(
    task,
    mode === 'policy_guard' ? 'task.policy_guard.started' : 'task.nodes.started',
    { nodeIds: candidates.map((node) => node.id), executionMode: mode },
  )

  const results = await Promise.all(candidates.map(async (candidate) => {
    const activeNode = task.nodes.find((node) => node.id === candidate.id)!
    const skill = getAiSkill(activeNode.skillId)
    if (!skill?.executable || !skill.gatewaySkillKey) {
      return { nodeId: activeNode.id, error: '\u6b64\u80fd\u529b\u5c1a\u672a\u7ed1\u5b9a\u53d7\u63a7\u4e1a\u52a1\u6267\u884c\u901a\u9053', code: 'SKILL_GATEWAY_NOT_BOUND', retryable: false }
    }
    if (!activeNode.preparedOperation) {
      return { nodeId: activeNode.id, error: '\u6267\u884c\u524d\u5fc5\u987b\u5148\u5f62\u6210\u771f\u5b9e\u4e1a\u52a1\u9884\u89c8', code: 'REAL_PREVIEW_REQUIRED', retryable: false }
    }
    try {
      const gatewayResult = await executePreparedEnterpriseSkill(
        skill.gatewaySkillKey,
        activeNode.input,
        activeNode.preparedOperation,
        skillOperationContext(task, activeNode, executionActor),
      )
      const output: Record<string, unknown> = {
        ...(gatewayResult.data as unknown as Record<string, unknown>),
        lifecycle: [...gatewayResult.lifecycle],
      }
      return { nodeId: activeNode.id, output, prepared: gatewayResult.prepared, durationMs: Date.now() - Date.parse(startedAt.get(activeNode.id) ?? now()) }
    } catch (error) {
      const gatewayError = error instanceof EnterpriseSkillGatewayError ? error : undefined
      const errorMessage = error instanceof Error ? error.message : '\u4e1a\u52a1\u6267\u884c\u901a\u9053\u8fd4\u56de\u4e86\u672a\u77e5\u5f02\u5e38'
      const retryable = gatewayError?.retryable === true && !['STALE_PREVIEW', 'PREVIEW_EXPIRED', 'APPROVAL_REQUIRED', 'DUAL_APPROVAL_REQUIRED'].includes(gatewayError.code)
      return { nodeId: activeNode.id, error: errorMessage, code: gatewayError?.code ?? 'SKILL_GATEWAY_FAILURE', retryable }
    }
  }))

  const failures: Array<{ error: string; code: string; retryable: boolean }> = []
  for (const result of results) {
    if (result.error) {
      const failure = { error: result.error, code: result.code ?? 'SKILL_GATEWAY_FAILURE', retryable: result.retryable === true }
      failures.push(failure)
      task = updateTask(task, { nodes: task.nodes.map((node) => node.id === result.nodeId ? { ...node, state: 'FAILED', error: failure.error, completedAt: now(), updatedAt: now() } : node) })
      const failedNode = task.nodes.find((node) => node.id === result.nodeId)!
      task = appendObservation(task, failedNode, 'error', { code: failure.code, error: failure.error, executionMode: mode })
      continue
    }
    const output = result.output ?? {}
    task = updateTask(task, {
      nodes: task.nodes.map((node) => node.id === result.nodeId
        ? { ...node, state: 'COMPLETED', preparedOperation: result.prepared, output, completedAt: now(), durationMs: result.durationMs, updatedAt: now() }
        : node),
    })
    const completedNode = task.nodes.find((node) => node.id === result.nodeId)!
    task = appendObservation(task, completedNode, 'tool_result', output)
    task = addMessage(task, message(task, completedNode.agentId, completedNode.agentName, completedNode.agentAvatar, 'result', `${completedNode.agentName}\u5faa\u5149\u56de\u4f20\uff1a${describeBusinessOutcome(completedNode, output)}`, output))
  }

  task = await persistTask(
    task,
    mode === 'policy_guard' ? 'task.policy_guard.completed' : 'task.nodes.completed',
    { nodeIds: results.map((result) => result.nodeId), executionMode: mode },
  )
  if (failures.length > 0) {
    const retryable = failures.some((failure) => failure.retryable)
    return persistFailedTask(task, failures[0].code, `\u5206\u7075\u4f53\u5df2\u56de\u5f52 ${task.nodes.filter((node) => node.state === 'COMPLETED').length}/${task.nodes.length}\uff0c\u4ecd\u6709\u4e00\u5904\u53d7\u963b\uff1a${failures[0].error}`, retryable)
  }
  return task
}

async function executeFanOutNodes(
  task: AiTaskRecord,
  executionActor: User,
  coordinator: ReturnType<typeof getRoleAgentTeam>['coordinator'],
): Promise<AiTaskRecord> {
  const candidates = task.nodes.filter((node) => node.state !== 'COMPLETED')
  const policyGuards = candidates.filter(isPolicyGuardNode)
  const executionMembers = candidates.filter((node) => !isPolicyGuardNode(node))

  if (policyGuards.length > 0) {
    task = addMessage(task, message(
      task,
      coordinator.id,
      coordinator.name,
      coordinator.avatar,
      'chat',
      '\u736c\u8c78\u5148\u884c\u3002\u672a\u901a\u8fc7\u5408\u89c4\u8fb9\u754c\u524d\uff0c\u58a8\u9f9f\u4e0e\u7075\u9e4a\u4e0d\u4f1a\u89e6\u78b0\u4e1a\u52a1\u6570\u636e\u3002',
      { businessWriteOccurred: false, guardNodes: policyGuards.map((node) => node.id) },
    ))
    task = await executeNodeBatch(task, policyGuards, executionActor, coordinator, 'policy_guard')
    if (task.state === 'FAILED') return task
    task = addMessage(task, message(
      task,
      coordinator.id,
      coordinator.name,
      coordinator.avatar,
      'chat',
      '\u736c\u8c78\u56de\u4ee4\uff1a\u8fb9\u754c\u5df2\u9501\u5b9a\uff0c\u5408\u89c4\u8bc1\u636e\u5df2\u5c01\u5b58\uff0c\u4e1a\u52a1\u5199\u5165\u4e3a\u96f6\u3002\u73b0\u5728\u653e\u884c\u6267\u884c\u5206\u7075\u3002',
      { businessWriteOccurred: false, policyVerified: true },
    ))
    task = await persistTask(task, 'task.policy_guard.passed', { nodeIds: policyGuards.map((node) => node.id), businessWriteOccurred: false })
  }

  return executeNodeBatch(task, executionMembers, executionActor, coordinator, 'fan_out')
}

async function executeTask(
  task: AiTaskRecord,
  approved: boolean,
  attemptAlreadyClaimed = false,
  ownerUser?: User
): Promise<AiTaskRecord> {
  if (task.approvalPolicy !== 'automatic' && !approved && task.approval?.status !== 'APPROVED') {
    throw new AiRuntimeError('APPROVAL_REQUIRED', '尚未取得人工审批，白泽不会触发任何业务写入')
  }
  if (!hasEnterpriseSkillPort()) {
    return persistFailedTask(task, 'BUSINESS_BACKEND_UNAVAILABLE', '真实业务后端尚未配置，执行已停止，系统不会伪造成功')
  }
  const executionActor = ownerUser?.id === task.ownerUserId
    ? ownerUser
    : await getIdentityRepository().findActiveUserById(task.ownerUserId)
  if (!executionActor || executionActor.school_id !== task.schoolId) {
    return persistFailedTask(task, 'OWNER_AUTHORIZATION_REVOKED', '任务发起人的身份或租户授权已失效，执行已安全停止')
  }

  if (task.state === 'PREVIEWED' || task.state === 'AWAITING_APPROVAL') task = transition(task, 'QUEUED', approved ? 'approval_granted' : 'auto_approved')
  if (task.state !== 'QUEUED') throw new AiRuntimeError('EXECUTION_BLOCKED', `当前任务状态不允许开始执行`)
  task = updateTask(task, {
    attemptCount: task.attemptCount + (attemptAlreadyClaimed ? 0 : 1),
    nextAttemptAt: undefined,
    deadLetteredAt: undefined,
    retryEligible: false,
  })
  task = transition(task, 'RUNNING', 'worker_dispatch_started')
  const coordinator = getRoleAgentTeam(task.ownerRole).coordinator
  task = addMessage(task, message(task, coordinator.id, coordinator.name, coordinator.avatar, 'chat', `令已下。${task.nodes.length} 个分灵体正在起阵，我会守在星图中央收拢每一次回传。`))
  task = await persistTask(task, 'task.started', { attemptCount: task.attemptCount })

  if (task.plan.executionMode === 'fan_out' && task.nodes.length > 1 && task.nodes.every((node) => node.dependsOn.length === 0)) {
    task = await executeFanOutNodes(task, executionActor, coordinator)
  } else {
    for (let index = 0; index < task.nodes.length; index += 1) {
    const node = task.nodes[index]
    if (node.state === 'COMPLETED') continue
    if (task.leaseToken && task.schoolId) {
      task = await getAiTaskRuntimeRepository().renewLease(task.id, task.schoolId, task.leaseToken, 180)
    }
    if (node.dependsOn.some((dependencyId) => task.nodes.find((candidate) => candidate.id === dependencyId)?.state !== 'COMPLETED')) {
      task = updateTask(task, { nodes: task.nodes.map((candidate) => candidate.id === node.id ? { ...candidate, state: 'BLOCKED', error: '前置任务尚未完成', updatedAt: now() } : candidate) })
      continue
    }

    const startedAt = now()
    const input = nodeInput(task, node)
    task = updateTask(task, {
      nodes: task.nodes.map((candidate) => candidate.id === node.id
        ? { ...candidate, state: 'RUNNING', input, startedAt, attemptCount: candidate.attemptCount + 1, updatedAt: startedAt }
        : candidate),
    })
    task = addMessage(task, message(task, coordinator.id, coordinator.name, coordinator.avatar, 'handover', `白泽将「${node.title}」交予 ${node.agentName}，请即刻启程，完成后循光路回报。`))
    task = await persistTask(task, 'task.node.started', { nodeId: node.id, skillId: node.skillId })

    const activeNode = task.nodes.find((candidate) => candidate.id === node.id)!
    const skill = getAiSkill(activeNode.skillId)
    if (!skill?.executable || !skill.gatewaySkillKey) {
      task = updateTask(task, { nodes: task.nodes.map((candidate) => candidate.id === activeNode.id ? { ...candidate, state: 'BLOCKED', error: '此能力尚未绑定受控业务执行通道', updatedAt: now() } : candidate) })
      task = appendObservation(task, activeNode, 'error', { code: 'SKILL_GATEWAY_NOT_BOUND' })
      return persistFailedTask(task, 'SKILL_GATEWAY_NOT_BOUND', `「${activeNode.title}」尚未绑定受控业务执行通道`)
    }
    if (!activeNode.preparedOperation) {
      task = updateTask(task, { nodes: task.nodes.map((candidate) => candidate.id === activeNode.id ? { ...candidate, state: 'BLOCKED', error: '执行前必须先形成真实业务预览', updatedAt: now() } : candidate) })
      task = appendObservation(task, activeNode, 'error', { code: 'REAL_PREVIEW_REQUIRED' })
      return persistFailedTask(task, 'REAL_PREVIEW_REQUIRED', `「${activeNode.title}」尚未通过真实执行预览审批`)
    }

    let gatewayResult: Awaited<ReturnType<typeof executePreparedEnterpriseSkill>>
    try {
      gatewayResult = await executePreparedEnterpriseSkill(
        skill.gatewaySkillKey,
        input,
        activeNode.preparedOperation,
        skillOperationContext(task, activeNode, executionActor)
      )
    } catch (error) {
      const gatewayError = error instanceof EnterpriseSkillGatewayError ? error : undefined
      const errorMessage = error instanceof Error ? error.message : '业务执行通道返回了未知异常'
      const retryable = gatewayError?.retryable === true && !['STALE_PREVIEW', 'PREVIEW_EXPIRED', 'APPROVAL_REQUIRED', 'DUAL_APPROVAL_REQUIRED'].includes(gatewayError.code)
      task = updateTask(task, { nodes: task.nodes.map((candidate) => candidate.id === activeNode.id ? { ...candidate, state: 'FAILED', error: errorMessage, completedAt: now(), updatedAt: now() } : candidate) })
      task = appendObservation(task, activeNode, 'error', { code: gatewayError?.code ?? 'SKILL_GATEWAY_FAILURE', error: errorMessage })
      return persistFailedTask(task, gatewayError?.code ?? 'SKILL_GATEWAY_FAILURE', errorMessage, retryable)
    }

    const output: Record<string, unknown> = {
      ...(gatewayResult.data as unknown as Record<string, unknown>),
      lifecycle: [...gatewayResult.lifecycle],
    }
    const durationMs = Date.now() - Date.parse(startedAt)
    task = updateTask(task, {
      nodes: task.nodes.map((candidate) => candidate.id === activeNode.id
        ? { ...candidate, state: 'COMPLETED', preparedOperation: gatewayResult.prepared, output, completedAt: now(), durationMs, updatedAt: now() }
        : candidate),
    })
    const completedNode = task.nodes.find((candidate) => candidate.id === activeNode.id)!
    task = appendObservation(task, completedNode, 'tool_result', output)
    task = addMessage(task, message(task, completedNode.agentId, completedNode.agentName, completedNode.agentAvatar, 'result', `${completedNode.agentName}循光回传：${describeBusinessOutcome(completedNode, output)}`, output))
    task = await persistTask(task, 'task.node.completed', { nodeId: completedNode.id, skillId: completedNode.skillId, effectId: output['effectId'] })
    }
  }

  if (task.state === 'FAILED') return task
  if (task.nodes.some((node) => node.state === 'BLOCKED' || node.state === 'FAILED')) {
    return persistFailedTask(task, 'DEPENDENCY_OR_NODE_FAILURE', '仍有分灵体任务未完成，白泽已停止归档成功')
  }
  task = transition(task, 'OBSERVING', 'member_outputs_collected')
  task = transition(task, 'VERIFYING', 'verified_effects_reconciled')
  task = await persistTask(task, 'task.verification.started')
  for (const node of task.nodes) {
    const verified = verifyGatewayBusinessReadback(node)
    task = appendObservation(task, node, 'business_readback', { verified, effectId: node.output?.effectId })
    if (!verified) return persistFailedTask(task, 'BUSINESS_READBACK_FAILED', `「${node.title}」尚未取得业务回读证据`, true)
  }

  const deterministicSummary = aggregateBusinessReport(task)
  let finalSummary = deterministicSummary
  let summaryModel: BaizeModelEvidence | undefined
  try {
    const modelSummary = await createTaskFinalNarrative(
      executionActor,
      task,
      task.nodes.filter((node) => node.output).map((node) => describeBusinessOutcome(node, node.output ?? {})),
    )
    summaryModel = modelSummary.evidence
    finalSummary = `${modelSummary.text}\u3000\u6838\u9a8c\u5e95\u8d26\uff1a${deterministicSummary}`
  } catch {
    // Verified deterministic evidence remains the authoritative report if model narration is unavailable.
  }
  task = transition(task, 'COMPLETED', 'business_readback_verified')
  task = updateTask(task, {
    summary: finalSummary,
    leaseOwner: undefined, leaseToken: undefined, leaseExpiresAt: undefined,
    nextAttemptAt: undefined, retryEligible: false,
  })
  task = addMessage(task, message(
    task, coordinator.id, coordinator.name, coordinator.avatar, 'chat', task.summary!,
    summaryModel ? { model: summaryModel, verifiedEvidencePreserved: true } : { governedFallback: true, verifiedEvidencePreserved: true },
  ))
  return persistTask(task, 'task.completed', summaryModel ? {
    modelInvocationId: summaryModel.invocationId,
    model: summaryModel.model,
    totalTokens: summaryModel.totalTokens,
  } : { modelFallback: true })
}
export async function resumeQueuedAiTask(task: AiTaskRecord, workerId: string, leaseToken: string): Promise<AiTaskRecord> {
  if (task.state !== 'QUEUED') throw new AiRuntimeError('EXECUTION_BLOCKED', '只有已进入队列的任务可以恢复')
  if (task.leaseOwner !== workerId || task.leaseToken !== leaseToken) {
    throw new AiRuntimeError('EXECUTION_BLOCKED', '恢复作业没有持有当前任务租约')
  }
  const approved = task.approvalPolicy === 'automatic' || task.approval?.status === 'APPROVED'
  return executeTask(task, approved, true)
}

export async function createAndPlanAiTask(user: User, input: CreateAiTaskInput): Promise<AiTaskRecord> {
  const command = input.command.trim()
  const intent = classifyAiCommand(command, input.skillId, input.params)
  const built = buildAiPlan(user, command, intent, input.workflow ?? [])
  if (!built.policyAllowed) throw new AiPlanningError('PERMISSION_DENIED', `当前身份不能执行此业务能力：${built.policyReason}`)

  let task = createAiTaskRecord(user, {
    title: built.skill.name,
    command,
    intent,
    riskLevel: built.riskLevel,
    approvalPolicy: built.approvalPolicy,
    plan: built.plan,
  }, input.idempotencyKey)

  const createResult = await getAiTaskRuntimeRepository().createTask(task)
  if (!createResult.created) {
    if (createResult.task.command !== command || createResult.task.intent.skillId !== intent.skillId) {
      throw new AiRuntimeError('VERSION_CONFLICT', '同一请求标识已绑定其他任务，请刷新后重试')
    }
    return createResult.task
  }
  task = createResult.task
  task = updateTask(task, { nodes: buildNodes(task) })
  const team = getRoleAgentTeam(user.role)
  task = addMessage(task, message(task, user.id, user.name, '👤', 'chat', `下达指令：“${command}”`))
  task = addMessage(task, message(task, team.coordinator.id, team.coordinator.name, team.coordinator.avatar, 'chat', '白泽额间独目微启：指令已收。我先辨明边界、权限与真实数据来源。'))
  task = addMessage(task, message(task, team.coordinator.id, team.coordinator.name, team.coordinator.avatar, 'chat', `白泽已辨明来意，将目标拆成 ${task.nodes.length} 项可交付工作，并完成权限与风险核验。`))
  for (const node of task.nodes) {
    task = addMessage(task, message(task, team.coordinator.id, team.coordinator.name, team.coordinator.avatar, 'handover', `拟将「${node.title}」交予 ${node.agentName}；待执行预览就绪后，请你裁决。`, { nodeId: node.id, skillId: node.skillId }))
  }
  for (const state of ['AUTHENTICATED', 'CLASSIFIED', 'CONTEXT_BUILT', 'PLANNED', 'PLAN_VALIDATED', 'POLICY_CHECKED'] as AiTaskState[]) {
    task = transition(task, state, state.toLowerCase())
  }
  task = await persistTask(task, 'task.policy_checked', { nodeCount: task.nodes.length })
  try {
    const modelBrief = await createTaskIntentBrief(user, task)
    task = addMessage(task, message(
      task,
      team.coordinator.id,
      team.coordinator.name,
      team.coordinator.avatar,
      'chat',
      `\u767d\u6cfd\u5df2\u5b8c\u6210 DeepSeek \u8bed\u4e49\u7814\u5224\uff1a${modelBrief.text}\u3002\u6267\u884c\u8fb9\u754c\u4ecd\u7531\u672c\u5730\u6743\u9650\u3001\u5ba1\u6279\u548c Skill Gateway \u51b3\u5b9a\u3002`,
      { model: modelBrief.evidence, advisoryOnly: true },
    ))
    task = await persistTask(task, 'task.model_context_enriched', {
      invocationId: modelBrief.evidence.invocationId,
      provider: modelBrief.evidence.provider,
      model: modelBrief.evidence.model,
      totalTokens: modelBrief.evidence.totalTokens,
    })
  } catch {
    // Deterministic policy and Skill planning remain available under hybrid fail-closed routing.
  }

  const hasGatewayNode = task.nodes.some((node) => Boolean(getAiSkill(node.skillId)?.gatewaySkillKey))
  if (hasGatewayNode && hasEnterpriseSkillPort()) {
    try {
      task = await prepareEnterpriseNodes(task, user)
    } catch (error) {
      const gatewayError = error instanceof EnterpriseSkillGatewayError ? error : undefined
      const errorMessage = error instanceof Error ? error.message : '真实业务执行预览生成失败'
      return persistFailedTask(task, gatewayError?.code ?? 'SKILL_PREPARE_FAILED', errorMessage, gatewayError?.retryable === true)
    }
  } else if (hasGatewayNode) {
    task = addMessage(task, message(
      task,
      team.coordinator.id,
      team.coordinator.name,
      team.coordinator.avatar,
      'error',
      '真实业务后端尚未配置，因此白泽没有伪造执行预览；任务将保持失败关闭。',
      { code: 'BUSINESS_BACKEND_UNAVAILABLE', businessWriteOccurred: false }
    ))
  }

  task = transition(task, 'PREVIEWED', 'governed_preview_recorded')
  if (task.approvalPolicy !== 'automatic') {
    const approval: AiApprovalRecord = { policy: task.approvalPolicy, status: 'PENDING', requestedAt: now(), decisions: [] }
    task = updateTask(task, { approval })
    task = addMessage(task, message(task, team.coordinator.id, team.coordinator.name, team.coordinator.avatar, 'approval_request', `此事会改变真实业务数据。我已把执行预览铺在案前，需要${task.approvalPolicy === 'dual_approval' ? '两位审批人共同' : '一位审批人'}确认后，才会放出分灵体。`, { approvalPolicy: task.approvalPolicy, realPreviewReady: task.nodes.every((node) => !getAiSkill(node.skillId)?.gatewaySkillKey || Boolean(node.preparedOperation)) }))
    task = transition(task, 'AWAITING_APPROVAL', 'approval_required')
    return persistTask(task, 'task.awaiting_approval')
  }

  task = await persistTask(task, 'task.previewed')
  return executeTask(task, false, false, user)
}

export async function decideAiTask(
  user: User,
  taskId: string,
  decision: 'approve' | 'reject',
  reason?: string
): Promise<AiTaskRecord> {
  const repository = getAiTaskRuntimeRepository()
  let task = await repository.getTask(taskId, user.school_id)
  if (!task) throw new AiRuntimeError('TASK_NOT_FOUND', '未找到当前任务')
  if (!canAccessAiTask(user, task)) throw new AiRuntimeError('TASK_ACCESS_DENIED', '当前身份无权查看此任务')
  if (task.state !== 'AWAITING_APPROVAL' || !task.approval) throw new AiRuntimeError('APPROVAL_REQUIRED', '当前任务不在等待审批状态')

  const approval = task.approval
  const currentDecision = {
    userId: user.id,
    userName: user.name,
    decision: decision === 'approve' ? 'APPROVED' as const : 'REJECTED' as const,
    reason,
    decidedAt: now(),
  }
  const decisions = [...approval.decisions.filter((item) => item.userId !== user.id), currentDecision]
  task = updateTask(task, { approval: { ...approval, decisions, status: decision === 'reject' ? 'REJECTED' : approval.status } })

  if (decision === 'reject') {
    task = updateTask(task, {
      nodes: task.nodes.map((node) => ({ ...node, state: 'CANCELLED' as const, updatedAt: now() })),
      summary: reason || '人工裁决拒绝执行，白泽已收回光路，没有发生业务写入。',
    })
    task = transition(task, 'CANCELLED', 'approval_rejected')
    task = addMessage(task, message(task, 'human', user.name, '\u{1f464}', 'approval_decision', task.summary!, { decision: 'REJECTED' }))
    return persistTask(task, 'task.cancelled', { decision: 'REJECTED' })
  }

  if (approval.policy === 'dual_approval' && new Set(decisions.map((item) => item.userId)).size < 2) {
    task = updateTask(task, { approval: { ...approval, decisions, status: 'PENDING' } })
    task = addMessage(task, message(task, 'human', user.name, '\u{1f464}', 'approval_decision', '第一位审批人已落印，仍需第二位审批人确认；在此之前不会发生业务写入。', { decision: 'APPROVED', requiresSecondApproval: true }))
    return persistTask(task, 'task.approval_recorded', { approvals: decisions.length })
  }

  task = updateTask(task, { approval: { ...approval, decisions, status: 'APPROVED' } })
  task = addMessage(task, message(task, 'human', user.name, '\u{1f464}', 'approval_decision', '裁决已齐，白泽已将任务送入受控执行队列。', { decision: 'APPROVED' }))
  task = transition(task, 'QUEUED', 'approval_granted')
  task = await persistTask(task, 'task.approved', { approvals: decisions.length })
  return executeTask(task, true, false, task.ownerUserId === user.id ? user : undefined)
}

export async function cancelAiTask(user: User, taskId: string, reason = '用户已取消任务'): Promise<AiTaskRecord> {
  let task = await getAiTaskRuntimeRepository().getTask(taskId, user.school_id)
  if (!task) throw new AiRuntimeError('TASK_NOT_FOUND', '未找到当前任务')
  if (!canAccessAiTask(user, task)) throw new AiRuntimeError('TASK_ACCESS_DENIED', '当前身份无权查看此任务')
  if (!canTransitionAiTask(task.state, 'CANCELLED')) throw new AiRuntimeError('EXECUTION_BLOCKED', '当前任务状态不能取消')
  task = updateTask(task, {
    nodes: task.nodes.map((node) => ['PENDING', 'RUNNING'].includes(node.state)
      ? { ...node, state: 'CANCELLED' as const, error: reason, updatedAt: now() }
      : node),
    summary: reason,
    leaseOwner: undefined,
    leaseToken: undefined,
    leaseExpiresAt: undefined,
  })
  task = transition(task, 'CANCELLED', 'user_cancelled')
  task = addMessage(task, message(task, 'human', user.name, '\u{1f464}', 'approval_decision', reason, { decision: 'CANCELLED' }))
  return persistTask(task, 'task.cancelled', { decision: 'CANCELLED' })
}

export async function getAccessibleAiTask(user: User, taskId: string): Promise<AiTaskRecord> {
  const task = await getAiTaskRuntimeRepository().getTask(taskId, user.school_id)
  if (!task) throw new AiRuntimeError('TASK_NOT_FOUND', '未找到当前任务')
  if (!canAccessAiTask(user, task)) throw new AiRuntimeError('TASK_ACCESS_DENIED', '当前身份无权查看此任务')
  return task
}

export async function listAccessibleAiTasks(user: User, state?: AiTaskState): Promise<AiTaskRecord[]> {
  if (!user.school_id) return []
  return getAiTaskRuntimeRepository().listTasks({
    schoolId: user.school_id,
    ownerUserId: isAiOperationsAdmin(user) ? undefined : user.id,
    state,
  })
}
