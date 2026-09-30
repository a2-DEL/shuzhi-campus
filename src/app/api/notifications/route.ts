import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 通知状态
export const NotificationStatus = {
  DRAFT: 'DRAFT',       // 草稿
  PUBLISHED: 'PUBLISHED', // 已发布
  ARCHIVED: 'ARCHIVED', // 已归档
} as const

// 获取通知列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'notifications', { permissions: ['notification:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type')
    const status = searchParams.get('status')
    const publisher_id = searchParams.get('publisher_id')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '10')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('notifications')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    if (type) {
      query = query.eq('type', type)
    }
    if (status) {
      query = query.eq('status', status.toUpperCase())
    }
    if (publisher_id) {
      query = query.eq('publisher_id', publisher_id)
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
    console.error('获取通知列表失败:', error)
    return NextResponse.json(
      { success: false, error: '获取通知列表失败' },
      { status: 500 }
    )
  }
}

// 创建通知
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'notifications', { permissions: ['notification:create'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { title, content, type, publisher_id, target_roles, target_departments, expire_at } = body
    
    if (!title || !content || !publisher_id) {
      return NextResponse.json(
        { success: false, error: '缺少必要参数' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    const newNotification = {
      id: crypto.randomUUID(),
      title,
      content,
      type: type || 'announcement',
      publisher_id,
      target_roles: target_roles ? JSON.stringify(target_roles) : null,
      target_departments: target_departments ? JSON.stringify(target_departments) : null,
      status: NotificationStatus.DRAFT,
      views: 0,
      publish_at: null,
      expire_at: expire_at || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('notifications')
      .insert(newNotification)
      .select()
      .single()
    
    if (error) {
      console.log('数据库插入失败:', error.message)
      return NextResponse.json(
        { success: false, error: `创建通知失败: ${error.message}` },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('创建通知失败:', error)
    return NextResponse.json(
      { success: false, error: '创建通知失败' },
      { status: 500 }
    )
  }
}
