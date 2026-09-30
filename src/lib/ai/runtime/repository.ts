import { randomUUID } from 'node:crypto'
import { getSupabaseAdminClient, hasSupabaseAdminCredentials } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl, isDatabaseMemoryMode } from '@/storage/database/postgres'
import { UserRole } from '@/types'
import { isAiOperationsAdmin } from '@/lib/ai/operations/access'
import { AI_TASK_STATES, AiTaskRecord, AiTaskState } from './types'

export class AiTaskRepositoryError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'VERSION_CONFLICT' | 'LEASE_LOST' | 'PERSISTENCE_UNAVAILABLE' | 'INVALID_RECORD',
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'AiTaskRepositoryError'
  }
}

export interface AiTaskListFilters {
  schoolId: string
  ownerUserId?: string
  ownerRole?: UserRole
  state?: AiTaskState
}

export interface AiTaskSaveOptions {
  expectedVersion: number
  eventType: string
  eventPayload?: Record<string, unknown>
}

export interface AiTaskCreateResult {
  task: AiTaskRecord
  created: boolean
}

export interface AiTaskRuntimeRepository {
  createTask(task: AiTaskRecord, eventType?: string): Promise<AiTaskCreateResult>
  getTask(taskId: string, schoolId?: string): Promise<AiTaskRecord | null>
  listTasks(filters: AiTaskListFilters): Promise<AiTaskRecord[]>
  saveTask(task: AiTaskRecord, options: AiTaskSaveOptions): Promise<AiTaskRecord>
  claimRecoverableTask(workerId: string, leaseSeconds?: number, at?: Date): Promise<AiTaskRecord | null>
  renewLease(taskId: string, schoolId: string, leaseToken: string, leaseSeconds?: number): Promise<AiTaskRecord>
}

export interface DevelopmentOutboxEvent {
  id: string
  aggregateId: string
  eventType: string
  deduplicationKey: string
  payload: Record<string, unknown>
  createdAt: string
}

interface DevelopmentAuditEvent {
  taskId: string
  eventType: string
  beforeState?: AiTaskState
  afterState: AiTaskState
  version: number
  createdAt: string
}

interface DevelopmentRuntimeState {
  tasks: Map<string, AiTaskRecord>
  idempotencyIndex: Map<string, string>
  outbox: Map<string, DevelopmentOutboxEvent>
  audit: DevelopmentAuditEvent[]
}

type RuntimeGlobal = typeof globalThis & {
  __SHUZHIXINGTU_DURABLE_AI_RUNTIME__?: DevelopmentRuntimeState
}

const RECOVERABLE_STATES = new Set<AiTaskState>(['QUEUED', 'RUNNING', 'OBSERVING', 'REPLANNING', 'VERIFYING', 'FAILED'])
const ROLE_VALUES = new Set<string>(Object.values(UserRole))
const STATE_VALUES = new Set<string>(AI_TASK_STATES)

