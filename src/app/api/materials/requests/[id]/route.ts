import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 审批申领/完成领取
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:approve'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { action, approved, remark, reviewer_id } = body
    
    // action: 'approve' | 'complete' | 'reject'
    if (!action) {
      return NextResponse.json({ success: false, error: '缺少操作类型' }, { status: 400 })
    }
    
    const client = getSupabaseClient()
    
    // 获取申领信息
    const { data: requestData, error: fetchError } = await client
      .from('material_requests')
      .select('*, materials(name, stock, unit)')
      .eq('id', id)
      .single()
    
    if (fetchError || !requestData) {
      return NextResponse.json({ success: false, error: '申领记录不存在' }, { status: 404 })
    }
    
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    
    if (action === 'approve') {
      if (approved === false) {
        // 拒绝
        updateData.status = 'REJECTED'
        updateData.reviewer_id = reviewer_id || 'system'
        updateData.review_note = remark || '库存不足'
      } else {
        // 批准 - 检查库存 (materials表使用quantity字段)
        const material = requestData.materials as { quantity?: number } | null
        if (material && material.quantity !== undefined && material.quantity < requestData.quantity) {
          return NextResponse.json({ success: false, error: '库存不足' }, { status: 400 })
        }
        
        // 减少库存 (materials表使用quantity字段)
        if (material && material.quantity !== undefined) {
          await client
            .from('materials')
            .update({
              quantity: material.quantity - requestData.quantity,
              updated_at: new Date().toISOString(),
            })
            .eq('id', requestData.material_id)
        }
        
        updateData.status = 'APPROVED'
        updateData.reviewer_id = reviewer_id || 'system'
        updateData.review_note = remark || ''
      }
    } else if (action === 'complete') {
      updateData.status = 'COMPLETED'
    } else {
      return NextResponse.json({ success: false, error: '无效的操作' }, { status: 400 })
    }
    
    const { data, error } = await client
      .from('material_requests')
      .update(updateData)
      .eq('id', id)
      .select('*, materials(name, unit)')
      .single()
    
    if (error) {
      console.log('更新失败:', error.message)
      return NextResponse.json({ success: false, error: `更新失败: ${error.message}` }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      data: {
        ...data,
        material_name: data.materials?.name || '未知物资',
        material_unit: data.materials?.unit || '',
      }
    })
  } catch (error) {
    console.error('审批申领失败:', error)
    return NextResponse.json({ success: false, error: '审批申领失败' }, { status: 500 })
  }
}

// 获取单个申领详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('material_requests')
      .select('*, materials(name, unit, category)')
      .eq('id', id)
      .single()
    
    if (error || !data) {
      return NextResponse.json({ success: false, error: '申领记录不存在' }, { status: 404 })
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        material_name: data.materials?.name || '未知物资',
        material_unit: data.materials?.unit || '',
      }
    })
  } catch (error) {
    console.error('获取申领详情失败:', error)
    return NextResponse.json({ success: false, error: '获取申领详情失败' }, { status: 500 })
  }
}
