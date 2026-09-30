import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取访客列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'visitors', { permissions: ['visitor:check'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const dormitory_id = searchParams.get('dormitory_id')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('visitors')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    if (dormitory_id) {
      query = query.eq('dormitory_id', dormitory_id)
    }
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, error, count } = await query.range(from, to)
    
    if (error) {
      console.log('数据库查询失败:', error.message)
      return NextResponse.json({
        success: true,
        data: {
          data: [],
          pagination: { page, pageSize, total: 0, totalPages: 0 },
        },
      })
    }
    
    return NextResponse.json({
      success: true,
      data: {
        data: data || [],
        pagination: { page, pageSize, total: count || 0, totalPages: Math.ceil((count || 0) / pageSize) },
      },
    })
  } catch (error) {
    console.error('获取访客列表失败:', error)
    return NextResponse.json({ success: false, error: '获取访客列表失败' }, { status: 500 })
  }
}

// 创建访客登记
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'visitors', { permissions: ['visitor:check'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { visitor_name, visitor_phone, dormitory_id, room_number, purpose, visit_time } = body
    
    if (!visitor_name || !visitor_phone || !dormitory_id) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 })
    }
    
    const client = getSupabaseClient()
    
    const newVisitor = {
      id: crypto.randomUUID(),
      visitor_name,
      visitor_phone,
      dormitory_id,
      room_number: room_number || '',
      purpose: purpose || '',
      visit_time: visit_time || new Date().toISOString(),
      leave_time: null,
      created_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('visitors')
      .insert(newVisitor)
      .select()
      .single()
    
    if (error) {
      console.log('数据库插入失败:', error.message)
      return NextResponse.json(
        { success: false, error: `创建访客登记失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('创建访客登记失败:', error)
    return NextResponse.json({ success: false, error: '创建访客登记失败' }, { status: 500 })
  }
}
