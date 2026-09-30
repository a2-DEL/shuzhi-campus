import { getSupabaseAdminClient, hasSupabaseAdminCredentials } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import {
  CommittedSkillOperation,
  EnterpriseSkillContract,
  EnterpriseSkillPort,
  PreparedSkillOperation,
  SkillOperationContext,
  VerifiedSkillOperation,
} from './contracts'

const REPAIR_POLICY_GUARD_KEY = 'repair.policy.guard.v1'

function prepareRpc(contract: EnterpriseSkillContract): string {
  return contract.key === REPAIR_POLICY_GUARD_KEY ? 'ai_prepare_repair_policy_guard' : 'ai_prepare_skill_operation'
}

function commitRpc(contract: EnterpriseSkillContract): string {
  return contract.key === REPAIR_POLICY_GUARD_KEY ? 'ai_commit_repair_policy_guard' : 'ai_commit_skill_operation'
}

function verifyRpc(contract: EnterpriseSkillContract): string {
  return contract.key === REPAIR_POLICY_GUARD_KEY ? 'ai_verify_repair_policy_guard' : 'ai_verify_skill_effect'
}

export class EnterpriseSkillPortError extends Error {
  constructor(
    readonly code: 'PORT_UNAVAILABLE' | 'INVALID_RESPONSE' | 'PREPARE_FAILED' | 'COMMIT_FAILED' | 'VERIFY_FAILED',
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'EnterpriseSkillPortError'
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EnterpriseSkillPortError('INVALID_RESPONSE', `${label} is not an object`)
  }
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new EnterpriseSkillPortError('INVALID_RESPONSE', `${label} is missing`)
  return value
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null
  return string(value, label)
}

function parsePrepared(value: unknown): PreparedSkillOperation {
  const data = record(value, 'Skill prepare response')
  return {
    previewId: string(data.previewId, 'previewId'),
    skillKey: string(data.skillKey, 'skillKey') as PreparedSkillOperation['skillKey'],
    input: record(data.input, 'input'),
    inputHash: string(data.inputHash, 'inputHash'),
    snapshotHash: string(data.snapshotHash, 'snapshotHash'),
    resourceScope: record(data.resourceScope, 'resourceScope') as unknown as PreparedSkillOperation['resourceScope'],
    targetSnapshot: record(data.targetSnapshot, 'targetSnapshot'),
    preview: record(data.preview, 'preview'),
    expectedVersions: record(data.expectedVersions, 'expectedVersions') as Record<string, number>,
    expiresAt: string(data.expiresAt, 'expiresAt'),
  }
}

function parseCommitted(value: unknown): CommittedSkillOperation {
  const data = record(value, 'Skill commit response')
  const status = string(data.status, 'status')
  if (status !== 'APPLIED' && status !== 'VERIFIED') {
    throw new EnterpriseSkillPortError('INVALID_RESPONSE', `Unexpected business effect status: ${status}`)
  }
  return {
    effectId: string(data.effectId, 'effectId'),
    targetType: string(data.targetType, 'targetType'),
    targetId: nullableString(data.targetId, 'targetId'),
    status,
    idempotentReplay: data.idempotentReplay === true,
    result: record(data.result, 'result'),
    verification: data.verification ? record(data.verification, 'verification') : undefined,
  }
}

function parseVerified(value: unknown): VerifiedSkillOperation {
  const committed = parseCommitted(value)
  if (committed.status !== 'VERIFIED' || committed.verification?.verified !== true) {
    throw new EnterpriseSkillPortError('INVALID_RESPONSE', 'Skill verification did not return verified=true')
  }
  return { ...committed, status: 'VERIFIED', verification: committed.verification as VerifiedSkillOperation['verification'] }
}

function persistenceMessage(error: { message?: string } | null, fallback: string): string {
  return error?.message?.trim() || fallback
}

export class SupabaseEnterpriseSkillPort implements EnterpriseSkillPort {
  private get client() {
    if (!hasSupabaseAdminCredentials()) {
      throw new EnterpriseSkillPortError('PORT_UNAVAILABLE', 'Enterprise Skill execution requires the Supabase service-role credential')
    }
    return getSupabaseAdminClient()
  }

