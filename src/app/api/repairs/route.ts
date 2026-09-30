import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'
import { buildBusinessScopeFilter } from '@/lib/authorization-resource-scope'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { createPgRepair, repairCreateSchema, RepairOwnerConfigurationError } from '@/lib/repairs/service'

// Legacy Supabase CRUD was intentionally disabled here. Repairs now use the tenant-bound PG domain data;
// all governed dispatch/status writes remain exclusively in the Skill gateway.

function errorResponse(error: string, code: string, status: number): NextResponse {
  return NextResponse.json({ success: false, error, code }, { status })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return errorResponse('Authentication required', 'UNAUTHENTICATED', 401)
  if (!user.school_id) return errorResponse('Tenant binding is required', 'TENANT_REQUIRED', 409)
  const permissions = ['repair:view', 'repair:view:own'] as const
  if (!permissions.some((permission) => authorize(user, { permission }).allowed)) return errorResponse('Forbidden', 'FORBIDDEN', 403)
  if (!hasPostgresDatabaseUrl()) return errorResponse('PostgreSQL business backend unavailable', 'BUSINESS_BACKEND_UNAVAILABLE', 503)

  const search = request.nextUrl.searchParams
  const page = Math.max(1, Number.parseInt(search.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(search.get('pageSize') ?? '10', 10) || 10))
  const scope = buildBusinessScopeFilter(user, 'repair', 'r', permissions, 2)
  const values: unknown[] = [user.school_id, ...scope.values]
  let where = `r.school_id=$1::uuid AND NOT r.is_deleted AND ${scope.clause}`
  for (const [parameter, column] of [
    ['status', 'status'], ['priority', 'priority'], ['reporter_id', 'reporter_id'],
    ['assignee_id', 'assignee_id'], ['type', 'damage_type'],
  ] as const) {
    const value = search.get(parameter)
    if (!value) continue
    values.push(parameter === 'status' ? value.toUpperCase() : value)
    where += ` AND r.${column}=$${values.length}`
  }
  try {
    const pool = getPostgresPool()
    const countResult = await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM repair_orders r WHERE ${where}`, values)
    const total = countResult.rows[0]?.total ?? 0
    values.push(pageSize, (page - 1) * pageSize)
    const result = await pool.query<Record<string, unknown>>(
      `SELECT r.id,r.title,r.damage_type,r.location,r.description,r.images,r.status,r.priority,r.reporter_id,
        r.assignee_id,r.organization_id,r.building_id,r.assigned_at,r.sla_due_at,r.completed_at,r.version,r.created_at,r.updated_at
       FROM repair_orders r WHERE ${where} ORDER BY r.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    )
    return NextResponse.json({ success: true, data: { data: result.rows, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } })
  } catch (error) {
    console.error('Failed to read PG repairs', error)
    return errorResponse('Repair records unavailable', 'BUSINESS_READ_FAILED', 503)
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return errorResponse('Authentication required', 'UNAUTHENTICATED', 401)
  if (!user.school_id) return errorResponse('Tenant binding is required', 'TENANT_REQUIRED', 409)
  if (!authorize(user, { permission: 'repair:create' }).allowed) return errorResponse('Forbidden', 'FORBIDDEN', 403)
  if (!hasPostgresDatabaseUrl()) return errorResponse('PostgreSQL business backend unavailable', 'BUSINESS_BACKEND_UNAVAILABLE', 503)
  const body: unknown = await request.json().catch(() => null)
  const parsed = repairCreateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid repair request', code: 'INVALID_REPAIR_REQUEST', fieldErrors: parsed.error.flatten().fieldErrors }, { status: 400 })
  }
  try {
    const repair = await createPgRepair(user, parsed.data)
    return NextResponse.json({ success: true, data: repair }, { status: 201 })
  } catch (error) {
    if (error instanceof RepairOwnerConfigurationError) {
      return errorResponse(error.message, 'REPAIR_OWNER_CONFIGURATION_REQUIRED', 409)
    }
    console.error('Failed to create PG repair', error)
    return errorResponse('创建报修工单失败，请稍后重试', 'REPAIR_CREATE_FAILED', 503)
  }
}
