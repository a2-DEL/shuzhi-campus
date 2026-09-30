import { getDevelopmentUser, DEVELOPMENT_PASSWORD_HASH } from '@/lib/development-users'
import {
  getSupabaseAdminClient,
  hasSupabaseAdminCredentials,
} from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl, isDatabaseMemoryMode } from '@/storage/database/postgres'
import {
  RoleScopeType,
  User,
  UserRole,
  UserRoleAssignment,
  UserStatus,
} from '@/types'

const ROLE_VALUES = new Set<string>(Object.values(UserRole))
const SCOPE_VALUES = new Set<RoleScopeType>([
  'global',
  'school',
  'campus',
  'organization',
  'class',
  'building',
  'self',
])

export class IdentityRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly cause?: unknown
  ) {
    super(message)
    this.name = 'IdentityRepositoryError'
  }
}

export interface IdentityCredential {
  user: User
  passwordHash: string
}

export interface SessionRegistration {
  id: string
  userId: string
  schoolId: string
  authVersion: number
  expiresAt: Date
  ipHash?: string
  userAgentHash?: string
}

export interface IdentityRepository {
  findActiveUserById(userId: string): Promise<User | null>
  findCredentialByIdentifier(identifier: string): Promise<IdentityCredential | null>
  recordSuccessfulLogin(userId: string, upgradedPasswordHash?: string): Promise<void>
  createSession(session: SessionRegistration): Promise<void>
  resolveSessionUser(userId: string, sessionId: string): Promise<User | null>
  revokeSession(sessionId: string, reason: string): Promise<void>
}

function optionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' && value ? value : undefined
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = optionalString(record, key)
  if (!value) throw new IdentityRepositoryError('INVALID_IDENTITY_RECORD', `Missing ${key}`)
  return value
}

function parseRole(value: unknown): UserRole {
  if (typeof value !== 'string' || !ROLE_VALUES.has(value)) {
    throw new IdentityRepositoryError('INVALID_ROLE_ASSIGNMENT', `Unknown role: ${String(value)}`)
  }
  return value as UserRole
}

function parseScope(value: unknown): RoleScopeType {
  if (typeof value !== 'string' || !SCOPE_VALUES.has(value as RoleScopeType)) {
    throw new IdentityRepositoryError('INVALID_ROLE_SCOPE', `Unknown scope: ${String(value)}`)
  }
  return value as RoleScopeType
}

function normalizeAssignment(
  record: Record<string, unknown>,
  source: 'direct' | 'delegation'
): UserRoleAssignment {
  const statusValue = optionalString(record, 'status') ?? 'active'
  const status = statusValue === 'suspended' || statusValue === 'revoked' ? statusValue : 'active'
  return {
    id: requiredString(record, 'id'),
    school_id: requiredString(record, 'school_id'),
    user_id: requiredString(record, 'user_id'),
    role: parseRole(record.role),
    scope_type: parseScope(record.scope_type),
    scope_id: optionalString(record, 'scope_id'),
    is_primary: source === 'direct' && record.is_primary === true,
    status,
    valid_from: optionalString(record, 'valid_from') ?? optionalString(record, 'starts_at') ?? new Date(0).toISOString(),
    valid_until: optionalString(record, 'valid_until') ?? optionalString(record, 'expires_at'),
    granted_by: optionalString(record, 'granted_by') ?? optionalString(record, 'grantor_user_id'),
    source,
  }
}

function normalizeUser(
  record: Record<string, unknown>,
  assignments: UserRoleAssignment[]
): User {
  const primaryAssignment = assignments.find((assignment) => assignment.is_primary && assignment.status === 'active')
    ?? assignments.find((assignment) => assignment.source === 'direct' && assignment.status === 'active')

  if (!primaryAssignment) {
    throw new IdentityRepositoryError(
      'ROLE_ASSIGNMENT_MISSING',
      `User ${String(record.id)} has no active direct role assignment`
    )
  }

  const status = record.status === UserStatus.DISABLED ? UserStatus.DISABLED : UserStatus.ACTIVE
  return {
    id: requiredString(record, 'id'),
    user_id: requiredString(record, 'user_id'),
    name: requiredString(record, 'name'),
    role: primaryAssignment.role,
    school_id: requiredString(record, 'school_id'),
    primary_organization_id: optionalString(record, 'primary_organization_id'),
    primary_campus_id: optionalString(record, 'primary_campus_id'),
    auth_version: typeof record.auth_version === 'number' ? record.auth_version : Number(record.auth_version) || 1,
    role_assignments: assignments,
    department: optionalString(record, 'department'),
    class_name: optionalString(record, 'class_name'),
    phone: optionalString(record, 'phone'),
    email: optionalString(record, 'email'),
    avatar: optionalString(record, 'avatar'),
    status,
    last_login_at: optionalString(record, 'last_login_at'),
    created_at: optionalString(record, 'created_at') ?? new Date(0).toISOString(),
    updated_at: optionalString(record, 'updated_at') ?? new Date(0).toISOString(),
    is_deleted: record.is_deleted === true,
  }
}