  async findEffect(
    _contract: EnterpriseSkillContract,
    context: SkillOperationContext
  ): Promise<CommittedSkillOperation | null> {
    const result = await this.client
      .from('ai_business_effects')
      .select('id, target_type, target_id, status, after_value, verification')
      .eq('school_id', context.schoolId)
      .eq('task_id', context.taskId)
      .eq('node_id', context.nodeId)
      .eq('idempotency_key', context.idempotencyKey)
      .maybeSingle()
    if (result.error) throw new EnterpriseSkillPortError('PORT_UNAVAILABLE', persistenceMessage(result.error, 'Effect lookup failed'), result.error)
    if (!result.data) return null
    return parseCommitted({
      effectId: result.data.id,
      targetType: result.data.target_type,
      targetId: result.data.target_id,
      status: result.data.status,
      idempotentReplay: true,
      result: result.data.after_value ?? {},
      verification: result.data.verification ?? undefined,
    })
  }

  async prepare(
    contract: EnterpriseSkillContract,
    input: Record<string, unknown>,
    context: SkillOperationContext
  ): Promise<PreparedSkillOperation> {
    const result = await this.client.rpc(prepareRpc(contract), {
      p_school_id: context.schoolId,
      p_task_id: context.taskId,
      p_node_id: context.nodeId,
      p_skill_key: contract.key,
      p_actor_id: context.actor.id,
      p_input: input,
    })
    if (result.error) throw new EnterpriseSkillPortError('PREPARE_FAILED', persistenceMessage(result.error, 'Skill prepare failed'), result.error)
    return parsePrepared(result.data)
  }

  async commit(
    contract: EnterpriseSkillContract,
    prepared: PreparedSkillOperation,
    context: SkillOperationContext
  ): Promise<CommittedSkillOperation> {
    const result = await this.client.rpc(commitRpc(contract), {
      p_school_id: context.schoolId,
      p_task_id: context.taskId,
      p_node_id: context.nodeId,
      p_preview_id: prepared.previewId,
      p_skill_key: contract.key,
      p_actor_id: context.actor.id,
      p_idempotency_key: context.idempotencyKey,
    })
    if (result.error) throw new EnterpriseSkillPortError('COMMIT_FAILED', persistenceMessage(result.error, 'Skill commit failed'), result.error)
    return parseCommitted(result.data)
  }

  async verify(
    contract: EnterpriseSkillContract,
    committed: CommittedSkillOperation,
    context: SkillOperationContext
  ): Promise<VerifiedSkillOperation> {
    const result = await this.client.rpc(verifyRpc(contract), {
      p_school_id: context.schoolId,
      p_effect_id: committed.effectId,
      p_actor_id: context.actor.id,
    })
    if (result.error) throw new EnterpriseSkillPortError('VERIFY_FAILED', persistenceMessage(result.error, 'Skill verify failed'), result.error)
    return parseVerified(result.data)
  }
}


interface PostgresSkillRow { result: unknown }

export class PostgresEnterpriseSkillPort implements EnterpriseSkillPort {
  private get pool() {
    if (!hasPostgresDatabaseUrl()) throw new EnterpriseSkillPortError('PORT_UNAVAILABLE', 'DATABASE_URL is not configured')
    return getPostgresPool()
  }

  async findEffect(
    _contract: EnterpriseSkillContract,
    context: SkillOperationContext
  ): Promise<CommittedSkillOperation | null> {
    try {
      const query = await this.pool.query<{
        id: string
        target_type: string
        target_id: string | null
        status: string
        after_value: unknown
        verification: unknown
      }>(
        `SELECT id, target_type, target_id, status, after_value, verification
         FROM ai_business_effects
         WHERE school_id = $1::uuid AND task_id = $2::uuid AND node_id = $3::varchar AND idempotency_key = $4::varchar
         LIMIT 1`,
        [context.schoolId, context.taskId, context.nodeId, context.idempotencyKey]
      )
      const row = query.rows[0]
      if (!row) return null
      return parseCommitted({
        effectId: row.id,
        targetType: row.target_type,
        targetId: row.target_id,
        status: row.status,
        idempotentReplay: true,
        result: row.after_value ?? {},
        verification: row.verification ?? undefined,
      })
    } catch (error) {
      throw new EnterpriseSkillPortError('PORT_UNAVAILABLE', error instanceof Error ? error.message : 'Effect lookup failed', error)
    }
  }

