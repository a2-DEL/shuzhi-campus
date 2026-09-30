import { getDevelopmentUsers } from '@/lib/development-users'
import type { ResourceScope } from '@/lib/authorization'
import { IdentityAdminError } from '@/lib/identity/admin'
import { usesProductionIdentityRepository } from '@/lib/identity/repository'
import { getSupabaseAdminClient } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { RoleScopeType, UserRole, UserRoleAssignment } from '@/types'

export interface RoleAssignmentFilters {
  page: number
  pageSize: number
  userId?: string
  role?: UserRole
  status?: 'active' | 'suspended' | 'revoked'
  scopeType?: RoleScopeType
  scopeId?: string
}

export interface GrantRoleAssignmentInput {
  schoolId: string
  userId: string
  role: UserRole
  scopeType: RoleScopeType
  scopeId?: string
  grantedBy: string
  validUntil?: string
  reason: string
}

function timestamp(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : undefined
}

function toAssignment(record: Record<string, unknown>): UserRoleAssignment {
  return {
    id: String(record.id),
    school_id: String(record.school_id),
    user_id: String(record.user_id),
    role: record.role as UserRole,
    scope_type: record.scope_type as RoleScopeType,
    scope_id: typeof record.scope_id === 'string' ? record.scope_id : undefined,
    is_primary: record.is_primary === true,
    status: record.status === 'suspended' || record.status === 'revoked' ? record.status : 'active',
    valid_from: timestamp(record.valid_from) ?? new Date(0).toISOString(),
    valid_until: timestamp(record.valid_until),
    granted_by: typeof record.granted_by === 'string' ? record.granted_by : undefined,
    source: 'direct',
  }
}

