import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'
import { buildBusinessScopeFilter, type BusinessScopeDomain } from '@/lib/authorization-resource-scope'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

const DOMAIN_QUERIES = {
  repair: `SELECT r.id,r.title,r.damage_type,r.location,r.description,r.status,r.priority,
    r.reporter_id,reporter.name AS reporter_name,r.assignee_id,assignee.name AS assignee_name,
    r.assigned_at,r.sla_due_at,r.completed_at,r.version,r.created_at,r.updated_at,
    count(*) OVER()::int AS total_count
    FROM repair_orders r LEFT JOIN users reporter ON reporter.id=r.reporter_id LEFT JOIN users assignee ON assignee.id=r.assignee_id
    WHERE r.school_id=$1::uuid AND NOT r.is_deleted`,
  notification: `SELECT n.id,n.title,n.type,n.status,n.publisher_id,p.name AS publisher_name,n.audience_count,n.channels,
    n.require_acknowledgement,n.publish_at,n.expire_at,n.version,n.created_at,n.updated_at,
    COALESCE(d.delivered,0)::int AS delivered_count,COALESCE(d.read_count,0)::int AS read_count,
    COALESCE(d.acknowledged,0)::int AS acknowledged_count,COALESCE(d.failed,0)::int AS failed_count,
    count(*) OVER()::int AS total_count
    FROM notifications n LEFT JOIN users p ON p.id=n.publisher_id
    LEFT JOIN LATERAL (SELECT count(*) FILTER(WHERE status IN('DELIVERED','READ','ACKNOWLEDGED')) delivered,
      count(*) FILTER(WHERE status IN('READ','ACKNOWLEDGED')) read_count,count(*) FILTER(WHERE status='ACKNOWLEDGED') acknowledged,
      count(*) FILTER(WHERE status='FAILED') failed FROM notification_deliveries WHERE notification_id=n.id AND school_id=n.school_id) d ON true
    WHERE n.school_id=$1::uuid`,
  classroom: `SELECT c.id,c.full_name,c.campus,c.building,c.floor,c.room_number,c.capacity,c.facilities,c.status,c.version,
    (SELECT count(*) FROM classroom_bookings b WHERE b.school_id=c.school_id AND b.classroom_id=c.id AND upper(b.status) IN('PENDING','APPROVED'))::int AS active_bookings,
    c.created_at,c.updated_at,count(*) OVER()::int AS total_count FROM classrooms c WHERE c.school_id=$1::uuid`,
  lost_found: `SELECT i.id,i.item_name,i.item_type,i.type,i.location,i.description,i.status,i.reporter_id,r.name AS reporter_name,
    i.claimer_id,c.name AS claimer_name,i.claimed_at,i.version,i.created_at,i.updated_at,count(*) OVER()::int AS total_count
    FROM lost_found i LEFT JOIN users r ON r.id=i.reporter_id LEFT JOIN users c ON c.id=i.claimer_id WHERE i.school_id=$1::uuid`,
  hygiene: `SELECT x.id,x.inspection_id,i.location,i.deterministic_score,i.ai_advisory_score,x.assignee_id,u.name AS assignee_name,
    x.requirements,x.severity,x.due_at,x.status,x.version,x.created_at,x.updated_at,count(*) OVER()::int AS total_count
    FROM hygiene_rectifications x JOIN hygiene_inspections i ON i.id=x.inspection_id AND i.school_id=x.school_id
    LEFT JOIN users u ON u.id=x.assignee_id WHERE x.school_id=$1::uuid`,
  dormitory: `SELECT d.id,d.building_name,d.total_rooms,d.occupied_rooms,d.manager_id,u.name AS manager_name,d.status,d.version,
    d.created_at,d.updated_at,count(*) OVER()::int AS total_count FROM dormitories d LEFT JOIN users u ON u.id=d.manager_id
    WHERE d.school_id=$1::uuid`,
  dorm_safety: `SELECT e.id,b.name AS building_name,e.dormitory_id,e.room_number,e.event_type,e.source,e.severity,
    e.observed_value,e.rule_evidence,e.status,e.confirmed_by,u.name AS confirmed_by_name,e.confirmed_at,e.confirmation_note,
    e.version,e.created_at,e.updated_at,count(*) OVER()::int AS total_count
    FROM dorm_safety_events e JOIN buildings b ON b.id=e.building_id LEFT JOIN users u ON u.id=e.confirmed_by
    WHERE e.school_id=$1::uuid`,
  visitor: `SELECT v.id,v.visitor_name,v.visitor_phone,v.dormitory_id,dorm.building_name AS dormitory_name,v.room_number,v.purpose,
    v.visit_time,v.leave_time,v.host_id,h.name AS host_name,v.status,v.decision_by,d.name AS decision_by_name,v.decision_at,
    v.qr_valid_from,v.qr_valid_until,v.qr_used_at,v.version,v.created_at,v.updated_at,count(*) OVER()::int AS total_count
    FROM visitors v LEFT JOIN dormitories dorm ON dorm.id=v.dormitory_id LEFT JOIN users h ON h.id=v.host_id
    LEFT JOIN users d ON d.id=v.decision_by WHERE v.school_id=$1::uuid`,
  energy: `SELECT r.id,r.asset_id,a.asset_code,a.name AS asset_name,a.asset_type,a.status AS asset_status,r.metric,r.value,r.unit,
    r.quality,r.observed_at,r.source,r.created_at,count(*) OVER()::int AS total_count
    FROM energy_readings r JOIN energy_assets a ON a.id=r.asset_id AND a.school_id=r.school_id WHERE r.school_id=$1::uuid`,
  material: `SELECT m.id,m.name,m.category,m.quantity,m.unit,m.threshold,m.status,m.location,m.supplier,m.unit_price,m.version,
    (SELECT count(*) FROM material_requests r WHERE r.school_id=m.school_id AND r.material_id=m.id AND r.status='pending')::int AS pending_requests,
    m.created_at,m.updated_at,count(*) OVER()::int AS total_count FROM materials m
    WHERE m.school_id=$1::uuid AND NOT m.is_deleted`,
  duty: `SELECT d.id,d.duty_date,d.class_name,d.location,d.students,d.duty_type,d.status,d.notes,d.version,
    d.created_at,d.updated_at,count(*) OVER()::int AS total_count FROM duty_schedules d WHERE d.school_id=$1::uuid`,
} as const

