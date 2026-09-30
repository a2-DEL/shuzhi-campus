import { AiTaskRecord, AiTaskState } from './types'

const TRANSITIONS: Record<AiTaskState, readonly AiTaskState[]> = {
  RECEIVED: ['AUTHENTICATED', 'FAILED', 'CANCELLED'],
  AUTHENTICATED: ['CLASSIFIED', 'FAILED', 'CANCELLED'],
  CLASSIFIED: ['CONTEXT_BUILT', 'FAILED', 'CANCELLED'],
  CONTEXT_BUILT: ['PLANNED', 'FAILED', 'CANCELLED'],
  PLANNED: ['PLAN_VALIDATED', 'FAILED', 'CANCELLED'],
  PLAN_VALIDATED: ['POLICY_CHECKED', 'FAILED', 'CANCELLED'],
  POLICY_CHECKED: ['PREVIEWED', 'FAILED', 'CANCELLED'],
  PREVIEWED: ['AWAITING_APPROVAL', 'QUEUED', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: ['QUEUED', 'FAILED', 'CANCELLED'],
  QUEUED: ['RUNNING', 'FAILED', 'CANCELLED'],
  RUNNING: ['OBSERVING', 'REPLANNING', 'VERIFYING', 'PARTIAL', 'FAILED', 'CANCELLED'],
  OBSERVING: ['RUNNING', 'REPLANNING', 'VERIFYING', 'PARTIAL', 'FAILED', 'CANCELLED'],
  REPLANNING: ['PLAN_VALIDATED', 'RUNNING', 'PARTIAL', 'FAILED', 'CANCELLED'],
  VERIFYING: ['COMPLETED', 'PARTIAL', 'FAILED', 'COMPENSATED'],
  COMPLETED: [],
  PARTIAL: ['REPLANNING', 'VERIFYING', 'COMPENSATED'],
  FAILED: ['REPLANNING', 'COMPENSATED'],
  CANCELLED: [],
  COMPENSATED: [],
}

export class AiStateTransitionError extends Error {
  constructor(readonly from: AiTaskState, readonly to: AiTaskState) {
    super(`Invalid AI task transition: ${from} -> ${to}`)
    this.name = 'AiStateTransitionError'
  }
}

export function canTransitionAiTask(from: AiTaskState, to: AiTaskState): boolean {
  return TRANSITIONS[from].includes(to)
}

export function transitionAiTask(
  task: AiTaskRecord,
  to: AiTaskState,
  reason: string,
  at = new Date().toISOString()
): AiTaskRecord {
  if (task.state === to) return task
  if (!canTransitionAiTask(task.state, to)) {
    throw new AiStateTransitionError(task.state, to)
  }

  const next: AiTaskRecord = {
    ...task,
    state: to,
    updatedAt: at,
    stateHistory: [...task.stateHistory, { from: task.state, to, at, reason }],
  }

  if (to === 'RUNNING' && !next.startedAt) next.startedAt = at
  if (['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'COMPENSATED'].includes(to)) {
    next.completedAt = at
  }
  return next
}
