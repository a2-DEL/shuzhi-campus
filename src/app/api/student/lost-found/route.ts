import { hasPostgresDatabaseUrl, getPostgresPool } from '@/storage/database/postgres'
import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { getAuthUser } from '@/lib/auth'

// 获取学生失物招领列表
export async function GET(request: NextRequest) {
  const pgResponse: NextResponse | null = await readPgStudentLostFound(request)
  if (pgResponse) return pgResponse
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'student', { allowedRoles: ['student', 'class_committee', 'super_admin'] })
  if (legacyResponse) return legacyResponse

  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const type = searchParams.get('type') // lost, found
    const itemType = searchParams.get('itemType') // 书, 书包, 证件, 其他物品

    const client = getSupabaseClient()

    let query = client
      .from('lost_found')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    if (itemType) {
      query = query.eq('item_type', itemType)
    }

    const start = (page - 1) * pageSize
    query = query.range(start, start + pageSize - 1)

    const { data: items, count, error } = await query

    if (error) throw error

    // 获取用户发布的物品
    const { data: myItems } = await client
      .from('lost_found')
      .select('id')
      .eq('reporter_id', authUser.id)

    const myItemIds = new Set(myItems?.map(i => i.id) || [])

    // 添加是否为本人发布标记
    const formattedItems = items?.map(item => ({
      ...item,
      isOwner: myItemIds.has(item.id)
    })) || []

    // 统计
    const stats = {
      total: count || 0,
      lost: items?.filter(i => i.type === 'lost').length || 0,
      found: items?.filter(i => i.type === 'found').length || 0,
      myReports: myItemIds.size
    }

    return NextResponse.json({
      success: true,
      data: {
        items: formattedItems,
        stats,
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize)
        }
      }
    })
  } catch (error) {
    console.error('获取失物招领列表失败:', error)
    return NextResponse.json({ success: false, error: '获取数据失败' }, { status: 500 })
  }
}

// 创建失物招领
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'student', { allowedRoles: ['student', 'class_committee', 'super_admin'] })
  if (legacyResponse) return legacyResponse

  try {
    const authUser = await getAuthUser(request)
    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    }

    const body = await request.json()
    const { type, itemType, itemName, description, location, foundDate } = body

    if (!type || !itemType || !itemName) {
      return NextResponse.json({ success: false, error: '请填写完整信息' }, { status: 400 })
    }

    const client = getSupabaseClient()

    const { data, error } = await client
      .from('lost_found')
      .insert({
        type,
        item_type: itemType,
        item_name: itemName,
        description,
        location,
        found_date: foundDate,
        reporter_id: authUser.id,
        status: 'open'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
      message: '发布成功'
    })
  } catch (error) {
    console.error('创建失物招领失败:', error)
    return NextResponse.json({ success: false, error: '创建失败' }, { status: 500 })
  }
}

interface StudentLostItem {
  id: string
  type: string
  item_type: string
  item_name: string
  description: string | null
  location: string | null
  status: string
  reporter_id: string
  created_at: Date | string
}

async function readPgStudentLostFound(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'Lost-and-found unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  const type = request.nextUrl.searchParams.get('type')
  if (type && !['lost', 'found'].includes(type)) return NextResponse.json({ success: false, error: 'Invalid item type', code: 'INVALID_TYPE' }, { status: 400 })
  const page = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get('pageSize') ?? '20', 10) || 20))
  const values: unknown[] = [user.school_id, user.id]
  let where = `school_id=$1::uuid AND (reporter_id=$2 OR claimer_id=$2)`
  if (type) { values.push(type); where += ` AND type=$${values.length}` }
  try {
    const pool = getPostgresPool()
    const counts = await pool.query<{ total: number; lost: number; found: number; my_reports: number }>(
      `SELECT count(*)::int total,count(*) FILTER (WHERE type='lost')::int lost,
       count(*) FILTER (WHERE type='found')::int found,count(*) FILTER (WHERE reporter_id=$2)::int my_reports
       FROM lost_found WHERE ${where}`, values,
    )
    values.push(pageSize, (page - 1) * pageSize)
    const items = await pool.query<StudentLostItem>(
      `SELECT id,type,item_type,item_name,description,location,status,reporter_id,created_at FROM lost_found
       WHERE ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
    )
    const row = counts.rows[0]
    return NextResponse.json({ success: true, data: {
      items: items.rows.map((item) => ({ ...item, isOwner: item.reporter_id === user.id })),
      stats: { total: row.total, lost: row.lost, found: row.found, myReports: row.my_reports },
      pagination: { page, pageSize, total: row.total, totalPages: Math.ceil(row.total / pageSize) },
    } })
  } catch (error) {
    console.error('Failed to read PG student lost-and-found', error)
    return NextResponse.json({ success: false, error: '失物记录暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