type Domain = BusinessScopeDomain

const DOMAIN_PERMISSIONS: Record<Domain, readonly string[]> = {
  repair: ['repair:view', 'repair:view:own'], notification: ['notification:view'], classroom: ['classroom:view'], lost_found: ['lost:view'],
  hygiene: ['duty:view'], dormitory: ['dorm:view'], dorm_safety: ['dorm:view'], visitor: ['visitor:check'], energy: ['energy:view'],
  material: ['material:view'], duty: ['duty:view', 'duty:create'],
}

const DOMAIN_TABLES: Record<Domain, string> = {
  repair: 'repair_orders', notification: 'notifications', classroom: 'classrooms', lost_found: 'lost_found',
  hygiene: 'hygiene_rectifications', dormitory: 'dormitories', dorm_safety: 'dorm_safety_events', visitor: 'visitors',
  energy: 'energy_readings', material: 'materials', duty: 'duty_schedules',
}
const ORDER_BY: Record<Domain, string> = {
  repair: 'created_at DESC', notification: 'created_at DESC', classroom: 'full_name ASC', lost_found: 'created_at DESC',
  hygiene: 'created_at DESC', dormitory: 'building_name ASC', dorm_safety: 'created_at DESC', visitor: 'created_at DESC',
  energy: 'observed_at DESC', material: 'status DESC,name ASC', duty: 'duty_date DESC',
}
const ALIASES: Record<Domain, string> = {
  repair: 'r', notification: 'n', classroom: 'c', lost_found: 'i', hygiene: 'x', dormitory: 'd', dorm_safety: 'e',
  visitor: 'v', energy: 'r', material: 'm', duty: 'd',
}