function getDevelopmentState(): DevelopmentRuntimeState {
  const runtime = globalThis as RuntimeGlobal
  if (!runtime.__SHUZHIXINGTU_DURABLE_AI_RUNTIME__) {
    runtime.__SHUZHIXINGTU_DURABLE_AI_RUNTIME__ = {
      tasks: new Map(),
      idempotencyIndex: new Map(),
      outbox: new Map(),
      audit: [],
    }
  }
  return runtime.__SHUZHIXINGTU_DURABLE_AI_RUNTIME__
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneTask(task: AiTaskRecord): AiTaskRecord {
  return JSON.parse(JSON.stringify(task)) as AiTaskRecord
}

function normalizeTask(value: unknown): AiTaskRecord {
  if (!isRecord(value)) throw new AiTaskRepositoryError('INVALID_RECORD', 'AI task snapshot is not an object')
  if (typeof value.id !== 'string' || typeof value.schoolId !== 'string' || typeof value.ownerUserId !== 'string') {
    throw new AiTaskRepositoryError('INVALID_RECORD', 'AI task snapshot identity is invalid')
  }
  if (typeof value.state !== 'string' || !STATE_VALUES.has(value.state)) {
    throw new AiTaskRepositoryError('INVALID_RECORD', 'AI task snapshot state is invalid')
  }
  if (typeof value.ownerRole !== 'string' || !ROLE_VALUES.has(value.ownerRole)) {
    throw new AiTaskRepositoryError('INVALID_RECORD', 'AI task snapshot role is invalid')
  }
  if (!Array.isArray(value.nodes) || !Array.isArray(value.messages) || !Array.isArray(value.observations)) {
    throw new AiTaskRepositoryError('INVALID_RECORD', 'AI task snapshot collections are invalid')
  }
  if (typeof value.version !== 'number' || value.version < 1 || !Number.isInteger(value.version)) {
    throw new AiTaskRepositoryError('INVALID_RECORD', 'AI task snapshot version is invalid')
  }
  return cloneTask(value as unknown as AiTaskRecord)
}

function idempotencyIndexKey(task: Pick<AiTaskRecord, 'schoolId' | 'ownerUserId' | 'idempotencyKey'>): string {
  return `${task.schoolId}:${task.ownerUserId}:${task.idempotencyKey}`
}

function addDevelopmentEvent(
  state: DevelopmentRuntimeState,
  task: AiTaskRecord,
  eventType: string,
  payload: Record<string, unknown>,
  version = task.version
): void {
  const deduplicationKey = `${task.id}:${version}:${eventType}`
  if (!state.outbox.has(deduplicationKey)) {
    state.outbox.set(deduplicationKey, {
      id: randomUUID(),
      aggregateId: task.id,
      eventType,
      deduplicationKey,
      payload,
      createdAt: new Date().toISOString(),
    })
  }
}

class DevelopmentAiTaskRuntimeRepository implements AiTaskRuntimeRepository {
  async createTask(task: AiTaskRecord, eventType = 'task.created'): Promise<AiTaskCreateResult> {
    const state = getDevelopmentState()
    const normalized = normalizeTask(task)
    const key = idempotencyIndexKey(normalized)
    const existingId = state.idempotencyIndex.get(key)
    if (existingId) {
      const existing = state.tasks.get(existingId)
      if (!existing) throw new AiTaskRepositoryError('INVALID_RECORD', 'Idempotency index references a missing task')
      return { task: cloneTask(existing), created: false }
    }
    if (state.tasks.has(normalized.id)) throw new AiTaskRepositoryError('VERSION_CONFLICT', 'AI task id already exists')
    state.tasks.set(normalized.id, cloneTask(normalized))
    state.idempotencyIndex.set(key, normalized.id)
    addDevelopmentEvent(state, normalized, eventType, { task: cloneTask(normalized) })
    state.audit.push({ taskId: normalized.id, eventType, afterState: normalized.state, version: normalized.version, createdAt: normalized.createdAt })
    return { task: cloneTask(normalized), created: true }
  }

  async getTask(taskId: string, schoolId?: string): Promise<AiTaskRecord | null> {
    const task = getDevelopmentState().tasks.get(taskId)
    if (!task || (schoolId && task.schoolId !== schoolId)) return null
    return cloneTask(task)
  }

  async listTasks(filters: AiTaskListFilters): Promise<AiTaskRecord[]> {
    return [...getDevelopmentState().tasks.values()]
      .filter((task) => task.schoolId === filters.schoolId)
      .filter((task) => !filters.ownerUserId || task.ownerUserId === filters.ownerUserId)
      .filter((task) => !filters.ownerRole || task.ownerRole === filters.ownerRole)
      .filter((task) => !filters.state || task.state === filters.state)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(cloneTask)
  }

  async saveTask(task: AiTaskRecord, options: AiTaskSaveOptions): Promise<AiTaskRecord> {
    const state = getDevelopmentState()
    const current = state.tasks.get(task.id)
    if (!current || current.schoolId !== task.schoolId) throw new AiTaskRepositoryError('NOT_FOUND', 'AI task not found')
    if (current.version !== options.expectedVersion || task.version !== options.expectedVersion) {
      throw new AiTaskRepositoryError('VERSION_CONFLICT', `Expected version ${options.expectedVersion}, found ${current.version}`)
    }
    const saved = normalizeTask({ ...task, version: options.expectedVersion + 1, updatedAt: new Date().toISOString() })
    state.tasks.set(saved.id, cloneTask(saved))
    addDevelopmentEvent(state, saved, options.eventType, { task: cloneTask(saved), event: options.eventPayload ?? {} })
    state.audit.push({
      taskId: saved.id,
      eventType: options.eventType,
      beforeState: current.state,
      afterState: saved.state,
      version: saved.version,
      createdAt: saved.updatedAt,
    })
    return cloneTask(saved)
  }

  async claimRecoverableTask(workerId: string, leaseSeconds = 60, at = new Date()): Promise<AiTaskRecord | null> {
    if (leaseSeconds < 10 || leaseSeconds > 600) throw new AiTaskRepositoryError('INVALID_RECORD', 'Lease duration must be between 10 and 600 seconds')
    const state = getDevelopmentState()
    const atMs = at.getTime()
    for (const current of state.tasks.values()) {
      if (
        RECOVERABLE_STATES.has(current.state) &&
        (current.state !== 'FAILED' || current.retryEligible) &&
        !current.deadLetteredAt &&
        current.attemptCount >= current.maxAttempts
      ) {
        const deadLettered = normalizeTask({
          ...current,
          version: current.version + 1,
          deadLetteredAt: at.toISOString(),
          retryEligible: false,
          blocker: { code: 'MAX_ATTEMPTS_EXCEEDED', message: 'Task moved to dead letter after exhausting attempts' },
          updatedAt: at.toISOString(),
        })
        state.tasks.set(deadLettered.id, cloneTask(deadLettered))
        addDevelopmentEvent(state, deadLettered, 'task.dead_lettered', { task: cloneTask(deadLettered) })
      }
    }

    const candidate = [...state.tasks.values()]
      .filter((task) => RECOVERABLE_STATES.has(task.state))
      .filter((task) => task.state !== 'FAILED' || task.retryEligible)
      .filter((task) => !task.deadLetteredAt && task.attemptCount < task.maxAttempts)
      .filter((task) => !task.nextAttemptAt || Date.parse(task.nextAttemptAt) <= atMs)
      .filter((task) => !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt) <= atMs)
      .sort((a, b) => (a.nextAttemptAt ?? a.createdAt).localeCompare(b.nextAttemptAt ?? b.createdAt))[0]
    if (!candidate) return null

    const claimed = normalizeTask({
      ...candidate,
      version: candidate.version + 1,
      attemptCount: candidate.attemptCount + 1,
      retryEligible: false,
      leaseOwner: workerId,
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(atMs + leaseSeconds * 1000).toISOString(),
      updatedAt: at.toISOString(),
    })
    state.tasks.set(claimed.id, cloneTask(claimed))
    addDevelopmentEvent(state, claimed, 'task.claimed', {
      taskId: claimed.id,
      workerId,
      leaseToken: claimed.leaseToken,
      attemptCount: claimed.attemptCount,
    })
    return cloneTask(claimed)
  }

  async renewLease(taskId: string, schoolId: string, leaseToken: string, leaseSeconds = 60): Promise<AiTaskRecord> {
    if (leaseSeconds < 10 || leaseSeconds > 600) throw new AiTaskRepositoryError('INVALID_RECORD', 'Lease duration must be between 10 and 600 seconds')
    const state = getDevelopmentState()
    const current = state.tasks.get(taskId)
    if (!current || current.schoolId !== schoolId) throw new AiTaskRepositoryError('NOT_FOUND', 'AI task not found')
    if (current.leaseToken !== leaseToken || !current.leaseExpiresAt || Date.parse(current.leaseExpiresAt) <= Date.now()) {
      throw new AiTaskRepositoryError('LEASE_LOST', 'AI task lease is missing or expired')
    }
    const renewed = normalizeTask({
      ...current,
      version: current.version + 1,
      leaseExpiresAt: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    })
    state.tasks.set(renewed.id, cloneTask(renewed))
    addDevelopmentEvent(state, renewed, 'task.lease_renewed', { taskId, leaseToken })
    return cloneTask(renewed)
  }
}

