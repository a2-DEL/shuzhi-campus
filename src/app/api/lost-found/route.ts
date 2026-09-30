import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 失物招领状态
export const LostFoundStatus = {
  OPEN: 'open',
  MATCHED: 'matched',
  CLAIMED: 'claimed',
  EXPIRED: 'expired',
} as const

// 获取失物招领列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'lost-found', { permissions: ['lost:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') // 'lost' | 'found'
    const status = searchParams.get('status')
    const item_type = searchParams.get('item_type')
    const reporter_id = searchParams.get('reporter_id')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('lost_found')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    if (type) {
      query = query.eq('type', type)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (item_type) {
      query = query.eq('item_type', item_type)
    }
    if (reporter_id) {
      query = query.eq('reporter_id', reporter_id)
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
        pagination: {
          page,
          pageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
        },
      },
    })
  } catch (error) {
    console.error('获取失物招领列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取失物招领列表失败' },
      { status: 500 }
    )
  }
}

// 创建失物招领
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'lost-found', { permissions: ['lost:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { type, item_type, item_name, description, location, images, reporter_id } = body
    
    if (!type || !item_name || !reporter_id) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    const newItem = {
      id: crypto.randomUUID(),
      type,
      item_type: item_type || '',
      item_name,
      description: description || '',
      location: location || '',
      images: images ? JSON.stringify(images) : null,
      reporter_id,
      status: LostFoundStatus.OPEN,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('lost_found')
      .insert(newItem)
      .select()
      .single()
    
    if (error) {
      console.log('数据库插入失败:', error.message)
      return NextResponse.json(
        { success: false, error: `创建失物招领失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('创建失物招领失败:', error)
    return NextResponse.json(
      { success: false, error: '创建失物招领失败' },
      { status: 500 }
    )
  }
}
