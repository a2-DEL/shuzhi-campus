import { requireRepairReadScope } from '@/lib/repairs/reader'
import { getPostgresPool } from '@/storage/database/postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 报修统计接口
export async function GET(request: NextRequest) {
  const access = await requireRepairReadScope(request)
  if (access instanceof NextResponse) return access
  // Legacy Supabase statistics are quarantined; scoped PG rows drive all aggregate counts.
  const pgResponse: NextResponse | null = await readScopedStats(request, access)
  if (pgResponse) return pgResponse
  try {
    const searchParams = request.nextUrl.searchParams
    const reporter_id = searchParams.get('reporter_id')
    const assignee_id = searchParams.get('assignee_id')
    const dateRange = searchParams.get('dateRange') // 'week', 'month', 'year', 'all'

    const client = getSupabaseClient()

    // 构建查询条件
    let query = client.from('repairs').select('*')

    if (reporter_id) {
      query = query.eq('reporter_id', reporter_id)
    }

    if (assignee_id) {
      query = query.eq('assignee_id', assignee_id)
    }

    // 日期过滤
    const now = new Date()
    let startDate: Date | null = null
    if (dateRange === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else if (dateRange === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    } else if (dateRange === 'year') {
      startDate = new Date(now.getFullYear(), 0, 1)
    }

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }

    const { data: repairs, error } = await query

    if (error) {
      console.error('查询报修数据失败:', error)
      // 返回默认统计
      return NextResponse.json({
        success: true,
        data: getDefaultStats(),
      })
    }

    // 计算统计数据
    const stats = calculateStats(repairs || [])

    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('获取报修统计失败:', error)
    return NextResponse.json(
      { success: false, error: '获取报修统计失败' },
      { status: 500 }
    )
  }
}

function calculateStats(repairs: Array<{ status: string; priority: number; type: string; created_at: string; updated_at: string }>) {
  // 基础统计
  const total = repairs.length
  const pending = repairs.filter((r) => r.status === 'PENDING').length
  const dispatched = repairs.filter((r) => r.status === 'DISPATCHED').length
  const processing = repairs.filter((r) => r.status === 'PROCESSING').length
  const completed = repairs.filter((r) => r.status === 'COMPLETED').length
  const rejected = repairs.filter((r) => r.status === 'REJECTED').length
  const closed = repairs.filter((r) => r.status === 'CLOSED').length

  // 优先级统计
  const urgent = repairs.filter((r) => r.priority === 1).length
  const normal = repairs.filter((r) => r.priority === 2).length
  const low = repairs.filter((r) => r.priority === 3).length

  // 类型统计
  const typeStats: Record<string, number> = {}
  repairs.forEach((repair) => {
    typeStats[repair.type] = (typeStats[repair.type] || 0) + 1
  })

  // 按日期分组统计（最近7天）
  const dailyStats: Record<string, number> = {}
  const now = new Date()
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const dateStr = date.toISOString().split('T')[0]
    dailyStats[dateStr] = 0
  }
  repairs.forEach((repair) => {
    const dateStr = repair.created_at.split('T')[0]
    if (dailyStats[dateStr] !== undefined) {
      dailyStats[dateStr]++
    }
  })

  // 平均处理时间（已完成工单）
  const completedRepairs = repairs.filter((r) => r.status === 'COMPLETED')
  let avgProcessingTime = 0
  if (completedRepairs.length > 0) {
    const totalTime = completedRepairs.reduce((sum, repair) => {
      const created = new Date(repair.created_at).getTime()
      const updated = new Date(repair.updated_at).getTime()
      return sum + (updated - created)
    }, 0)
    avgProcessingTime = totalTime / completedRepairs.length
  }

  // 完成率
  const completionRate = total > 0 ? (completed / total) * 100 : 0

  // 响应率（已派单 + 处理中 + 已完成）/ 总数
  const responseRate = total > 0 ? ((dispatched + processing + completed) / total) * 100 : 0

  return {
    overview: {
      total,
      pending,
      processing: dispatched + processing,
      completed,
      rejected,
      closed,
      completionRate: Math.round(completionRate * 100) / 100,
      responseRate: Math.round(responseRate * 100) / 100,
      avgProcessingTime: Math.round(avgProcessingTime / 1000 / 60), // 转换为分钟
    },
    priority: {
      urgent,
      normal,
      low,
    },
    types: Object.entries(typeStats).map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    })),
    daily: Object.entries(dailyStats).map(([date, count]) => ({
      date,
      count,
    })),
  }
}

function getDefaultStats() {
  return {
    overview: {
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      rejected: 0,
      closed: 0,
      completionRate: 0,
      responseRate: 0,
      avgProcessingTime: 0,
    },
    priority: {
      urgent: 0,
      normal: 0,
      low: 0,
    },
    types: [],
    daily: Array.from({ length: 7 }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (6 - i))
      return {
        date: date.toISOString().split('T')[0],
        count: 0,
      }
    }),
  }
}

interface ScopedRepairStat {
  status: string
  priority: string | null
  damage_type: string
  created_at: Date | string
  updated_at: Date | string | null
}

async function readScopedStats(
  request: NextRequest,
  access: Exclude<Awaited<ReturnType<typeof requireRepairReadScope>>, NextResponse>,
): Promise<NextResponse> {
  const values = [...access.values]
  let where = `r.school_id=$1::uuid AND NOT r.is_deleted AND ${access.clause}`
  for (const [name, column] of [['reporter_id', 'reporter_id'], ['assignee_id', 'assignee_id']] as const) {
    const value = request.nextUrl.searchParams.get(name)
    if (!value) continue
    values.push(value)
    where += ` AND r.${column}=$${values.length}`
  }
  const range = request.nextUrl.searchParams.get('dateRange')
  if (range && range !== 'all') {
    if (!['week', 'month', 'year'].includes(range)) return NextResponse.json({ success: false, error: 'Invalid date range', code: 'INVALID_DATE_RANGE' }, { status: 400 })
    const now = new Date()
    const start = range === 'week' ? new Date(now.getTime() - 7 * 86400000)
      : range === 'month' ? new Date(now.getFullYear(), now.getMonth(), 1)
        : new Date(now.getFullYear(), 0, 1)
    values.push(start.toISOString())
    where += ` AND r.created_at >= $${values.length}::timestamptz`
  }
  try {
    const result = await getPostgresPool().query<ScopedRepairStat>(
      `SELECT r.status,r.priority,r.damage_type,r.created_at,r.updated_at FROM repair_orders r WHERE ${where}`,
      values,
    )
    const rows = result.rows.map((row) => ({
      status: row.status, priority: Number(row.priority ?? 2), type: row.damage_type,
      created_at: new Date(row.created_at).toISOString(), updated_at: new Date(row.updated_at ?? row.created_at).toISOString(),
    }))
    return NextResponse.json({ success: true, data: calculateStats(rows) })
  } catch (error) {
    console.error('Failed to calculate PG repair statistics', error)
    return NextResponse.json({ success: false, error: '报修统计暂不可用', code: 'BUSINESS_READ_FAILED' }, { status: 503 })
  }
}
