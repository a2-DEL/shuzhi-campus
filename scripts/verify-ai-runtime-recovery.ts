import './assert-isolated-test-environment.mjs'
import { getDevelopmentUser } from '@/lib/development-users'
import { getRoleAgentTeam } from '@/lib/ai/runtime/agent-catalog'
import { buildAiPlan, classifyAiCommand } from '@/lib/ai/runtime/planner'
import { recoverNextAiTask } from '@/lib/ai/runtime/recovery'
import {
  AiTaskRepositoryError,
  clearAiRuntimeForTests,
  getAiTaskRuntimeRepository,
  getDevelopmentAiRuntimeDiagnostics,
} from '@/lib/ai/runtime/repository'
import { createAiTaskRecord } from '@/lib/ai/runtime/store'
import { transitionAiTask } from '@/lib/ai/runtime/state-machine'
import { AiTaskRecord, AiTaskState } from '@/lib/ai/runtime/types'
import { User } from '@/types'

// This verifier targets deterministic runtime state; production uses the PostgreSQL adapter.
process.env.AI_DATABASE_MODE = 'memory'

function makeInterruptedTask(
  user: User,
  key: string,
  finalState: 'RUNNING' | 'FAILED',
  attemptCount: number,
  maxAttempts: number,
  retryEligible: boolean
): AiTaskRecord {
  const command = `Recovery verifier ${key}`
  const intent = classifyAiCommand(command, 'query_repairs')
  const built = buildAiPlan(user, command, intent)
  let task = createAiTaskRecord(user, {
    title: 'Recovery verifier task',
    command,
    intent,
    riskLevel: built.riskLevel,
    approvalPolicy: built.approvalPolicy,
    plan: built.plan,
  }, key)
  const subtask = built.plan.subtasks[0]
  const team = getRoleAgentTeam(user.role)
  const agent = [team.coordinator, ...team.members].find((candidate) => candidate.id === subtask.preferredAgent) ?? team.coordinator
  const timestamp = new Date().toISOString()
  task = {
    ...task,
    attemptCount,
    maxAttempts,
    retryEligible,
    nodes: [{
      id: subtask.id,
      taskId: task.id,
      agentId: agent.id,
      agentName: agent.name,
      agentAvatar: agent.avatar,
      title: subtask.title,
      skillId: subtask.skillId,
      state: finalState === 'RUNNING' ? 'RUNNING' : 'FAILED',
      dependsOn: [],
      input: {},
      error: finalState === 'FAILED' ? 'retryable verifier failure' : undefined,
      attemptCount,
      maxAttempts,
      startedAt: timestamp,
      completedAt: finalState === 'FAILED' ? timestamp : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
    }],
  }
  for (const state of ['AUTHENTICATED', 'CLASSIFIED', 'CONTEXT_BUILT', 'PLANNED', 'PLAN_VALIDATED', 'POLICY_CHECKED', 'PREVIEWED', 'QUEUED', 'RUNNING'] as AiTaskState[]) {
    task = transitionAiTask(task, state, `verifier_${state.toLowerCase()}`)
  }
  if (finalState === 'FAILED') task = transitionAiTask(task, 'FAILED', 'verifier_retryable_failure')
  return task
}

async function main() {
  let assertions = 0
  function expect(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
    assertions += 1
  }

  clearAiRuntimeForTests()
  const admin = getDevelopmentUser('admin')
  expect(admin, 'development admin missing')
  const repository = getAiTaskRuntimeRepository()
  const running = makeInterruptedTask(admin, 'recovery-running-1', 'RUNNING', 1, 3, false)
  await repository.createTask(running)

  const recoveryAt = new Date(Date.now() + 1_000)
  const recovered = await recoverNextAiTask('recovery-worker-1', { leaseSeconds: 60, resume: false, at: recoveryAt })
  expect(recovered.status === 'requeued' && recovered.task, 'interrupted task was not requeued')
  expect(recovered.task.state === 'QUEUED', `recovered state mismatch: ${recovered.task.state}`)
  expect(recovered.task.nodes[0].state === 'PENDING', 'interrupted node was not reset to pending')
  expect(recovered.task.attemptCount === 2, 'claim did not increment attempt count exactly once')
  expect(recovered.task.version === 3, `expected create/claim/recovery version 3, got ${recovered.task.version}`)
  expect(recovered.task.leaseOwner === 'recovery-worker-1' && Boolean(recovered.task.leaseToken), 'recovered task lease missing')
  expect(recovered.task.stateHistory.some((item) => item.reason === 'restart_recovery'), 'restart recovery transition was not recorded')

  let leaseLost = false
  try {
    await repository.renewLease(recovered.task.id, admin.school_id!, '00000000-0000-4000-8000-000000000999', 120)
  } catch (error) {
    leaseLost = error instanceof AiTaskRepositoryError && error.code === 'LEASE_LOST'
  }
  expect(leaseLost, 'invalid lease token was accepted')
  const renewed = await repository.renewLease(recovered.task.id, admin.school_id!, recovered.task.leaseToken!, 120)
  expect(renewed.version === 4 && renewed.leaseExpiresAt !== recovered.task.leaseExpiresAt, 'valid lease renewal failed')
  const duplicateClaim = await recoverNextAiTask('recovery-worker-2', { leaseSeconds: 60, resume: false, at: recoveryAt })
  expect(duplicateClaim.status === 'no_task', 'active lease did not prevent a duplicate claim')

  const exhausted = makeInterruptedTask(admin, 'recovery-dead-letter-1', 'FAILED', 3, 3, true)
  await repository.createTask(exhausted)
  const noExhaustedClaim = await recoverNextAiTask('recovery-worker-3', { leaseSeconds: 60, resume: false, at: new Date(recoveryAt.getTime() + 1_000) })
  expect(noExhaustedClaim.status === 'no_task', 'exhausted task should not be claimed')
  const deadLettered = await repository.getTask(exhausted.id, admin.school_id)
  expect(deadLettered?.deadLetteredAt && deadLettered.blocker?.code === 'MAX_ATTEMPTS_EXCEEDED', 'exhausted task was not dead-lettered')
  expect(deadLettered?.retryEligible === false && deadLettered.version === 2, 'dead-letter transition was not versioned or retry flag remained set')

  const nonRetryable = makeInterruptedTask(admin, 'recovery-non-retryable-1', 'FAILED', 1, 3, false)
  await repository.createTask(nonRetryable)
  const nonRetryClaim = await recoverNextAiTask('recovery-worker-4', { leaseSeconds: 60, resume: false, at: new Date(recoveryAt.getTime() + 2_000) })
  expect(nonRetryClaim.status === 'no_task', 'non-retryable failed task was claimed')
  const storedNonRetryable = await repository.getTask(nonRetryable.id, admin.school_id)
  expect(!storedNonRetryable?.deadLetteredAt, 'non-retryable failure was incorrectly dead-lettered')

  const diagnostics = getDevelopmentAiRuntimeDiagnostics()
  const eventTypes = diagnostics.outbox.map((event) => event.eventType)
  expect(eventTypes.includes('task.claimed') && eventTypes.includes('task.recovered'), 'claim/recovery outbox events missing')
  expect(eventTypes.includes('task.dead_lettered'), 'dead-letter outbox event missing')
  console.log(`PASS AI recovery verifier: assertions=${assertions} outbox=${diagnostics.outbox.length} recoveredVersion=${recovered.task.version}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
