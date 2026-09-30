import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 物资申领状态
export const MaterialRequestStatus = {
  PENDING: 'PENDING',     // 待审批
  APPROVED: 'APPROVED',  // 已批准
  REJECTED: 'REJECTED',  // 已拒绝
  COMPLETED: 'COMPLETED', // 已完成
} as const

// 获取物资申领列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')
    const requester_id = searchParams.get('requester_id')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('material_requests')
      .select('*, materials(name, unit, category)', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    if (status) {
      query = query.eq('status', status.toUpperCase())
    }
    
    if (requester_id) {
      query = query.eq('requester_id', requester_id)
    }
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, error, count } = await query.range(from, to)
    
    // 如果数据库查询失败，返回错误信息
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
    
    // 格式化返回数据
    const formattedData = (data || []).map(item => ({
      id: item.id,
      material_id: item.material_id,
      material_name: item.materials?.name || '未知物资',
      material_unit: item.materials?.unit || '',
      quantity: item.quantity,
      requester_id: item.requester_id,
      reason: item.reason,
      status: item.status,
      reviewer_id: item.reviewer_id,
      review_note: item.review_note,
      created_at: item.created_at,
      updated_at: item.updated_at,
    }))
    
    return NextResponse.json({
      success: true,
      data: {
        data: formattedData,
        pagination: { 
          page, 
          pageSize, 
          total: count || 0, 
          totalPages: Math.ceil((count || 0) / pageSize) 
        },
      },
    })
  } catch (error) {
    console.error('获取申领列表失败:', error)
    return NextResponse.json({ success: false, error: '获取申领列表失败' }, { status: 500 })
  }
}

// 创建申领申请
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:approve'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { material_id, quantity, requester_id, reason } = body
    
    if (!material_id || !requester_id || !quantity) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 })
    }
    
    const client = getSupabaseClient()
    
    const newRequest = {
      id: crypto.randomUUID(),
      material_id,
      quantity: parseInt(quantity),
      requester_id,
      reason: reason || '',
      status: MaterialRequestStatus.PENDING,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    
    const { data, error } = await client
      .from('material_requests')
      .insert(newRequest)
      .select('*, materials(name, unit)')
      .single()
    
    if (error) {
      console.log('数据库插入失败:', error.message)
      return NextResponse.json(
        { success: false, error: `创建申领申请失败: ${error.message}` }, 
        { status: 500 }
      )
    }
    
    return NextResponse.json({ 
      success: true, 
      data: {
        id: data.id,
        material_id: data.material_id,
        material_name: data.materials?.name || '未知物资',
        quantity: data.quantity,
        requester_id: data.requester_id,
        reason: data.reason,
        status: data.status,
        created_at: data.created_at,
      }
    })
  } catch (error) {
    console.error('创建申领申请失败:', error)
    return NextResponse.json({ success: false, error: '创建申领申请失败' }, { status: 500 })
  }
}
