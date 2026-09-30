import { getDevelopmentUsers } from '@/lib/development-users'
import { hashPassword } from '@/lib/password'
import { usesProductionIdentityRepository } from '@/lib/identity/repository'
import { getSupabaseAdminClient } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { RoleScopeType, User, UserRole, UserStatus } from '@/types'

export class IdentityAdminError extends Error {
  constructor(readonly code: string, message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'IdentityAdminError'
  }
}

export interface IdentityUserFilters {
  page: number
  pageSize: number
  role?: UserRole
  organizationId?: string
  keyword?: string
  status?: 'active' | 'disabled'
  department?: string
}

export interface IdentityUserPage {
  users: User[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  source: 'database' | 'development'
}

export interface CreateIdentityUserInput {
  userId: string
  name: string
  password: string
  role: UserRole
  schoolId: string
  primaryOrganizationId?: string
  primaryCampusId?: string
  scopeType: RoleScopeType
  scopeId?: string
  department?: string
  className?: string
  phone?: string
  email?: string
  grantedBy: string
}

const SAFE_USER_COLUMNS = [
  'id', 'user_id', 'name', 'role', 'school_id', 'primary_organization_id',
  'primary_campus_id', 'department', 'class_name', 'phone', 'email', 'status',
  'avatar', 'auth_version', 'is_deleted', 'last_login_at', 'created_at', 'updated_at',
].join(', ')

function recordTimestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : undefined
}

function toUser(record: Record<string, unknown>): User {
  return {
    id: String(record.id),
    user_id: String(record.user_id),
    name: String(record.name),
    role: record.role as UserRole,
    school_id: typeof record.school_id === 'string' ? record.school_id : undefined,
    primary_organization_id: typeof record.primary_organization_id === 'string' ? record.primary_organization_id : undefined,
    primary_campus_id: typeof record.primary_campus_id === 'string' ? record.primary_campus_id : undefined,
    department: typeof record.department === 'string' ? record.department : undefined,
    class_name: typeof record.class_name === 'string' ? record.class_name : undefined,
    phone: typeof record.phone === 'string' ? record.phone : undefined,
    email: typeof record.email === 'string' ? record.email : undefined,
    avatar: typeof record.avatar === 'string' ? record.avatar : undefined,
    auth_version: Number(record.auth_version) || 1,
    status: record.status === UserStatus.DISABLED ? UserStatus.DISABLED : UserStatus.ACTIVE,
    is_deleted: record.is_deleted === true,
    last_login_at: recordTimestamp(record.last_login_at),
    created_at: recordTimestamp(record.created_at) ?? new Date(0).toISOString(),
    updated_at: recordTimestamp(record.updated_at) ?? new Date(0).toISOString(),
  }
}

function safeKeyword(value: string): string {
  return value.replace(/[%_,().*]/g, '').slice(0, 64)
}