export async function listRoleAssignments(
  schoolId: string,
  filters: RoleAssignmentFilters
): Promise<{ assignments: UserRoleAssignment[]; total: number; source: 'database' | 'development' }> {
  if (!usesProductionIdentityRepository()) {
    let assignments = getDevelopmentUsers()
      .filter((user) => user.school_id === schoolId)
      .flatMap((user) => user.role_assignments ?? [])
    if (filters.userId) assignments = assignments.filter((item) => item.user_id === filters.userId)
    if (filters.role) assignments = assignments.filter((item) => item.role === filters.role)
    if (filters.status) assignments = assignments.filter((item) => item.status === filters.status)
    if (filters.scopeType) assignments = assignments.filter((item) => item.scope_type === filters.scopeType)
    if (filters.scopeId) assignments = assignments.filter((item) => item.scope_id === filters.scopeId)
    const total = assignments.length
    const start = (filters.page - 1) * filters.pageSize
    return {
      assignments: assignments.slice(start, start + filters.pageSize),
      total,
      source: 'development',
    }
  }

  if (hasPostgresDatabaseUrl()) {
    const values: unknown[] = [schoolId]
    const clauses = ['school_id=$1::uuid']
    if (filters.userId) { values.push(filters.userId); clauses.push(`user_id=$${values.length}`) }
    if (filters.role) { values.push(filters.role); clauses.push(`role=$${values.length}`) }
    if (filters.status) { values.push(filters.status); clauses.push(`status=$${values.length}`) }
    if (filters.scopeType) { values.push(filters.scopeType); clauses.push(`scope_type=$${values.length}`) }
    if (filters.scopeId) { values.push(filters.scopeId); clauses.push(`scope_id=$${values.length}::uuid`) }
    values.push(filters.pageSize, (filters.page - 1) * filters.pageSize)
    try {
      const result = await getPostgresPool().query<Record<string, unknown>>(
        `SELECT *,count(*) OVER()::int AS total_count FROM user_role_assignments WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values
      )
      return { assignments: result.rows.map(toAssignment), total: Number(result.rows[0]?.total_count ?? 0), source: 'database' }
    } catch (error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Postgres role assignment list failed', error)
    }
  }

  let query = getSupabaseAdminClient()
    .from('user_role_assignments')
    .select('*', { count: 'exact' })
    .eq('school_id', schoolId)
  if (filters.userId) query = query.eq('user_id', filters.userId)
  if (filters.role) query = query.eq('role', filters.role)
  if (filters.status) query = query.eq('status', filters.status)
  if (filters.scopeType) query = query.eq('scope_type', filters.scopeType)
  if (filters.scopeId) query = query.eq('scope_id', filters.scopeId)
  const start = (filters.page - 1) * filters.pageSize
  const result = await query.order('created_at', { ascending: false }).range(start, start + filters.pageSize - 1)
  if (result.error) {
    throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Role assignment list failed', result.error)
  }
  const rawData: unknown = result.data
  const records: Record<string, unknown>[] = Array.isArray(rawData)
    ? rawData.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
  return { assignments: records.map(toAssignment), total: result.count ?? 0, source: 'database' }
}

async function validateScopeEntity(
  schoolId: string,
  scopeType: RoleScopeType,
  scopeId?: string
): Promise<void> {
  if (scopeType === 'global') return
  if (scopeType === 'school') {
    if (scopeId !== schoolId) throw new IdentityAdminError('INVALID_SCOPE', 'School scope must match the active school')
    return
  }
  if (scopeType === 'self') {
    if (scopeId) throw new IdentityAdminError('INVALID_SCOPE', 'Self scope cannot have a scope id')
    return
  }
  if (!scopeId) throw new IdentityAdminError('INVALID_SCOPE', `${scopeType} scope requires a scope id`)

  const table = scopeType === 'campus' ? 'campuses'
    : scopeType === 'organization' ? 'organizations'
      : scopeType === 'class' ? 'academic_classes'
        : 'buildings'
  if (hasPostgresDatabaseUrl()) {
    try {
      const result = await getPostgresPool().query(`SELECT 1 FROM ${table} WHERE id=$1::uuid AND school_id=$2::uuid`, [scopeId, schoolId])
      if (!result.rows[0]) throw new IdentityAdminError('INVALID_SCOPE', 'Role scope is outside the active school')
      return
    } catch (error) {
      if (error instanceof IdentityAdminError) throw error
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Postgres role scope validation failed', error)
    }
  }
  const result = await getSupabaseAdminClient()
    .from(table)
    .select('id')
    .eq('id', scopeId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (result.error) {
    throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Role scope validation failed', result.error)
  }
  if (!result.data) throw new IdentityAdminError('INVALID_SCOPE', 'Role scope is outside the active school')
}

export async function grantRoleAssignment(input: GrantRoleAssignmentInput): Promise<UserRoleAssignment> {
  if (!usesProductionIdentityRepository()) {
    throw new IdentityAdminError('DEVELOPMENT_IDENTITY_READ_ONLY', 'Development role assignments are read-only')
  }
  if (hasPostgresDatabaseUrl()) {
    const pool = getPostgresPool()
    try {
      const target = await pool.query(`SELECT 1 FROM users WHERE id=$1 AND school_id=$2::uuid AND NOT is_deleted`, [input.userId,input.schoolId])
      if (!target.rows[0]) throw new IdentityAdminError('TARGET_USER_NOT_FOUND', 'Target identity is outside the active school')
      await validateScopeEntity(input.schoolId,input.scopeType,input.scopeId)
      const result = await pool.query<Record<string, unknown>>(
        `INSERT INTO user_role_assignments(school_id,user_id,role,scope_type,scope_id,is_primary,status,valid_from,valid_until,granted_by,reason)
         VALUES($1::uuid,$2,$3,$4,$5::uuid,false,'active',now(),$6::timestamptz,$7,$8) RETURNING *`,
        [input.schoolId,input.userId,input.role,input.scopeType,input.scopeId ?? null,input.validUntil ?? null,input.grantedBy,input.reason]
      )
      return toAssignment(result.rows[0])
    } catch (error) {
      if (error instanceof IdentityAdminError) throw error
      const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
      throw new IdentityAdminError(code === '23505' ? 'ROLE_ASSIGNMENT_EXISTS' : 'IDENTITY_SOURCE_ERROR', code === '23505' ? 'An active assignment already exists for this role and scope' : 'Postgres role assignment failed', error)
    }
  }

  const client = getSupabaseAdminClient()
  const target = await client
    .from('users')
    .select('id')
    .eq('id', input.userId)
    .eq('school_id', input.schoolId)
    .eq('is_deleted', false)
    .maybeSingle()
  if (target.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Target identity lookup failed', target.error)
  if (!target.data) throw new IdentityAdminError('TARGET_USER_NOT_FOUND', 'Target identity is outside the active school')
  await validateScopeEntity(input.schoolId, input.scopeType, input.scopeId)

  const result = await client.from('user_role_assignments').insert({
    school_id: input.schoolId,
    user_id: input.userId,
    role: input.role,
    scope_type: input.scopeType,
    scope_id: input.scopeId ?? null,
    is_primary: false,
    status: 'active',
    valid_from: new Date().toISOString(),
    valid_until: input.validUntil ?? null,
    granted_by: input.grantedBy,
    reason: input.reason,
  }).select('*').single()
  if (result.error || !result.data) {
    const duplicate = result.error?.code === '23505'
    throw new IdentityAdminError(
      duplicate ? 'ROLE_ASSIGNMENT_EXISTS' : 'IDENTITY_SOURCE_ERROR',
      duplicate ? 'An active assignment already exists for this role and scope' : 'Role assignment failed',
      result.error
    )
  }
  return toAssignment(result.data as unknown as Record<string, unknown>)
}

export async function getRoleAssignment(
  schoolId: string,
  assignmentId: string
): Promise<UserRoleAssignment | null> {
  if (!usesProductionIdentityRepository()) {
    return getDevelopmentUsers()
      .filter((user) => user.school_id === schoolId)
      .flatMap((user) => user.role_assignments ?? [])
      .find((assignment) => assignment.id === assignmentId) ?? null
  }
  if (hasPostgresDatabaseUrl()) {
    try {
      const result = await getPostgresPool().query<Record<string, unknown>>('SELECT * FROM user_role_assignments WHERE id=$1::uuid AND school_id=$2::uuid LIMIT 1',[assignmentId,schoolId])
      return result.rows[0] ? toAssignment(result.rows[0]) : null
    } catch (error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR','Postgres role assignment lookup failed',error)
    }
  }
  const result = await getSupabaseAdminClient()
    .from('user_role_assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (result.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Role assignment lookup failed', result.error)
  return result.data ? toAssignment(result.data as unknown as Record<string, unknown>) : null
}

export async function revokeRoleAssignment(
  schoolId: string,
  assignmentId: string
): Promise<UserRoleAssignment> {
  if (!usesProductionIdentityRepository()) {
    throw new IdentityAdminError('DEVELOPMENT_IDENTITY_READ_ONLY', 'Development role assignments are read-only')
  }
  if (hasPostgresDatabaseUrl()) {
    const pool = getPostgresPool()
    try {
      const existing = await pool.query<Record<string, unknown>>('SELECT * FROM user_role_assignments WHERE id=$1::uuid AND school_id=$2::uuid LIMIT 1',[assignmentId,schoolId])
      if (!existing.rows[0]) throw new IdentityAdminError('ROLE_ASSIGNMENT_NOT_FOUND','Role assignment was not found')
      if (existing.rows[0].is_primary === true) throw new IdentityAdminError('PRIMARY_ROLE_REQUIRES_TRANSFER','Primary roles must be transferred before revocation')
      const result = await pool.query<Record<string, unknown>>(`UPDATE user_role_assignments SET status='revoked',updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid RETURNING *`,[assignmentId,schoolId])
      return toAssignment(result.rows[0])
    } catch (error) {
      if (error instanceof IdentityAdminError) throw error
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR','Postgres role revocation failed',error)
    }
  }

  const client = getSupabaseAdminClient()
  const existing = await client
    .from('user_role_assignments')
    .select('*')
    .eq('id', assignmentId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (existing.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Role assignment lookup failed', existing.error)
  if (!existing.data) throw new IdentityAdminError('ROLE_ASSIGNMENT_NOT_FOUND', 'Role assignment was not found')
  if (existing.data.is_primary === true) {
    throw new IdentityAdminError('PRIMARY_ROLE_REQUIRES_TRANSFER', 'Primary roles must be transferred before revocation')
  }

  const result = await client
    .from('user_role_assignments')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', assignmentId)
    .eq('school_id', schoolId)
    .select('*')
    .single()
  if (result.error || !result.data) {
    throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Role revocation failed', result.error)
  }
  return toAssignment(result.data as unknown as Record<string, unknown>)
}

export async function resolveRoleScopeResource(
  schoolId: string,
  scopeType: RoleScopeType,
  scopeId?: string
): Promise<ResourceScope> {
  const resource: ResourceScope = { schoolId }
  if (!scopeId || scopeType === 'global' || scopeType === 'school' || scopeType === 'self') {
    return resource
  }
  if (!usesProductionIdentityRepository()) {
    if (scopeType === 'organization') {
      resource.organizationId = scopeId
      resource.organizationPathIds = [scopeId]
    } else if (scopeType === 'campus') resource.campusId = scopeId
    else if (scopeType === 'class') resource.classId = scopeId
    else if (scopeType === 'building') resource.buildingId = scopeId
    return resource
  }

  if (hasPostgresDatabaseUrl()) {
    const pool = getPostgresPool()
    try {
      if (scopeType === 'campus') {
        const result = await pool.query('SELECT 1 FROM campuses WHERE id=$1::uuid AND school_id=$2::uuid',[scopeId,schoolId])
        if (!result.rows[0]) throw new IdentityAdminError('INVALID_SCOPE','Campus is outside the active school')
        resource.campusId=scopeId
        return resource
      }
      const table = scopeType === 'organization' ? 'organizations' : scopeType === 'class' ? 'academic_classes' : 'buildings'
      const result = await pool.query<Record<string, unknown>>(`SELECT id${scopeType === 'organization' ? '' : ',organization_id'} FROM ${table} WHERE id=$1::uuid AND school_id=$2::uuid`,[scopeId,schoolId])
      const row=result.rows[0]
      if(!row) throw new IdentityAdminError('INVALID_SCOPE','Scoped entity is outside the active school')
      const organizationId=scopeType==='organization'?scopeId:typeof row.organization_id==='string'?row.organization_id:undefined
      if(scopeType==='class') resource.classId=scopeId
      if(scopeType==='building') resource.buildingId=scopeId
      if(organizationId){resource.organizationId=organizationId;const closure=await pool.query<{ancestor_id:string}>('SELECT ancestor_id FROM organization_closure WHERE school_id=$1::uuid AND descendant_id=$2::uuid',[schoolId,organizationId]);resource.organizationPathIds=closure.rows.map((item)=>item.ancestor_id)}
      return resource
    } catch(error){if(error instanceof IdentityAdminError) throw error;throw new IdentityAdminError('IDENTITY_SOURCE_ERROR','Postgres scoped entity lookup failed',error)}
  }

  const client = getSupabaseAdminClient()
  if (scopeType === 'campus') {
    const campus = await client.from('campuses').select('id').eq('id', scopeId).eq('school_id', schoolId).maybeSingle()
    if (campus.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Campus scope lookup failed', campus.error)
    if (!campus.data) throw new IdentityAdminError('INVALID_SCOPE', 'Campus is outside the active school')
    resource.campusId = scopeId
    return resource
  }

  const table = scopeType === 'organization' ? 'organizations'
    : scopeType === 'class' ? 'academic_classes'
      : 'buildings'
  const entity = await client
    .from(table)
    .select(scopeType === 'organization' ? 'id' : 'id, organization_id')
    .eq('id', scopeId)
    .eq('school_id', schoolId)
    .maybeSingle()
  if (entity.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Scoped entity lookup failed', entity.error)
  if (!entity.data) throw new IdentityAdminError('INVALID_SCOPE', 'Scoped entity is outside the active school')

  const entityRecord = entity.data as unknown as Record<string, unknown>
  const organizationId = scopeType === 'organization'
    ? scopeId
    : typeof entityRecord.organization_id === 'string' ? entityRecord.organization_id : undefined
  if (scopeType === 'class') resource.classId = scopeId
  if (scopeType === 'building') resource.buildingId = scopeId
  if (organizationId) {
    resource.organizationId = organizationId
    const closure = await client
      .from('organization_closure')
      .select('ancestor_id')
      .eq('school_id', schoolId)
      .eq('descendant_id', organizationId)
    if (closure.error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Organization path lookup failed', closure.error)
    }
    const rawPath: unknown = closure.data
    resource.organizationPathIds = Array.isArray(rawPath)
      ? rawPath.flatMap((item) => {
          if (!item || typeof item !== 'object') return []
          const value = (item as Record<string, unknown>).ancestor_id
          return typeof value === 'string' ? [value] : []
        })
      : [organizationId]
  }
  return resource
}