interface RpcEnvelope {
  created?: boolean
  version?: number
  snapshot?: unknown
  leaseToken?: string
}

function normalizeRpcEnvelope(data: unknown): RpcEnvelope {
  if (!isRecord(data)) throw new AiTaskRepositoryError('INVALID_RECORD', 'AI runtime RPC returned an invalid response')
  return data as RpcEnvelope
}

function mapPersistenceError(message: string, cause: unknown): AiTaskRepositoryError {
  if (message.includes('version_conflict')) return new AiTaskRepositoryError('VERSION_CONFLICT', message, cause)
  if (message.includes('lease_lost')) return new AiTaskRepositoryError('LEASE_LOST', message, cause)
  if (message.includes('not_found')) return new AiTaskRepositoryError('NOT_FOUND', message, cause)
  return new AiTaskRepositoryError('PERSISTENCE_UNAVAILABLE', message, cause)
}

class SupabaseAiTaskRuntimeRepository implements AiTaskRuntimeRepository {
  private get client() {
    return getSupabaseAdminClient()
  }

  async createTask(task: AiTaskRecord, eventType = 'task.created'): Promise<AiTaskCreateResult> {
    if (!task.schoolId) throw new AiTaskRepositoryError('INVALID_RECORD', 'A durable AI task requires schoolId')
    const result = await this.client.rpc('ai_create_task_run', {
      p_school_id: task.schoolId,
      p_owner_user_id: task.ownerUserId,
      p_idempotency_key: task.idempotencyKey,
      p_snapshot: task,
      p_event_type: eventType,
    })
    if (result.error) throw mapPersistenceError(result.error.message, result.error)
    const envelope = normalizeRpcEnvelope(result.data)
    return { task: normalizeTask(envelope.snapshot), created: envelope.created === true }
  }

