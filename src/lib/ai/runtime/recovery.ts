import { resumeQueuedAiTask } from './orchestrator'
import { transitionAiTask } from './state-machine'
import { AiTaskRepositoryError, getAiTaskRuntimeRepository } from './repository'
import { AiTaskRecord } from './types'

export interface AiRecoveryOptions {
  leaseSeconds?: number
  resume?: boolean
  at?: Date
}

export interface AiRecoveryResult {
  status: 'no_task' | 'requeued' | 'resumed'
  task?: AiTaskRecord
}

function requeueInterruptedTask(claimed: AiTaskRecord): AiTaskRecord {
  let task = claimed
  if (task.state === 'VERIFYING') {
    task = transitionAiTask(task, 'FAILED', 'verification_interrupted_by_restart')
    task = transitionAiTask(task, 'REPLANNING', 'restart_recovery')
  } else if (task.state === 'RUNNING' || task.state === 'OBSERVING' || task.state === 'FAILED') {
    task = transitionAiTask(task, 'REPLANNING', 'restart_recovery')
  }

  if (task.state === 'REPLANNING') {
    task = transitionAiTask(task, 'PLAN_VALIDATED', 'recovered_plan_validated')
    task = transitionAiTask(task, 'POLICY_CHECKED', 'recovered_policy_checked')
    task = transitionAiTask(task, 'PREVIEWED', 'recovered_preview_revalidated')
    task = transitionAiTask(task, 'QUEUED', 'recovered_task_requeued')
  }
  if (task.state !== 'QUEUED') {
    throw new AiTaskRepositoryError('INVALID_RECORD', `Claimed task state ${task.state} cannot be recovered`)
  }

  const recoveredAt = new Date().toISOString()
  return {
    ...task,
    nodes: task.nodes.map((node) => ['RUNNING', 'FAILED', 'BLOCKED'].includes(node.state)
      ? {
          ...node,
          state: 'PENDING' as const,
          output: undefined,
          error: undefined,
          startedAt: undefined,
          completedAt: undefined,
          durationMs: undefined,
          nextAttemptAt: undefined,
          leaseOwner: undefined,
          leaseToken: undefined,
          leaseExpiresAt: undefined,
          updatedAt: recoveredAt,
        }
      : node),
    blocker: undefined,
    summary: 'Interrupted task recovered, revalidated and queued',
    nextAttemptAt: undefined,
    retryEligible: false,
    completedAt: undefined,
    updatedAt: recoveredAt,
  }
}

export async function recoverNextAiTask(
  workerId: string,
  options: AiRecoveryOptions = {}
): Promise<AiRecoveryResult> {
  const normalizedWorkerId = workerId.trim()
  if (!normalizedWorkerId || normalizedWorkerId.length > 160) {
    throw new AiTaskRepositoryError('INVALID_RECORD', 'Recovery worker id must contain between 1 and 160 characters')
  }
  const repository = getAiTaskRuntimeRepository()
  const claimed = await repository.claimRecoverableTask(
    normalizedWorkerId,
    options.leaseSeconds ?? 60,
    options.at ?? new Date()
  )
  if (!claimed) return { status: 'no_task' }
  if (!claimed.leaseToken) throw new AiTaskRepositoryError('INVALID_RECORD', 'Claimed task is missing a lease token')

  const recovered = requeueInterruptedTask(claimed)
  const saved = await repository.saveTask(recovered, {
    expectedVersion: recovered.version,
    eventType: 'task.recovered',
    eventPayload: {
      workerId: normalizedWorkerId,
      leaseToken: recovered.leaseToken,
      attemptCount: recovered.attemptCount,
    },
  })
  if (!options.resume) return { status: 'requeued', task: saved }
  const resumed = await resumeQueuedAiTask(saved, normalizedWorkerId, saved.leaseToken!)
  return { status: 'resumed', task: resumed }
}

export async function recoverAiTasks(
  workerId: string,
  limit = 1,
  options: AiRecoveryOptions = {}
): Promise<AiRecoveryResult[]> {
  const boundedLimit = Math.max(1, Math.min(20, Math.floor(limit)))
  const results: AiRecoveryResult[] = []
  for (let index = 0; index < boundedLimit; index += 1) {
    const result = await recoverNextAiTask(workerId, options)
    if (result.status === 'no_task') break
    results.push(result)
  }
  return results
}