function asRecords(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
}

class SupabaseIdentityRepository implements IdentityRepository {
  private get client() {
    return getSupabaseAdminClient()
  }

  private async loadEffectiveAssignments(userId: string): Promise<UserRoleAssignment[]> {
    const now = new Date().toISOString()
    const directResult = await this.client
      .from('user_role_assignments')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .lte('valid_from', now)
      .or(`valid_until.is.null,valid_until.gt.${now}`)

    if (directResult.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Role assignment lookup failed', directResult.error)
    }

    const delegationResult = await this.client
      .from('role_delegations')
      .select('id, school_id, grantee_user_id, grantor_user_id, role, scope_type, scope_id, status, starts_at, expires_at')
      .eq('grantee_user_id', userId)
      .eq('status', 'active')
      .lte('starts_at', now)
      .gt('expires_at', now)

    if (delegationResult.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Delegation lookup failed', delegationResult.error)
    }

    const direct = asRecords(directResult.data).map((record) => normalizeAssignment(record, 'direct'))
    const delegated = asRecords(delegationResult.data).map((record) => normalizeAssignment({
      ...record,
      user_id: record.grantee_user_id,
      valid_from: record.starts_at,
      valid_until: record.expires_at,
    }, 'delegation'))
    return [...direct, ...delegated]
  }

  private async loadUserByColumn(column: 'id' | 'user_id', value: string): Promise<Record<string, unknown> | null> {
    const result = await this.client
      .from('users')
      .select('*')
      .eq(column, value)
      .maybeSingle()

    if (result.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'User lookup failed', result.error)
    }
    return result.data && typeof result.data === 'object'
      ? result.data as Record<string, unknown>
      : null
  }

  async findActiveUserById(userId: string): Promise<User | null> {
    const record = await this.loadUserByColumn('id', userId)
    if (!record || record.status === UserStatus.DISABLED || record.is_deleted === true) return null
    const assignments = await this.loadEffectiveAssignments(userId)
    return normalizeUser(record, assignments)
  }

  async findCredentialByIdentifier(identifier: string): Promise<IdentityCredential | null> {
    const record = await this.loadUserByColumn('user_id', identifier)
    if (!record) return null
    const assignments = await this.loadEffectiveAssignments(requiredString(record, 'id'))
    return {
      user: normalizeUser(record, assignments),
      passwordHash: requiredString(record, 'password_hash'),
    }
  }

  async recordSuccessfulLogin(userId: string, upgradedPasswordHash?: string): Promise<void> {
    const now = new Date().toISOString()
    const updates: Record<string, string> = { last_login_at: now, updated_at: now }
    if (upgradedPasswordHash) updates.password_hash = upgradedPasswordHash
    const userResult = await this.client.from('users').update(updates).eq('id', userId)
    if (userResult.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Login metadata update failed', userResult.error)
    }
    const identityResult = await this.client
      .from('external_identities')
      .update({ last_authenticated_at: now, updated_at: now })
      .eq('user_id', userId)
      .eq('provider', 'password')
    if (identityResult.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'External identity update failed', identityResult.error)
    }
  }

  async createSession(session: SessionRegistration): Promise<void> {
    const result = await this.client.from('auth_sessions').insert({
      id: session.id,
      school_id: session.schoolId,
      user_id: session.userId,
      auth_version: session.authVersion,
      expires_at: session.expiresAt.toISOString(),
      ip_hash: session.ipHash ?? null,
      user_agent_hash: session.userAgentHash ?? null,
    })
    if (result.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Session persistence failed', result.error)
    }
  }

  async resolveSessionUser(userId: string, sessionId: string): Promise<User | null> {
    const now = new Date().toISOString()
    const sessionResult = await this.client
      .from('auth_sessions')
      .select('id, user_id, auth_version, expires_at, revoked_at')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .is('revoked_at', null)
      .gt('expires_at', now)
      .maybeSingle()

    if (sessionResult.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Session lookup failed', sessionResult.error)
    }
    if (!sessionResult.data) return null

    const record = await this.loadUserByColumn('id', userId)
    if (!record || record.status === UserStatus.DISABLED || record.is_deleted === true) return null
    const authVersion = typeof record.auth_version === 'number' ? record.auth_version : Number(record.auth_version) || 1
    if (Number(sessionResult.data.auth_version) !== authVersion) return null

    const assignments = await this.loadEffectiveAssignments(userId)
    return normalizeUser(record, assignments)
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    const result = await this.client
      .from('auth_sessions')
      .update({ revoked_at: new Date().toISOString(), revoke_reason: reason.slice(0, 160) })
      .eq('id', sessionId)
      .is('revoked_at', null)
    if (result.error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Session revocation failed', result.error)
    }
  }
}