  async getTask(taskId: string, schoolId?: string): Promise<AiTaskRecord | null> {
    let query = this.client.from('ai_task_runs').select('snapshot').eq('id', taskId)
    if (schoolId) query = query.eq('school_id', schoolId)
    const result = await query.maybeSingle()
    if (result.error) throw mapPersistenceError(result.error.message, result.error)
    return result.data?.snapshot ? normalizeTask(result.data.snapshot) : null
  }

  async listTasks(filters: AiTaskListFilters): Promise<AiTaskRecord[]> {
    let query = this.client.from('ai_task_runs').select('snapshot').eq('school_id', filters.schoolId)
    if (filters.ownerUserId) query = query.eq('owner_user_id', filters.ownerUserId)
    if (filters.ownerRole) query = query.eq('owner_role', filters.ownerRole)
    if (filters.state) query = query.eq('state', filters.state)
    const result = await query.order('created_at', { ascending: false }).limit(500)
    if (result.error) throw mapPersistenceError(result.error.message, result.error)
    return (result.data ?? []).map((row) => normalizeTask(row.snapshot))
  }

  async saveTask(task: AiTaskRecord, options: AiTaskSaveOptions): Promise<AiTaskRecord> {
    if (!task.schoolId) throw new AiTaskRepositoryError('INVALID_RECORD', 'A durable AI task requires schoolId')
    const result = await this.client.rpc('ai_update_task_run', {
      p_school_id: task.schoolId,
      p_task_id: task.id,
      p_expected_version: options.expectedVersion,
      p_snapshot: task,
      p_event_type: options.eventType,
      p_event_payload: options.eventPayload ?? {},
    })
    if (result.error) throw mapPersistenceError(result.error.message, result.error)
    return normalizeTask(normalizeRpcEnvelope(result.data).snapshot)
  }

