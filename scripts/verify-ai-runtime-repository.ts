import './assert-isolated-test-environment.mjs'
import { getDevelopmentUser } from '@/lib/development-users'
import { createAndPlanAiTask, AiRuntimeError } from '@/lib/ai/runtime/orchestrator'
import {
  AiTaskRepositoryError,
  clearAiRuntimeForTests,
  getAiTaskRuntimeRepository,
  getDevelopmentAiRuntimeDiagnostics,
} from '@/lib/ai/runtime/repository'

// This verifier targets the deterministic in-memory repository, not the production adapter.
process.env.AI_DATABASE_MODE = 'memory'

async function main() {
  let assertions = 0
  function expect(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
    assertions += 1
  }

  clearAiRuntimeForTests()
  const admin = getDevelopmentUser('admin')
  expect(admin, 'development admin missing')
  const command = 'Repository idempotency verification'
  const first = await createAndPlanAiTask(admin, {
    command,
    skillId: 'smart_dispatch',
    idempotencyKey: 'ai-repository-verifier-1',
  })
  expect(first.state === 'AWAITING_APPROVAL', 'first task must be an approval preview')
  expect(first.version === 3, `expected create, policy checkpoint and preview versions, got ${first.version}`)

  const duplicate = await createAndPlanAiTask(admin, {
    command,
    skillId: 'smart_dispatch',
    idempotencyKey: 'ai-repository-verifier-1',
  })
  expect(duplicate.id === first.id && duplicate.version === first.version, 'idempotent retry created or changed a task')
  let diagnostics = getDevelopmentAiRuntimeDiagnostics()
  expect(diagnostics.taskCount === 1, 'idempotent retry created a second task')
  expect(diagnostics.outbox.length === 3, 'idempotent retry emitted duplicate outbox events')

  let keyConflict = false
  try {
    await createAndPlanAiTask(admin, {
      command: 'A different request reusing the key',
      skillId: 'batch_dispatch',
      idempotencyKey: 'ai-repository-verifier-1',
    })
  } catch (error) {
    keyConflict = error instanceof AiRuntimeError && error.code === 'VERSION_CONFLICT'
  }
  expect(keyConflict, 'idempotency key reuse for a different request was not rejected')

  const repository = getAiTaskRuntimeRepository()
  const stale = await repository.getTask(first.id, admin.school_id)
  expect(stale, 'stored task missing')
  const saved = await repository.saveTask({ ...stale, summary: 'optimistic update' }, {
    expectedVersion: stale.version,
    eventType: 'task.verifier.updated',
  })
  expect(saved.version === stale.version + 1, 'optimistic save did not increment version')

  let versionConflict = false
  try {
    await repository.saveTask({ ...stale, summary: 'stale update' }, {
      expectedVersion: stale.version,
      eventType: 'task.verifier.stale',
    })
  } catch (error) {
    versionConflict = error instanceof AiTaskRepositoryError && error.code === 'VERSION_CONFLICT'
  }
  expect(versionConflict, 'stale optimistic write was not rejected')

  const listed = await repository.listTasks({ schoolId: admin.school_id!, ownerUserId: admin.id, state: 'AWAITING_APPROVAL' })
  expect(listed.length === 1 && listed[0].id === first.id, 'tenant/owner task listing mismatch')
  diagnostics = getDevelopmentAiRuntimeDiagnostics()
  expect(diagnostics.outbox.length === 4, 'successful optimistic update must emit one outbox event')
  expect(diagnostics.auditCount === 4, 'audit event count mismatch')
  console.log(`PASS AI repository verifier: assertions=${assertions} versions=${first.version}->${saved.version} outbox=${diagnostics.outbox.length}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
