import { hasPostgresDatabaseUrl, getPostgresPool } from '@/storage/database/postgres'
import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { getAuthUser } from '@/lib/auth'

// 获取学生消息列表
export async function GET(request: NextRequest) {
  const pgResponse: NextResponse | null = await readPgMessages(request)
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
    const type = searchParams.get('type') // EXAM, REPAIR, ACTIVITY, SYSTEM
    const unreadOnly = searchParams.get('unreadOnly') === 'true'

    const client = getSupabaseClient()

    // 获取通知公告（学生可见的）
    let query = client
      .from('notifications')
      .select('id, title, content, type, created_at', { count: 'exact' })
      .eq('status', 'published')
      .order('created_at', { ascending: false })

    if (type) {
      query = query.eq('type', type)
    }

    const start = (page - 1) * pageSize
    query = query.range(start, start + pageSize - 1)

    const { data: notifications, count, error } = await query

    if (error) throw error

    // 检查每条通知的阅读状态
    const notificationIds = notifications?.map(n => n.id) || []
    let readStatus: Record<string, boolean> = {}

    if (notificationIds.length > 0) {
      const { data: readRecords } = await client
        .from('notification_reads')
        .select('notification_id')
        .eq('user_id', authUser.id)
        .in('notification_id', notificationIds)

      readStatus = (readRecords || []).reduce((acc, record) => {
        acc[record.notification_id] = true
        return acc
      }, {} as Record<string, boolean>)
    }

    // 添加阅读状态
    const messages = notifications?.map(n => ({
      ...n,
      isRead: !!readStatus[n.id],
      created_at: n.created_at
    })) || []

    // 如果需要未读消息，过滤
    const filteredMessages = unreadOnly
      ? messages.filter(m => !m.isRead)
      : messages

    // 统计未读数
    const unreadCount = messages.filter(m => !m.isRead).length

    return NextResponse.json({
      success: true,
      data: {
        messages: filteredMessages,
        unreadCount,
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize)
        }
      }
    })
  } catch (error) {
    console.error('获取消息列表失败:', error)
    return NextResponse.json({ success: false, error: '获取数据失败' }, { status: 500 })
  }
}

interface PgMessageRow {
  id: string
  title: string
  content: string
  type: string
  created_at: Date | string
  isRead: boolean
  total_count: number
}

async function readPgMessages(request: NextRequest): Promise<NextResponse> {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding required', code: 'TENANT_REQUIRED' }, { status: 409 })
  if (!hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'Messages unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  const query = request.nextUrl.searchParams
  const page = Math.max(1, Number.parseInt(query.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.get('pageSize') ?? '20', 10) || 20))
  const type = query.get('type')
  if (type && !['EXAM', 'REPAIR', 'ACTIVITY', 'SYSTEM'].includes(type)) {
    return NextResponse.json({ success: false, error: 'Invalid type', code: 'INVALID_TYPE' }, { status: 400 })
  }
  const unreadOnly = query.get('unreadOnly') === 'true'
  try {
    const values: unknown[] = [user.school_id, user.id]
    let where = `d.school_id=$1::uuid AND d.recipient_user_id=$2 AND d.channel='platform'
      AND d.status IN ('DELIVERED','READ','ACKNOWLEDGED') AND upper(n.status)='PUBLISHED'`
    if (type) { values.push(type); where += ` AND n.type=$${values.length}` }
    const pool = getPostgresPool()
    const unread = await pool.query<{ count: number }>(
      `SELECT count(DISTINCT n.id)::int AS count FROM notification_deliveries d JOIN notifications n
       ON n.id=d.notification_id AND n.school_id=d.school_id WHERE ${where} AND d.status='DELIVERED'`, values,
    )
    const countValues = [...values]
    if (unreadOnly) where += ` AND d.status='DELIVERED'`
    const totalResult = await pool.query<{ count: number }>(
      `SELECT count(DISTINCT n.id)::int AS count FROM notification_deliveries d JOIN notifications n
       ON n.id=d.notification_id AND n.school_id=d.school_id WHERE ${where}`, countValues,
    )
    values.push(pageSize, (page - 1) * pageSize)
    const result = await pool.query<PgMessageRow>(
      `SELECT n.id,n.title,n.content,n.type,n.created_at,bool_and(d.status IN ('READ','ACKNOWLEDGED')) AS "isRead"
       FROM notification_deliveries d JOIN notifications n ON n.id=d.notification_id AND n.school_id=d.school_id
       WHERE ${where} GROUP BY n.id ORDER BY n.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values,
    )
    const total = totalResult.rows[0]?.count ?? 0
    return NextResponse.json({ success: true, data: { messages: result.rows, unreadCount: unread.rows[0]?.count ?? 0,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } } })
  } catch (error) {
    console.error('Failed to read PG messages', error)
    return NextResponse.json({ success: false, error: '消息暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