  async prepare(
    contract: EnterpriseSkillContract,
    input: Record<string, unknown>,
    context: SkillOperationContext
  ): Promise<PreparedSkillOperation> {
    try {
      const rpc = prepareRpc(contract)
      const query = await this.pool.query<PostgresSkillRow>(
        `SELECT ${rpc}($1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar, $6::jsonb) AS result`,
        [context.schoolId, context.taskId, context.nodeId, contract.key, context.actor.id, JSON.stringify(input)]
      )
      return parsePrepared(query.rows[0]?.result)
    } catch (error) {
      throw new EnterpriseSkillPortError('PREPARE_FAILED', error instanceof Error ? error.message : 'Skill prepare failed', error)
    }
  }

  async commit(
    contract: EnterpriseSkillContract,
    prepared: PreparedSkillOperation,
    context: SkillOperationContext
  ): Promise<CommittedSkillOperation> {
    try {
      const rpc = commitRpc(contract)
      const query = await this.pool.query<PostgresSkillRow>(
        `SELECT ${rpc}($1::uuid, $2::uuid, $3::varchar, $4::uuid, $5::varchar, $6::varchar, $7::varchar) AS result`,
        [context.schoolId, context.taskId, context.nodeId, prepared.previewId, contract.key, context.actor.id, context.idempotencyKey]
      )
      return parseCommitted(query.rows[0]?.result)
    } catch (error) {
      throw new EnterpriseSkillPortError('COMMIT_FAILED', error instanceof Error ? error.message : 'Skill commit failed', error)
    }
  }

  async verify(
    contract: EnterpriseSkillContract,
    committed: CommittedSkillOperation,
    context: SkillOperationContext
  ): Promise<VerifiedSkillOperation> {
    try {
      const rpc = verifyRpc(contract)
      const query = await this.pool.query<PostgresSkillRow>(
        `SELECT ${rpc}($1::uuid, $2::uuid, $3::varchar) AS result`,
        [context.schoolId, committed.effectId, context.actor.id]
      )
      return parseVerified(query.rows[0]?.result)
    } catch (error) {
      throw new EnterpriseSkillPortError('VERIFY_FAILED', error instanceof Error ? error.message : 'Skill verify failed', error)
    }
  }
}

const supabasePort = new SupabaseEnterpriseSkillPort()
const postgresPort = new PostgresEnterpriseSkillPort()
let explicitTestPort: EnterpriseSkillPort | undefined

export function hasEnterpriseSkillPort(): boolean {
  return hasPostgresDatabaseUrl() || (process.env.NODE_ENV !== 'production' && (Boolean(explicitTestPort) || hasSupabaseAdminCredentials()))
}

export function getEnterpriseSkillPort(): EnterpriseSkillPort {
  if (process.env.NODE_ENV !== 'production' && explicitTestPort) return explicitTestPort
  if (hasPostgresDatabaseUrl()) return postgresPort
  // Legacy Supabase Skill RPC is only accessible during non-production migration diagnostics.
  if (process.env.NODE_ENV !== 'production' && hasSupabaseAdminCredentials()) return supabasePort
  throw new EnterpriseSkillPortError('PORT_UNAVAILABLE', 'No PostgreSQL enterprise Skill backend is configured; execution is fail-closed')
}

export function setEnterpriseSkillPortForTests(port?: EnterpriseSkillPort): void {
  if (process.env.NODE_ENV === 'production') {
    throw new EnterpriseSkillPortError('PORT_UNAVAILABLE', 'Test Skill ports are forbidden in production')
  }
  explicitTestPort = port
}
