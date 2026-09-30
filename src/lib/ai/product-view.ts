import { getAiSkill } from '@/lib/ai/runtime/planner'
import type { AiTaskRecord, AiTaskState } from '@/lib/ai/runtime/types'
import type { AiProductEffect, AiProductNode, AiProductStatus, AiProductTask } from './product-types'
import { getEnterpriseSkillContract } from './skills/registry'
import { taskStateLabel } from './presentation'

const PLANNING_STATES = new Set<AiTaskState>(['RECEIVED', 'AUTHENTICATED', 'CLASSIFIED', 'CONTEXT_BUILT', 'PLANNED', 'PLAN_VALIDATED', 'POLICY_CHECKED', 'PREVIEWED'])
const RUNNING_STATES = new Set<AiTaskState>(['RUNNING', 'OBSERVING', 'REPLANNING', 'VERIFYING'])

function productStatus(state: AiTaskState): AiProductStatus {
  if (PLANNING_STATES.has(state)) return 'planning'
  if (state === 'AWAITING_APPROVAL') return 'awaiting_approval'
  if (state === 'QUEUED') return 'queued'
  if (RUNNING_STATES.has(state)) return 'running'
  if (state === 'COMPLETED') return 'verified'
  if (state === 'CANCELLED' || state === 'COMPENSATED') return 'cancelled'
  return 'failed'
}

function redact(input: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const copy = structuredClone(input)
  for (const field of fields) {
    if (field in copy) copy[field] = '[REDACTED]'
  }
  return copy
}

function effectFromOutput(output?: Record<string, unknown>): AiProductEffect | undefined {
  if (!output || typeof output.effectId !== 'string') return undefined
  const result = output.result && typeof output.result === 'object' && !Array.isArray(output.result)
    ? output.result as Record<string, unknown>
    : {}
  const verification = output.verification && typeof output.verification === 'object' && !Array.isArray(output.verification)
    ? output.verification as Record<string, unknown>
    : {}
  return {
    id: output.effectId,
    status: typeof output.status === 'string' ? output.status : 'UNKNOWN',
    targetType: typeof output.targetType === 'string' ? output.targetType : undefined,
    targetId: typeof output.targetId === 'string' || output.targetId === null ? output.targetId : undefined,
    idempotentReplay: output.idempotentReplay === true,
    result,
    verification,
    lifecycle: Array.isArray(output.lifecycle) ? output.lifecycle.filter((item): item is string => typeof item === 'string') : [],
  }
}

function nodeView(node: AiTaskRecord['nodes'][number], requestedInput: Record<string, unknown>): AiProductNode {
  const runtimeSkill = getAiSkill(node.skillId)
  const contract = runtimeSkill?.gatewaySkillKey ? getEnterpriseSkillContract(runtimeSkill.gatewaySkillKey) : undefined
  const prepared = node.preparedOperation
  return {
    id: node.id,
    title: node.title,
    skillId: node.skillId,
    skillKey: contract?.key,
    agent: { id: node.agentId, name: node.agentName, avatar: node.agentAvatar },
    state: node.state,
    dependsOn: [...node.dependsOn],
    input: redact(node.input, contract?.auditPolicy.redactFields ?? []),
    requestedInput: redact(requestedInput, contract?.auditPolicy.redactFields ?? []),
    preview: prepared ? {
      id: prepared.previewId,
      skillKey: prepared.skillKey,
      ready: true,
      inputHash: prepared.inputHash,
      snapshotHash: prepared.snapshotHash,
      resourceScope: prepared.resourceScope as unknown as Record<string, unknown>,
      summary: prepared.preview,
      expiresAt: prepared.expiresAt,
    } : undefined,
    effect: effectFromOutput(node.output),
    error: node.error,
    attempts: { current: node.attemptCount, maximum: node.maxAttempts },
    timing: { startedAt: node.startedAt, completedAt: node.completedAt, durationMs: node.durationMs },
  }
}

export function toAiProductTask(task: AiTaskRecord): AiProductTask {
  const runtimeSkill = getAiSkill(task.intent.skillId)
  const approvedCount = new Set((task.approval?.decisions ?? []).filter((item) => item.decision === 'APPROVED').map((item) => item.userId)).size
  const requiredCount = task.approvalPolicy === 'dual_approval' ? 2 : task.approvalPolicy === 'single_approval' ? 1 : 0
  return {
    id: task.id,
    version: task.version,
    title: task.title,
    command: task.command,
    state: task.state,
    status: productStatus(task.state),
    owner: { id: task.ownerUserId, name: task.ownerUserName, role: task.ownerRole, schoolId: task.schoolId },
    skill: {
      id: task.intent.skillId,
      key: runtimeSkill?.gatewaySkillKey,
      name: runtimeSkill?.name ?? task.intent.skillId,
      capability: runtimeSkill?.capability ?? 'unknown',
    },
    riskLevel: task.riskLevel,
    approval: {
      policy: task.approvalPolicy,
      status: requiredCount === 0 ? 'NOT_REQUIRED' : task.approval?.status ?? 'PENDING',
      requiredCount,
      approvedCount,
      requestedAt: task.approval?.requestedAt,
      decisions: (task.approval?.decisions ?? []).map((item) => ({ ...item })),
    },
    plan: {
      goal: task.plan.goal,
      assumptions: task.plan.assumptions.map((item) => ({ ...item })),
      completionCriteria: task.plan.completionCriteria.map((item) => ({ ...item })),
      budget: { ...task.plan.budget },
      executionMode: task.plan.executionMode,
    },
    nodes: task.nodes.map((node) => nodeView(node, task.plan.subtasks.find((subtask) => subtask.id === node.id)?.inputParams ?? {})),
    messages: task.messages.map((item) => ({ ...item, data: item.data ? structuredClone(item.data) : undefined })),
    timeline: task.stateHistory.map((item) => ({ state: item.to, label: taskStateLabel(item.to), at: item.at, reason: item.reason })),
    observations: task.observations.map((item) => ({ id: item.id, nodeId: item.nodeId, kind: item.kind, payload: structuredClone(item.payload), createdAt: item.createdAt })),
    summary: task.summary,
    blocker: task.blocker ? { ...task.blocker } : undefined,
    timestamps: { createdAt: task.createdAt, updatedAt: task.updatedAt, startedAt: task.startedAt, completedAt: task.completedAt },
  }
}