  async claimRecoverableTask(workerId: string, leaseSeconds = 60, at = new Date()): Promise<AiTaskRecord | null> {
    const result = await this.client.rpc('ai_claim_recoverable_task', {
      p_worker_id: workerId,
      p_lease_seconds: leaseSeconds,
      p_now: at.toISOString(),
    })
    if (result.error) throw mapPersistenceError(result.error.message, result.error)
    if (!result.data) return null
    return normalizeTask(normalizeRpcEnvelope(result.data).snapshot)
  }

  async renewLease(taskId: string, schoolId: string, leaseToken: string, leaseSeconds = 60): Promise<AiTaskRecord> {
    const result = await this.client.rpc('ai_renew_task_lease', {
      p_school_id: schoolId,
      p_task_id: taskId,
      p_lease_token: leaseToken,
      p_lease_seconds: leaseSeconds,
    })
    if (result.error) throw mapPersistenceError(result.error.message, result.error)
    return normalizeTask(result.data)
  }
}


interface PostgresFunctionRow { result: unknown }

class PostgresAiTaskRuntimeRepository implements AiTaskRuntimeRepository {
  private get pool() { return getPostgresPool() }

  async createTask(task: AiTaskRecord, eventType = 'task.created'): Promise<AiTaskCreateResult> {
    if (!task.schoolId) throw new AiTaskRepositoryError('INVALID_RECORD', 'A durable AI task requires schoolId')
    try {
      const query = await this.pool.query<PostgresFunctionRow>(
        'SELECT ai_create_task_run($1::uuid, $2::varchar, $3::varchar, $4::jsonb, $5::varchar) AS result',
        [task.schoolId, task.ownerUserId, task.idempotencyKey, JSON.stringify(task), eventType]
      )
      const envelope = normalizeRpcEnvelope(query.rows[0]?.result)
      return { task: normalizeTask(envelope.snapshot), created: envelope.created === true }
    } catch (error) {
      throw mapPersistenceError(error instanceof Error ? error.message : 'Postgres task creation failed', error)
    }
  }

  async getTask(taskId: string, schoolId?: string): Promise<AiTaskRecord | null> {
    try {
      const values: unknown[] = [taskId]
      const tenantClause = schoolId ? ' AND school_id = $2::uuid' : ''
      if (schoolId) values.push(schoolId)
      const query = await this.pool.query<{ snapshot: unknown }>(
        `SELECT snapshot FROM ai_task_runs WHERE id = $1::uuid${tenantClause} LIMIT 1`,
        values
      )
      return query.rows[0]?.snapshot ? normalizeTask(query.rows[0].snapshot) : null
    } catch (error) {
      throw mapPersistenceError(error instanceof Error ? error.message : 'Postgres task lookup failed', error)
    }
  }

  async listTasks(filters: AiTaskListFilters): Promise<AiTaskRecord[]> {
    try {
      const values: unknown[] = [filters.schoolId]
      const clauses = ['school_id = $1::uuid']
      if (filters.ownerUserId) { values.push(filters.ownerUserId); clauses.push(`owner_user_id = $${values.length}::varchar`) }
      if (filters.ownerRole) { values.push(filters.ownerRole); clauses.push(`owner_role = $${values.length}::varchar`) }
      if (filters.state) { values.push(filters.state); clauses.push(`state = $${values.length}::varchar`) }
      const query = await this.pool.query<{ snapshot: unknown }>(
        `SELECT snapshot FROM ai_task_runs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT 500`,
        values
      )
      return query.rows.map((row) => normalizeTask(row.snapshot))
    } catch (error) {
      throw mapPersistenceError(error instanceof Error ? error.message : 'Postgres task list failed', error)
    }
  }