const AGGREGATE_FIELDS: Record<Domain, { state: string; place: string; timestamp: string; owner?: string }> = {
  repair: { state: 'status', place: 'location', timestamp: 'created_at', owner: 'reporter_id' },
  notification: { state: 'status', place: 'title', timestamp: 'created_at', owner: 'publisher_id' },
  classroom: { state: 'status', place: 'building', timestamp: 'created_at' },
  lost_found: { state: 'status', place: 'location', timestamp: 'created_at', owner: 'reporter_id' },
  hygiene: { state: 'status', place: 'location', timestamp: 'created_at' },
  dormitory: { state: 'status', place: 'building_name', timestamp: 'created_at' },
  dorm_safety: { state: 'status', place: 'building_name', timestamp: 'created_at' },
  visitor: { state: 'status', place: 'dormitory_name', timestamp: 'created_at', owner: 'host_id' },
  energy: { state: 'quality', place: 'asset_name', timestamp: 'observed_at' },
  material: { state: 'status', place: 'location', timestamp: 'created_at' },
  duty: { state: 'status', place: 'location', timestamp: 'duty_date', owner: 'class_name' },
}

/** Aggregate is another projection of precisely the same server-side scoped query as list/detail. */
async function aggregateScopedRecords(
  request: NextRequest, user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>,
  domain: Domain, scopedQuery: string, scopedValues: unknown[],
): Promise<NextResponse> {
  const fields = AGGREGATE_FIELDS[domain]
  const params = request.nextUrl.searchParams
  const status = params.get('status') ?? 'all'
  const locations = params.getAll('location').map((value) => value.trim()).filter(Boolean)
  const excludeLocations = params.getAll('excludeLocation').map((value) => value.trim()).filter(Boolean)
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')
  const ownerOnly = params.get('ownerOnly') === 'true'
  const excludeCompleted = params.get('excludeCompleted') === 'true'
  if (!['all', 'pending', 'processing', 'completed'].includes(status) ||
    locations.length > 5 || excludeLocations.length > 5 ||
    [...locations, ...excludeLocations].some((location) => location.length > 120) ||
    [dateFrom, dateTo].some((date) => date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
    (dateFrom && dateTo && dateFrom > dateTo) || (ownerOnly && !fields.owner)) {
    return NextResponse.json({ success: false, code: 'INVALID_AGGREGATE_FILTER' }, { status: 400 })
  }
  const values = [...scopedValues]
  const predicates: string[] = []
  const state = `upper(coalesce(scoped.${fields.state}::text,''))`
  const pending = `('PENDING','OPEN','DRAFT','WARNING','MAINTENANCE','PENDING_CONFIRMATION','AVAILABLE','FREE')`
  const processing = `('PROCESSING','IN_PROGRESS','REVIEWING','ASSIGNED','APPROVED')`
  const completed = `('COMPLETED','CLOSED','RESOLVED','CLAIMED','RETURNED','PUBLISHED','SENT','NORMAL','ACTIVE','OCCUPIED','BOOKED','VERIFIED','SUBMITTED')`
  if (status !== 'all') predicates.push(`${state} IN ${status === 'pending' ? pending : status === 'processing' ? processing : completed}`)
  if (excludeCompleted) predicates.push(`${state} NOT IN ${completed}`)
  if (ownerOnly && fields.owner) {
    values.push(fields.owner === 'class_name' ? user.class_name ?? '' : user.id)
    predicates.push(`scoped.${fields.owner}=$${values.length}`)
  }
  const place = `lower(coalesce(scoped.${fields.place}::text,''))`
  if (locations.length) {
    const included = locations.map((location) => {
      values.push(location)
      return `position(lower($${values.length}) in ${place})>0`
    })
    predicates.push(`(${included.join(' OR ')})`)
  }
  for (const location of excludeLocations) {
    values.push(location)
    predicates.push(`position(lower($${values.length}) in ${place})=0`)
  }
  const localDay = domain === 'duty' ? `scoped.${fields.timestamp}::date` : `(scoped.${fields.timestamp} AT TIME ZONE 'Asia/Shanghai')::date`
  if (dateFrom) {
    values.push(dateFrom)
    predicates.push(`${localDay}>=$${values.length}::date`)
  }
  if (dateTo) {
    values.push(dateTo)
    predicates.push(`${localDay}<=$${values.length}::date`)
  }
  const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''
  try {
    const result = await getPostgresPool().query<{
      total: number; pending: number; completed: number; latest_at: Date | null;
      by_location: Array<{ location: string; count: number }>
    }>(`WITH scoped AS (${scopedQuery}), filtered AS (
         SELECT scoped.${fields.state} AS record_state, scoped.${fields.place} AS record_place,
           scoped.${fields.timestamp} AS record_time FROM scoped ${where}
       )
       SELECT count(*)::int AS total,
         count(*) FILTER (WHERE upper(coalesce(record_state::text,'')) IN ${pending})::int AS pending,
         count(*) FILTER (WHERE upper(coalesce(record_state::text,'')) IN ${completed})::int AS completed,
         max(record_time) AS latest_at,
         (SELECT coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) FROM (
           SELECT coalesce(nullif(trim(record_place::text),''),'未标明地点') AS location,count(*)::int AS count
           FROM filtered GROUP BY 1 ORDER BY count DESC,location LIMIT 30
         ) grouped) AS by_location FROM filtered`, values)
    const row = result.rows[0]
    return NextResponse.json({ success: true, data: {
      domain, total: row.total, pending: row.pending, completed: row.completed,
      latestAt: row.latest_at?.toISOString(), byLocation: row.by_location, backend: 'postgres', aggregated: true,
    } }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('Scoped PG aggregate failed', error)
    return NextResponse.json({ success: false, code: 'BUSINESS_READ_FAILED', error: '业务统计暂不可用' }, { status: 503 })
  }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })
  const domain = request.nextUrl.searchParams.get('domain') as Domain | null
  if (!domain || !(domain in DOMAIN_QUERIES)) return NextResponse.json({ success: false, error: 'Unsupported business domain', code: 'INVALID_DOMAIN' }, { status: 400 })
  if (!DOMAIN_PERMISSIONS[domain].some((permission) => authorize(user, { permission }).allowed)) return NextResponse.json({ success: false, error: 'Current role cannot read this business domain', code: 'FORBIDDEN' }, { status: 403 })
  if (!hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'PostgreSQL business read model is not configured', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })

  const requestedId = request.nextUrl.searchParams.get('id')?.trim()
  const page = requestedId ? 1 : Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = requestedId ? 1 : Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? '20', 10) || 20))
  const scopeFilter = buildBusinessScopeFilter(user, domain, ALIASES[domain], DOMAIN_PERMISSIONS[domain], 2)
  const values: unknown[] = [user.school_id, ...scopeFilter.values]
  let query = `${DOMAIN_QUERIES[domain]} AND ${scopeFilter.clause}`
  if (requestedId) { values.push(requestedId); query += ` AND ${ALIASES[domain]}.id=$${values.length}` }
  const scopedQuery = query
  const scopedValues = [...values]
  if (request.nextUrl.searchParams.get('aggregate') === '1' && !requestedId) {
    return aggregateScopedRecords(request, user, domain, scopedQuery, scopedValues)
  }
  values.push(pageSize, (page - 1) * pageSize)
  query += ` ORDER BY ${ORDER_BY[domain]} LIMIT $${values.length - 1} OFFSET $${values.length}`

  try {
    const pool = getPostgresPool()
    const result = await pool.query<Record<string, unknown>>(query, values)
    if (requestedId && result.rows.length === 0) {
      const exists = await pool.query<{ exists: boolean }>(`SELECT EXISTS (SELECT 1 FROM ${DOMAIN_TABLES[domain]} scope_record WHERE scope_record.school_id=$1::uuid AND scope_record.id=$2) AS exists`, [user.school_id, requestedId])
      if (exists.rows[0]?.exists) {
        return NextResponse.json({ success: false, error: 'Resource is outside the authorized scope', code: 'SCOPE_DENIED' }, { status: 403 })
      }
      return NextResponse.json({ success: false, error: 'Resource not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    const total = result.rows.length > 0 ? Number(result.rows[0]?.total_count ?? 0)
      : page > 1 ? Number((await pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM (${scopedQuery}) scoped_records`, scopedValues)).rows[0]?.total ?? 0)
        : 0
    const records = result.rows.map((row) => {
      const record = Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'total_count'))
      if (domain === 'notification' && scopeFilter.clause !== 'TRUE') {
        // Global delivery metrics can disclose users outside the reader's assignment scope.
        for (const key of ['audience_count', 'delivered_count', 'read_count', 'acknowledged_count', 'failed_count']) record[key] = null
      }
      return record
    })
    return NextResponse.json({ success: true, data: { data: records, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, backend: 'postgres' } })
  } catch (error) {
    console.error('PG business read model failed', error)
    return NextResponse.json({ success: false, error: 'Business records unavailable', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
