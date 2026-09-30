import { randomUUID } from 'node:crypto'
import { User } from '@/types'
import { AiTaskRecord } from './types'

export function createTaskId(): string {
  return randomUUID()
}

export function createAiTaskRecord(
  user: User,
  task: Omit<
    AiTaskRecord,
    | 'id'
    | 'idempotencyKey'
    | 'version'
    | 'ownerUserId'
    | 'ownerUserName'
    | 'ownerRole'
    | 'schoolId'
    | 'createdAt'
    | 'updatedAt'
    | 'state'
    | 'stateHistory'
    | 'nodes'
    | 'observations'
    | 'messages'
    | 'attemptCount'
    | 'maxAttempts'
    | 'retryEligible'
  >,
  idempotencyKey: string = randomUUID()
): AiTaskRecord {
  if (!user.school_id) throw new Error('Authenticated user is missing school scope')
  const createdAt = new Date().toISOString()
  return {
    ...task,
    id: createTaskId(),
    idempotencyKey,
    version: 1,
    ownerUserId: user.id,
    ownerUserName: user.name,
    ownerRole: user.role,
    schoolId: user.school_id,
    state: 'RECEIVED',
    nodes: [],
    observations: [],
    messages: [],
    stateHistory: [{ to: 'RECEIVED', at: createdAt, reason: 'task_created' }],
    attemptCount: 0,
    maxAttempts: 3,
    retryEligible: false,
    createdAt,
    updatedAt: createdAt,
  }
}

export { canAccessAiTask, clearAiRuntimeForTests } from './repository'