  async saveTask(task: AiTaskRecord, options: AiTaskSaveOptions): Promise<AiTaskRecord> {
    if (!task.schoolId) throw new AiTaskRepositoryError('INVALID_RECORD', 'A durable AI task requires schoolId')
    try {
      const query = await this.pool.query<PostgresFunctionRow>(
        'SELECT ai_update_task_run($1::uuid, $2::uuid, $3::integer, $4::jsonb, $5::varchar, $6::jsonb) AS result',
        [task.schoolId, task.id, options.expectedVersion, JSON.stringify(task), options.eventType, JSON.stringify(options.eventPayload ?? {})]
      )
      return normalizeTask(normalizeRpcEnvelope(query.rows[0]?.result).snapshot)
    } catch (error) {
      throw mapPersistenceError(error instanceof Error ? error.message : 'Postgres task update failed', error)
    }
  }

  async claimRecoverableTask(workerId: string, leaseSeconds = 60, at = new Date()): Promise<AiTaskRecord | null> {
    try {
      const query = await this.pool.query<PostgresFunctionRow>(
        'SELECT ai_claim_recoverable_task($1::varchar, $2::integer, $3::timestamptz) AS result',
        [workerId, leaseSeconds, at.toISOString()]
      )
      if (!query.rows[0]?.result) return null
      return normalizeTask(normalizeRpcEnvelope(query.rows[0].result).snapshot)
    } catch (error) {
      throw mapPersistenceError(error instanceof Error ? error.message : 'Postgres recovery claim failed', error)
    }
  }

  async renewLease(taskId: string, schoolId: string, leaseToken: string, leaseSeconds = 60): Promise<AiTaskRecord> {
    try {
      const query = await this.pool.query<PostgresFunctionRow>(
        'SELECT ai_renew_task_lease($1::uuid, $2::uuid, $3::uuid, $4::integer) AS result',
        [schoolId, taskId, leaseToken, leaseSeconds]
      )
      return normalizeTask(query.rows[0]?.result)
    } catch (error) {
      throw mapPersistenceError(error instanceof Error ? error.message : 'Postgres lease renewal failed', error)
    }
  }
}

const developmentRepository = new DevelopmentAiTaskRuntimeRepository()
const supabaseRepository = new SupabaseAiTaskRuntimeRepository()
const postgresRepository = new PostgresAiTaskRuntimeRepository()

export function getAiTaskRuntimeRepository(): AiTaskRuntimeRepository {
  if (process.env.NODE_ENV !== 'production' && isDatabaseMemoryMode()) return developmentRepository
  if (hasPostgresDatabaseUrl()) return postgresRepository
  // Legacy Supabase is development-only; production is strictly backed by PG.
  if (process.env.NODE_ENV !== 'production' && hasSupabaseAdminCredentials()) return supabaseRepository
  if (process.env.NODE_ENV === 'production') {
    throw new AiTaskRepositoryError('PERSISTENCE_UNAVAILABLE', 'Production AI runtime requires PostgreSQL DATABASE_URL')
  }
  return developmentRepository
}

export function usesProductionAiTaskRuntimeRepository(): boolean {
  return hasPostgresDatabaseUrl() || (process.env.NODE_ENV !== 'production' && !isDatabaseMemoryMode() && hasSupabaseAdminCredentials())
}

export function canAccessAiTask(user: { id: string; role: UserRole; school_id?: string }, task: AiTaskRecord): boolean {
  if (task.schoolId !== user.school_id) return false
  if (task.ownerUserId === user.id) return true
  return isAiOperationsAdmin(user)
}

export function clearAiRuntimeForTests(): void {
  const state = getDevelopmentState()
  state.tasks.clear()
  state.idempotencyIndex.clear()
  state.outbox.clear()
  state.audit.length = 0
}

export function getDevelopmentAiRuntimeDiagnostics(): {
  taskCount: number
  outbox: DevelopmentOutboxEvent[]
  auditCount: number
} {
  const state = getDevelopmentState()
  return {
    taskCount: state.tasks.size,
    outbox: [...state.outbox.values()].map((event) => ({ ...event, payload: JSON.parse(JSON.stringify(event.payload)) })),
    auditCount: state.audit.length,
  }
}