class PostgresIdentityRepository implements IdentityRepository {
  private get pool() { return getPostgresPool() }

  private async loadEffectiveAssignments(userId: string): Promise<UserRoleAssignment[]> {
    try {
      const [directResult, delegationResult] = await Promise.all([
        this.pool.query<Record<string, unknown>>(
          `SELECT * FROM user_role_assignments WHERE user_id=$1 AND status='active' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now())`,
          [userId]
        ),
        this.pool.query<Record<string, unknown>>(
          `SELECT id,school_id,grantee_user_id,grantor_user_id,role,scope_type,scope_id,status,starts_at,expires_at FROM role_delegations WHERE grantee_user_id=$1 AND status='active' AND starts_at<=now() AND expires_at>now()`,
          [userId]
        ),
      ])
      const direct = directResult.rows.map((record) => normalizeAssignment(record, 'direct'))
      const delegated = delegationResult.rows.map((record) => normalizeAssignment({
        ...record,
        user_id: record.grantee_user_id,
        valid_from: record.starts_at,
        valid_until: record.expires_at,
      }, 'delegation'))
      return [...direct, ...delegated]
    } catch (error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Postgres role assignment lookup failed', error)
    }
  }

  private async loadUserByColumn(column: 'id' | 'user_id', value: string): Promise<Record<string, unknown> | null> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(`SELECT * FROM users WHERE ${column}=$1 LIMIT 1`, [value])
      return result.rows[0] ?? null
    } catch (error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Postgres user lookup failed', error)
    }
  }

  async findActiveUserById(userId: string): Promise<User | null> {
    const record = await this.loadUserByColumn('id', userId)
    if (!record || record.status === UserStatus.DISABLED || record.is_deleted === true) return null
    return normalizeUser(record, await this.loadEffectiveAssignments(userId))
  }

  async findCredentialByIdentifier(identifier: string): Promise<IdentityCredential | null> {
    const record = await this.loadUserByColumn('user_id', identifier)
    if (!record || record.status === UserStatus.DISABLED || record.is_deleted === true) return null
    const userId = requiredString(record, 'id')
    return { user: normalizeUser(record, await this.loadEffectiveAssignments(userId)), passwordHash: requiredString(record, 'password_hash') }
  }

  async recordSuccessfulLogin(userId: string, upgradedPasswordHash?: string): Promise<void> {
    try {
      if (upgradedPasswordHash) {
        await this.pool.query('UPDATE users SET last_login_at=now(),updated_at=now(),password_hash=$2 WHERE id=$1', [userId, upgradedPasswordHash])
      } else {
        await this.pool.query('UPDATE users SET last_login_at=now(),updated_at=now() WHERE id=$1', [userId])
      }
      await this.pool.query(`UPDATE external_identities SET last_authenticated_at=now(),updated_at=now() WHERE user_id=$1 AND provider='password'`, [userId])
    } catch (error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Postgres login metadata update failed', error)
    }
  }

  async createSession(session: SessionRegistration): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO auth_sessions(id,school_id,user_id,auth_version,expires_at,ip_hash,user_agent_hash) VALUES($1::uuid,$2::uuid,$3,$4,$5::timestamptz,$6,$7)`,
        [session.id, session.schoolId, session.userId, session.authVersion, session.expiresAt.toISOString(), session.ipHash ?? null, session.userAgentHash ?? null]
      )
    } catch (error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Postgres session persistence failed', error)
    }
  }

  async resolveSessionUser(userId: string, sessionId: string): Promise<User | null> {
    try {
      const sessionResult = await this.pool.query<{ auth_version: number }>(
        `SELECT auth_version FROM auth_sessions WHERE id=$1::uuid AND user_id=$2 AND revoked_at IS NULL AND expires_at>now() LIMIT 1`,
        [sessionId, userId]
      )
      if (!sessionResult.rows[0]) return null
      const record = await this.loadUserByColumn('id', userId)
      if (!record || record.status === UserStatus.DISABLED || record.is_deleted === true) return null
      const authVersion = typeof record.auth_version === 'number' ? record.auth_version : Number(record.auth_version) || 1
      if (Number(sessionResult.rows[0].auth_version) !== authVersion) return null
      await this.pool.query('UPDATE auth_sessions SET last_seen_at=now() WHERE id=$1::uuid', [sessionId])
      return normalizeUser(record, await this.loadEffectiveAssignments(userId))
    } catch (error) {
      if (error instanceof IdentityRepositoryError) throw error
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Postgres session lookup failed', error)
    }
  }

  async revokeSession(sessionId: string, reason: string): Promise<void> {
    try {
      await this.pool.query(`UPDATE auth_sessions SET revoked_at=now(),revoke_reason=$2 WHERE id=$1::uuid AND revoked_at IS NULL`, [sessionId, reason.slice(0, 160)])
    } catch (error) {
      throw new IdentityRepositoryError('IDENTITY_SOURCE_ERROR', 'Postgres session revocation failed', error)
    }
  }
}

interface DevelopmentSession {
  userId: string
  authVersion: number
  expiresAt: number
  revoked: boolean
}

const identityGlobal = globalThis as typeof globalThis & {
  __campusDevelopmentSessions?: Map<string, DevelopmentSession>
}
const developmentSessions = identityGlobal.__campusDevelopmentSessions ?? new Map<string, DevelopmentSession>()
identityGlobal.__campusDevelopmentSessions = developmentSessions

class DevelopmentIdentityRepository implements IdentityRepository {
  async findActiveUserById(userId: string): Promise<User | null> {
    return getDevelopmentUser(userId)
  }

  async findCredentialByIdentifier(identifier: string): Promise<IdentityCredential | null> {
    const user = getDevelopmentUser(identifier)
    return user ? { user, passwordHash: DEVELOPMENT_PASSWORD_HASH } : null
  }

  async recordSuccessfulLogin(): Promise<void> {}

  async createSession(session: SessionRegistration): Promise<void> {
    developmentSessions.set(session.id, {
      userId: session.userId,
      authVersion: session.authVersion,
      expiresAt: session.expiresAt.getTime(),
      revoked: false,
    })
  }

  async resolveSessionUser(userId: string, sessionId: string): Promise<User | null> {
    const session = developmentSessions.get(sessionId)
    if (
      !session ||
      session.revoked ||
      session.userId !== userId ||
      session.expiresAt <= Date.now()
    ) return null
    const user = getDevelopmentUser(userId)
    if (!user || (user.auth_version ?? 1) !== session.authVersion) return null
    return user
  }

  async revokeSession(sessionId: string): Promise<void> {
    const session = developmentSessions.get(sessionId)
    if (session) session.revoked = true
  }
}

const supabaseRepository = new SupabaseIdentityRepository()
const postgresRepository = new PostgresIdentityRepository()
const developmentRepository = new DevelopmentIdentityRepository()

export function getIdentityRepository(): IdentityRepository {
  if (isDatabaseMemoryMode()) return developmentRepository
  if (hasPostgresDatabaseUrl()) return postgresRepository
  // Preserve Supabase as a development-only legacy backend; production identity requires PG.
  if (process.env.NODE_ENV !== 'production' && hasSupabaseAdminCredentials()) return supabaseRepository
  if (process.env.NODE_ENV === 'production') {
    throw new IdentityRepositoryError('IDENTITY_CONFIGURATION_ERROR', 'Production identity requires PostgreSQL DATABASE_URL')
  }
  return developmentRepository
}

export function usesProductionIdentityRepository(): boolean {
  return hasPostgresDatabaseUrl() || (process.env.NODE_ENV !== 'production' && !isDatabaseMemoryMode() && hasSupabaseAdminCredentials())
}
