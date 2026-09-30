import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取值日记录
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'duties', { permissions: ['duty:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    const { data, error, count } = await client
      .from('duty_records')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)
    
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          data: {
            data: getMockRecords(),
            pagination: { page, pageSize, total: 5, totalPages: 1 },
          },
        })
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: { page, pageSize, total: count || 0, totalPages: Math.ceil((count || 0) / pageSize) },
      },
    })
  } catch (error) {
    console.error('获取值日记录失败:', error)
    return NextResponse.json({ success: false, error: '获取值日记录失败' }, { status: 500 })
  }
}

// 模拟数据
function getMockRecords() {
  return [
    {
      id: '1',
      schedule_id: '2',
      type: 'DORMITORY',
      location: '1号楼3层',
      date: '2024-01-16',
      responsible_person: '李四',
      check_in_time: '2024-01-16T18:02:00Z',
      check_out_time: '2024-01-16T18:58:00Z',
      duration: 56,
      score: 92,
      issues: [],
      photos: [],
      created_at: '2024-01-16T19:00:00Z',
    },
    {
      id: '2',
      schedule_id: '1',
      type: 'CLASSROOM',
      location: 'A栋教学楼2楼',
      date: '2024-01-15',
      responsible_person: '张三',
      check_in_time: '2024-01-15T07:00:00Z',
      check_out_time: '2024-01-15T08:00:00Z',
      duration: 60,
      score: 88,
      issues: ['地面有少量纸屑'],
      photos: [],
      remark: '整体卫生状况良好',
      created_at: '2024-01-15T08:05:00Z',
    },
    {
      id: '3',
      schedule_id: '5',
      type: 'PUBLIC_AREA',
      location: '图书馆门前广场',
      date: '2024-01-14',
      responsible_person: '王五',
      check_in_time: '2024-01-14T12:00:00Z',
      check_out_time: '2024-01-14T13:00:00Z',
      duration: 60,
      score: 95,
      issues: [],
      photos: [],
      created_at: '2024-01-14T13:05:00Z',
    },
  ]
}