export async function listIdentityUsers(
  schoolId: string,
  filters: IdentityUserFilters
): Promise<IdentityUserPage> {
  if (!usesProductionIdentityRepository()) {
    let users = getDevelopmentUsers().filter((user) => user.school_id === schoolId)
    if (filters.role) users = users.filter((user) => user.role === filters.role)
    if (filters.status) users = users.filter((user) => user.status === filters.status)
    if (filters.department) users = users.filter((user) => user.department === filters.department)
    if (filters.organizationId) {
      users = users.filter((user) => user.primary_organization_id === filters.organizationId)
    }
    if (filters.keyword) {
      const keyword = filters.keyword.toLocaleLowerCase()
      users = users.filter((user) =>
        user.user_id.toLocaleLowerCase().includes(keyword) || user.name.toLocaleLowerCase().includes(keyword)
      )
    }
    const total = users.length
    const start = (filters.page - 1) * filters.pageSize
    return {
      users: users.slice(start, start + filters.pageSize),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
      source: 'development',
    }
  }

  if (hasPostgresDatabaseUrl()) {
    const values: unknown[] = [schoolId]
    const clauses = ['school_id=$1::uuid', 'is_deleted=false']
    if (filters.role) { values.push(filters.role); clauses.push(`role=$${values.length}`) }
    if (filters.status) { values.push(filters.status); clauses.push(`status=$${values.length}`) }
    if (filters.department) { values.push(filters.department); clauses.push(`department=$${values.length}`) }
    if (filters.organizationId) { values.push(filters.organizationId); clauses.push(`primary_organization_id=$${values.length}::uuid`) }
    if (filters.keyword) { values.push(`%${filters.keyword.slice(0, 64)}%`); clauses.push(`(user_id ILIKE $${values.length} OR name ILIKE $${values.length})`) }
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize)
    try {
      const result = await getPostgresPool().query<Record<string, unknown>>(
        `SELECT ${SAFE_USER_COLUMNS},count(*) OVER()::int AS total_count FROM users WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      return { users: result.rows.map(toUser), page: filters.page, pageSize: filters.pageSize, total, totalPages: Math.max(1, Math.ceil(total / filters.pageSize)), source: 'database' }
    } catch (error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Postgres user list query failed', error)
    }
  }

  let query = getSupabaseAdminClient()
    .from('users')
    .select(SAFE_USER_COLUMNS, { count: 'exact' })
    .eq('school_id', schoolId)
    .eq('is_deleted', false)

  if (filters.role) query = query.eq('role', filters.role)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.department) query = query.eq('department', filters.department)
  if (filters.organizationId) query = query.eq('primary_organization_id', filters.organizationId)
  if (filters.keyword) {
    const keyword = safeKeyword(filters.keyword)
    if (keyword) query = query.or(`user_id.ilike.%${keyword}%,name.ilike.%${keyword}%`)
  }

  const start = (filters.page - 1) * filters.pageSize
  const result = await query
    .order('created_at', { ascending: false })
    .range(start, start + filters.pageSize - 1)

  if (result.error) {
    throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'User list query failed', result.error)
  }
  const rawData: unknown = result.data
  const records: Record<string, unknown>[] = Array.isArray(rawData)
    ? rawData.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
  const total = result.count ?? 0
  return {
    users: records.map(toUser),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    source: 'database',
  }
}

export async function getIdentityUser(schoolId: string, userId: string): Promise<User | null> {
  if (!usesProductionIdentityRepository()) {
    return getDevelopmentUsers().find((user) => user.school_id === schoolId && user.id === userId) ?? null
  }
  if (hasPostgresDatabaseUrl()) {
    try {
      const result = await getPostgresPool().query<Record<string, unknown>>(`SELECT ${SAFE_USER_COLUMNS} FROM users WHERE school_id=$1::uuid AND id=$2 AND is_deleted=false LIMIT 1`, [schoolId, userId])
      return result.rows[0] ? toUser(result.rows[0]) : null
    } catch (error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Postgres identity lookup failed', error)
    }
  }
  const result = await getSupabaseAdminClient()
    .from('users')
    .select(SAFE_USER_COLUMNS)
    .eq('school_id', schoolId)
    .eq('id', userId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (result.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Identity lookup failed', result.error)
  return result.data ? toUser(result.data as unknown as Record<string, unknown>) : null
}

export async function createIdentityUser(input: CreateIdentityUserInput): Promise<User> {
  if (!usesProductionIdentityRepository()) {
    throw new IdentityAdminError(
      'DEVELOPMENT_IDENTITY_READ_ONLY',
      'Development identities are read-only; configure the production identity database to create users'
    )
  }

  if (input.scopeType !== 'global' && input.scopeType !== 'school' && !input.scopeId) {
    throw new IdentityAdminError('INVALID_SCOPE', 'The selected role scope requires a scope id')
  }
  if (hasPostgresDatabaseUrl()) {
    const pool = getPostgresPool()
    try {
      if (input.scopeId && input.scopeType === 'organization') {
        const scope = await pool.query('SELECT 1 FROM organizations WHERE id=$1::uuid AND school_id=$2::uuid', [input.scopeId, input.schoolId])
        if (!scope.rows[0]) throw new IdentityAdminError('INVALID_SCOPE', 'Organization is outside the active school')
      }
      const passwordHash = await hashPassword(input.password)
      const result = await pool.query<{ id: string }>(
        `SELECT create_identity_user($1::uuid,$2,$3,$4,$5,$6::uuid,$7::uuid,$8,$9::uuid,$10,$11,$12,$13,$14) AS id`,
        [input.schoolId,input.userId,input.name,passwordHash,input.role,input.primaryOrganizationId ?? null,input.primaryCampusId ?? null,input.scopeType,input.scopeId ?? null,input.department ?? null,input.className ?? null,input.phone ?? null,input.email ?? null,input.grantedBy]
      )
      const created = await getIdentityUser(input.schoolId, result.rows[0].id)
      if (!created) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Created identity could not be reloaded')
      return created
    } catch (error) {
      if (error instanceof IdentityAdminError) throw error
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      throw new IdentityAdminError(code === '23505' ? 'IDENTIFIER_ALREADY_EXISTS' : 'IDENTITY_SOURCE_ERROR', code === '23505' ? 'The account identifier already exists' : 'Atomic Postgres identity creation failed', error)
    }
  }

  const client = getSupabaseAdminClient()
  if (input.scopeId && input.scopeType === 'organization') {
    const organization = await client
      .from('organizations')
      .select('id')
      .eq('id', input.scopeId)
      .eq('school_id', input.schoolId)
      .maybeSingle()
    if (organization.error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Organization scope validation failed', organization.error)
    }
    if (!organization.data) throw new IdentityAdminError('INVALID_SCOPE', 'Organization is outside the active school')
  }

  const passwordHash = await hashPassword(input.password)
  const result = await client.rpc('create_identity_user', {
    p_school_id: input.schoolId,
    p_user_id: input.userId,
    p_name: input.name,
    p_password_hash: passwordHash,
    p_role: input.role,
    p_primary_organization_id: input.primaryOrganizationId ?? null,
    p_primary_campus_id: input.primaryCampusId ?? null,
    p_scope_type: input.scopeType,
    p_scope_id: input.scopeId ?? null,
    p_department: input.department ?? null,
    p_class_name: input.className ?? null,
    p_phone: input.phone ?? null,
    p_email: input.email ?? null,
    p_granted_by: input.grantedBy,
  })
  if (result.error) {
    const duplicate = result.error.code === '23505'
    throw new IdentityAdminError(
      duplicate ? 'IDENTIFIER_ALREADY_EXISTS' : 'IDENTITY_SOURCE_ERROR',
      duplicate ? 'The account identifier already exists' : 'Atomic identity creation failed',
      result.error
    )
  }

  const createdId = typeof result.data === 'string' ? result.data : String(result.data)
  const created = await client.from('users').select(SAFE_USER_COLUMNS).eq('id', createdId).single()
  if (created.error || !created.data) {
    throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Created identity could not be reloaded', created.error)
  }
  return toUser(created.data as unknown as Record<string, unknown>)
}

export interface UpdateIdentityUserInput {
  name?: string
  department?: string | null
  className?: string | null
  phone?: string | null
  email?: string | null
  avatar?: string | null
  status?: 'active' | 'disabled'
  password?: string
}

export async function updateIdentityUser(
  schoolId: string,
  userId: string,
  input: UpdateIdentityUserInput,
  actorId: string
): Promise<User> {
  if (!usesProductionIdentityRepository()) {
    throw new IdentityAdminError('DEVELOPMENT_IDENTITY_READ_ONLY', 'Development identities are read-only')
  }
  const passwordHash = input.password ? await hashPassword(input.password) : null
  const patch = {
    ...(input.name === undefined ? {} : { name: input.name }),
    ...(input.department === undefined ? {} : { department: input.department }),
    ...(input.className === undefined ? {} : { class_name: input.className }),
    ...(input.phone === undefined ? {} : { phone: input.phone }),
    ...(input.email === undefined ? {} : { email: input.email }),
    ...(input.avatar === undefined ? {} : { avatar: input.avatar }),
    ...(input.status === undefined ? {} : { status: input.status }),
  }
  if (hasPostgresDatabaseUrl()) {
    try {
      await getPostgresPool().query('SELECT update_identity_user($1::uuid,$2,$3::jsonb,$4,$5)', [schoolId,userId,JSON.stringify(patch),passwordHash,actorId])
      const updated = await getIdentityUser(schoolId, userId)
      if (!updated) throw new IdentityAdminError('USER_NOT_FOUND', 'Identity was not found after update')
      return updated
    } catch (error) {
      if (error instanceof IdentityAdminError) throw error
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      throw new IdentityAdminError(code === 'P0002' ? 'USER_NOT_FOUND' : 'IDENTITY_SOURCE_ERROR', code === 'P0002' ? 'Identity was not found' : 'Postgres identity update failed', error)
    }
  }
  const result = await getSupabaseAdminClient().rpc('update_identity_user', {
    p_school_id: schoolId,
    p_target_user_id: userId,
    p_patch: patch,
    p_password_hash: passwordHash,
    p_actor: actorId,
  })
  if (result.error) {
    const notFound = result.error.code === 'P0002'
    throw new IdentityAdminError(notFound ? 'USER_NOT_FOUND' : 'IDENTITY_SOURCE_ERROR', notFound ? 'Identity was not found' : 'Identity update failed', result.error)
  }
  const updated = await getIdentityUser(schoolId, userId)
  if (!updated) throw new IdentityAdminError('USER_NOT_FOUND', 'Identity was not found after update')
  return updated
}

export async function deactivateIdentityUser(
  schoolId: string,
  userId: string,
  actorId: string
): Promise<void> {
  if (!usesProductionIdentityRepository()) {
    throw new IdentityAdminError('DEVELOPMENT_IDENTITY_READ_ONLY', 'Development identities are read-only')
  }
  if (hasPostgresDatabaseUrl()) {
    try {
      await getPostgresPool().query('SELECT deactivate_identity_user($1::uuid,$2,$3)', [schoolId,userId,actorId])
      return
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      throw new IdentityAdminError(code === 'P0002' ? 'USER_NOT_FOUND' : 'IDENTITY_SOURCE_ERROR', code === 'P0002' ? 'Identity was not found' : 'Postgres identity deactivation failed', error)
    }
  }
  const result = await getSupabaseAdminClient().rpc('deactivate_identity_user', {
    p_school_id: schoolId,
    p_target_user_id: userId,
    p_actor: actorId,
  })
  if (result.error) {
    const notFound = result.error.code === 'P0002'
    throw new IdentityAdminError(notFound ? 'USER_NOT_FOUND' : 'IDENTITY_SOURCE_ERROR', notFound ? 'Identity was not found' : 'Identity deactivation failed', result.error)
  }
}

