import {
  DEVELOPMENT_BUILDING_ID,
  DEVELOPMENT_CLASS_ID,
  DEVELOPMENT_ORGANIZATION_IDS,
  DEVELOPMENT_SCHOOL_ID,
} from '@/lib/development-users'
import { IdentityAdminError } from '@/lib/identity/admin'
import { usesProductionIdentityRepository } from '@/lib/identity/repository'
import { getSupabaseAdminClient } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { RoleScopeType, User } from '@/types'

export interface ScopeOption {
  id: string
  type: Exclude<RoleScopeType, 'global' | 'self' | 'school'>
  name: string
  code?: string
  organization_id?: string
}

export interface IdentityScopeCatalog {
  organizations: ScopeOption[]
  campuses: ScopeOption[]
  classes: ScopeOption[]
  buildings: ScopeOption[]
  source: 'database' | 'development'
}

function normalizeRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    : []
}

function options(rows: unknown, type: ScopeOption['type']): ScopeOption[] {
  return normalizeRows(rows).map((row) => ({
    id: String(row.id),
    type,
    name: String(row.name),
    code: typeof row.code === 'string' ? row.code : undefined,
    organization_id: typeof row.organization_id === 'string' ? row.organization_id : undefined,
  }))
}

export async function listIdentityScopes(user: User): Promise<IdentityScopeCatalog> {
  if (!user.school_id) throw new IdentityAdminError('INVALID_IDENTITY_RECORD', 'Active user has no school')
  if (!usesProductionIdentityRepository()) {
    return {
      organizations: Object.entries(DEVELOPMENT_ORGANIZATION_IDS).map(([code, id]) => ({
        id,
        type: 'organization',
        code,
        name: code === 'platform' ? 'Platform Governance'
          : code === 'academic' ? 'Academic Affairs'
            : code === 'logistics' ? 'Logistics'
              : code === 'dormitory' ? 'Dormitory Operations'
                : 'Student Services',
      })),
      campuses: [],
      classes: [{ id: DEVELOPMENT_CLASS_ID, type: 'class', code: 'demo-class', name: 'Demo Class', organization_id: DEVELOPMENT_ORGANIZATION_IDS.student }],
      buildings: [{ id: DEVELOPMENT_BUILDING_ID, type: 'building', code: 'demo-building', name: 'Demo Dormitory Building', organization_id: DEVELOPMENT_ORGANIZATION_IDS.dormitory }],
      source: 'development',
    }
  }

  if (hasPostgresDatabaseUrl()) {
    const pool = getPostgresPool()
    try {
      let organizationIds: string[] | undefined
      const organizationAssignments = (user.role_assignments ?? []).filter(
        (assignment) => assignment.scope_type === 'organization' && assignment.scope_id
      )
      if (organizationAssignments.length > 0) {
        const roots = organizationAssignments.map((assignment) => assignment.scope_id as string)
        const closure = await pool.query<{ descendant_id: string }>(
          `SELECT descendant_id::text AS descendant_id
           FROM organization_closure
           WHERE school_id=$1::uuid AND ancestor_id=ANY($2::uuid[])`,
          [user.school_id, roots]
        )
        organizationIds = closure.rows.map((row) => row.descendant_id)
        if (organizationIds.length === 0) organizationIds = roots
      }

      const scopedValues: unknown[] = [user.school_id]
      const organizationClause = organizationIds
        ? ` AND id=ANY($2::uuid[])`
        : ''
      const childOrganizationClause = organizationIds
        ? ` AND organization_id=ANY($2::uuid[])`
        : ''
      if (organizationIds) scopedValues.push(organizationIds)

      const [organizations, campuses, classes, buildings] = await Promise.all([
        pool.query<Record<string, unknown>>(
          `SELECT id::text AS id,code,name
           FROM organizations
           WHERE school_id=$1::uuid AND status='active'${organizationClause}
           ORDER BY name`,
          scopedValues
        ),
        pool.query<Record<string, unknown>>(
          `SELECT id::text AS id,code,name
           FROM campuses
           WHERE school_id=$1::uuid AND status='active'
           ORDER BY name`,
          [user.school_id]
        ),
        pool.query<Record<string, unknown>>(
          `SELECT id::text AS id,code,name,organization_id::text AS organization_id
           FROM academic_classes
           WHERE school_id=$1::uuid AND status='active'${childOrganizationClause}
           ORDER BY name`,
          scopedValues
        ),
        pool.query<Record<string, unknown>>(
          `SELECT id::text AS id,code,name,organization_id::text AS organization_id
           FROM buildings
           WHERE school_id=$1::uuid AND status='active'${childOrganizationClause}
           ORDER BY name`,
          scopedValues
        ),
      ])
      return {
        organizations: options(organizations.rows, 'organization'),
        campuses: options(campuses.rows, 'campus'),
        classes: options(classes.rows, 'class'),
        buildings: options(buildings.rows, 'building'),
        source: 'database',
      }
    } catch (error) {
      throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Postgres identity scope catalog lookup failed', error)
    }
  }

  const client = getSupabaseAdminClient()
  let organizationIds: string[] | undefined
  if (user.role_assignments?.some((assignment) => assignment.scope_type === 'organization')) {
    const assignments = user.role_assignments.filter((assignment) => assignment.scope_type === 'organization' && assignment.scope_id)
    const roots = assignments.map((assignment) => assignment.scope_id as string)
    const closure = await client
      .from('organization_closure')
      .select('descendant_id')
      .eq('school_id', user.school_id)
      .in('ancestor_id', roots)
    if (closure.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Organization catalog lookup failed', closure.error)
    organizationIds = normalizeRows(closure.data).flatMap((row) => typeof row.descendant_id === 'string' ? [row.descendant_id] : [])
    if (organizationIds.length === 0) organizationIds = roots
  }

  let organizationsQuery = client.from('organizations').select('id, code, name').eq('school_id', user.school_id).eq('status', 'active')
  let classesQuery = client.from('academic_classes').select('id, code, name, organization_id').eq('school_id', user.school_id).eq('status', 'active')
  let buildingsQuery = client.from('buildings').select('id, code, name, organization_id').eq('school_id', user.school_id).eq('status', 'active')
  if (organizationIds) {
    organizationsQuery = organizationsQuery.in('id', organizationIds)
    classesQuery = classesQuery.in('organization_id', organizationIds)
    buildingsQuery = buildingsQuery.in('organization_id', organizationIds)
  }
  const [organizations, campuses, classes, buildings] = await Promise.all([
    organizationsQuery,
    client.from('campuses').select('id, code, name').eq('school_id', user.school_id).eq('status', 'active'),
    classesQuery,
    buildingsQuery,
  ])
  for (const result of [organizations, campuses, classes, buildings]) {
    if (result.error) throw new IdentityAdminError('IDENTITY_SOURCE_ERROR', 'Identity scope catalog lookup failed', result.error)
  }
  return {
    organizations: options(organizations.data, 'organization'),
    campuses: options(campuses.data, 'campus'),
    classes: options(classes.data, 'class'),
    buildings: options(buildings.data, 'building'),
    source: 'database',
  }
}
