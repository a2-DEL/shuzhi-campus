import { GET as readScopedBusinessRecords } from '@/app/api/ai/business-records/route'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getSupabaseAdminClient, hasSupabaseAdminCredentials } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

export async function GET(request: NextRequest) {
  // Legacy Supabase fallback and tenant-only PG query are superseded by the assignment-scoped PG read model.
  const pgResponse: NextResponse | null = await readScopedEnergy(request)
  if (pgResponse) return pgResponse
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })
  const postgres = hasPostgresDatabaseUrl()
  const supabase = hasSupabaseAdminCredentials()
  if (!postgres && !supabase) {
    return NextResponse.json({ success: false, error: 'Real energy database is not configured', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  }

  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? '20', 10) || 20))
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  try {
    if (postgres) {
      const result = await getPostgresPool().query(
        `SELECT r.id,r.asset_id,a.asset_code,a.name AS asset_name,a.asset_type,a.status AS asset_status,r.metric,r.value,r.unit,r.quality,r.observed_at,r.source,r.created_at,count(*) OVER()::int AS total_count
         FROM energy_readings r JOIN energy_assets a ON a.id=r.asset_id AND a.school_id=r.school_id
         WHERE r.school_id=$1::uuid ORDER BY r.observed_at DESC LIMIT $2 OFFSET $3`,
        [user.school_id, pageSize, from]
      )
      const total = Number(result.rows[0]?.total_count ?? 0)
      const records = result.rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'total_count')))
      return NextResponse.json({ success: true, data: { data: records, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }, backend: 'postgres' } })
    }

    const result = await getSupabaseAdminClient()
      .from('energy_readings')
      .select('id, asset_id, metric, value, unit, quality, observed_at, source, created_at, energy_assets!inner(asset_code, name, asset_type, status)', { count: 'exact' })
      .eq('school_id', user.school_id)
      .order('observed_at', { ascending: false })
      .range(from, to)

    if (result.error) throw new Error(result.error.message)
    const records = (result.data ?? []).map((row) => {
      const asset = Array.isArray(row.energy_assets) ? row.energy_assets[0] : row.energy_assets
      return {
        id: row.id,
        asset_id: row.asset_id,
        asset_code: asset?.asset_code ?? '-',
        asset_name: asset?.name ?? '-',
        asset_type: asset?.asset_type ?? '-',
        asset_status: asset?.status ?? '-',
        metric: row.metric,
        value: row.value,
        unit: row.unit,
        quality: row.quality,
        observed_at: row.observed_at,
        source: row.source,
        created_at: row.created_at,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        data: records,
        pagination: { page, pageSize, total: result.count ?? 0, totalPages: Math.ceil((result.count ?? 0) / pageSize) },
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Energy readings unavailable', code: 'ENERGY_READ_FAILED' }, { status: 503 })
  }
}

async function readScopedEnergy(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url)
  url.searchParams.set('domain', 'energy')
  return readScopedBusinessRecords(new NextRequest(url, { headers: request.headers }))
}
