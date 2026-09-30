import { legacyApiGuard } from '@/lib/legacy-api'
import { readPgRepairDetail } from '@/lib/repairs/reader'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'
import { RepairStatus } from '@/types'

// 状态转换规则
const STATUS_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  [RepairStatus.PENDING]: [RepairStatus.DISPATCHED, RepairStatus.CLOSED],
  [RepairStatus.DISPATCHED]: [RepairStatus.PROCESSING, RepairStatus.REJECTED, RepairStatus.PENDING],
  [RepairStatus.PROCESSING]: [RepairStatus.COMPLETED, RepairStatus.DISPATCHED],
  [RepairStatus.COMPLETED]: [RepairStatus.CLOSED],
  [RepairStatus.CLOSED]: [],
  [RepairStatus.REJECTED]: [RepairStatus.DISPATCHED],
}

// PATCH 方法支持
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase mutation is disabled: status changes must pass PG Skill authorization and verification.
  const legacyResponse = await legacyApiGuard(request, 'repairs', { permissions: ['repair:process', 'repair:dispatch'] })
  if (legacyResponse) return legacyResponse

  return PUT(request, { params })
}

// 更新工单状态（派单、开始处理、完成、关闭、拒单）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase mutation is disabled: status changes must pass PG Skill authorization and verification.
  const legacyResponse = await legacyApiGuard(request, 'repairs', { permissions: ['repair:process', 'repair:dispatch'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const body = await request.json()
    const { action, operator_id, assignee_id, remark, rating, comment } = body
    
    if (!action) {
      return NextResponse.json(
        { success: false, error: '缺少操作类型' },
        { status: 400 }
      )
    }
    
    const client = getSupabaseClient()
    
    // 获取当前工单
    const { data: repair, error: fetchError } = await client
      .from('repair_orders')
      .select('*')
      .eq('id', id)
      .single()
    
    // 如果数据库查询失败
    if (fetchError || !repair) {
      console.log('数据库查询失败:', fetchError?.message)
      return NextResponse.json(
        { success: false, error: '工单不存在' },
        { status: 404 }
      )
    }
    
    // 处理状态转换
    let newStatus: RepairStatus
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    
    // 将 action 字符串转换为 RepairStatus
    const actionToStatus: Record<string, RepairStatus> = {
      'DISPATCH': RepairStatus.DISPATCHED,
      'START': RepairStatus.PROCESSING,
      'COMPLETE': RepairStatus.COMPLETED,
      'CLOSE': RepairStatus.CLOSED,
      'REJECT': RepairStatus.REJECTED,
      'REASSIGN': RepairStatus.PENDING,
    }
    
    // 也支持直接传入状态值
    const actionUpper = action.toUpperCase()
    if (actionUpper in RepairStatus) {
      newStatus = RepairStatus[actionUpper as keyof typeof RepairStatus]
    } else if (action in actionToStatus) {
      newStatus = actionToStatus[action]
    } else {
      // 根据当前状态和操作推断新状态
      switch (actionUpper) {
        case 'DISPATCH':
        case 'ASSIGN':
          newStatus = RepairStatus.DISPATCHED
          break
        case 'START':
        case 'PROCESS':
          newStatus = RepairStatus.PROCESSING
          break
        case 'COMPLETE':
        case 'FINISH':
          newStatus = RepairStatus.COMPLETED
          break
        case 'CLOSE':
          newStatus = RepairStatus.CLOSED
          break
        case 'REJECT':
          newStatus = RepairStatus.REJECTED
          break
        default:
          return NextResponse.json(
            { success: false, error: `不支持的操作类型: ${action}` },
            { status: 400 }
          )
      }
    }
    
    // 验证状态转换是否合法
    const currentStatus = repair.status as RepairStatus
    const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || []
    
    if (!allowedTransitions.includes(newStatus) && currentStatus !== newStatus) {
      console.log(`状态转换不合法: ${currentStatus} -> ${newStatus}`)
      // 允许一些特殊转换
      const specialTransitions: Record<string, boolean> = {
        'PENDING_DISPATCHED': true,  // 派单
        'DISPATCHED_PROCESSING': true,  // 开始处理
        'DISPATCHED_REJECTED': true,  // 拒单
        'PROCESSING_COMPLETED': true,  // 完成
        'COMPLETED_CLOSED': true,  // 关闭
        'REJECTED_DISPATCHED': true,  // 重新派单
      }
      
      const transitionKey = `${currentStatus}_${newStatus}`
      if (!specialTransitions[transitionKey]) {
        return NextResponse.json(
          { success: false, error: `状态转换不合法: ${currentStatus} -> ${newStatus}` },
          { status: 400 }
        )
      }
    }
    
    // 更新工单状态
    updateData.status = newStatus
    
    // 根据操作类型设置特定字段
    if (actionUpper === 'DISPATCH' || actionUpper === 'ASSIGN') {
      if (assignee_id) {
        updateData.assignee_id = assignee_id
      }
      updateData.assigned_at = new Date().toISOString()
    }
    
    if (actionUpper === 'START' || actionUpper === 'PROCESS') {
      updateData.started_at = new Date().toISOString()
    }
    
    if (actionUpper === 'COMPLETE' || actionUpper === 'FINISH') {
      updateData.completed_at = new Date().toISOString()
    }
    
    if (actionUpper === 'CLOSE') {
      if (rating !== undefined) {
        updateData.rating = rating
      }
      if (comment) {
        updateData.comment = comment
      }
    }
    
    // 更新数据库
    const { data, error: updateError } = await client
      .from('repair_orders')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()
    
    if (updateError) {
      console.log('更新失败:', updateError.message)
      return NextResponse.json(
        { success: false, error: `更新工单失败: ${updateError.message}` },
        { status: 500 }
      )
    }
    
    // 记录处理日志（可选）
    try {
      await client.from('repair_process_logs').insert({
        order_id: id,
        operator_id: operator_id || 'system',
        action: actionUpper,
        before_status: currentStatus,
        after_status: newStatus,
        remark: remark || null,
        created_at: new Date().toISOString(),
      })
    } catch (logError) {
      console.log('记录日志失败（不影响主流程）:', logError)
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        previous_status: currentStatus,
      },
      message: `工单状态已更新为: ${newStatus}`,
    })
  } catch (error) {
    console.error('更新工单失败:', error)
    return NextResponse.json(
      { success: false, error: '更新工单失败' },
      { status: 500 }
    )
  }
}

// 获取工单详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // PG detail read reuses the same server-side scope policy as list and statistics.
  const pgResponse: NextResponse | null = await readPgRepairDetail(request, (await params).id)
  if (pgResponse) return pgResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    // 获取工单信息
    const { data: repair, error } = await client
      .from('repair_orders')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !repair) {
      return NextResponse.json(
        { success: false, error: '工单不存在' },
        { status: 404 }
      )
    }
    
    // 获取处理日志
    const { data: logs } = await client
      .from('repair_process_logs')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: true })
    
    // 获取报修人信息
    let reporterName = '未知'
    let assigneeName = '未分配'
    
    try {
      const { data: reporter } = await client
        .from('users')
        .select('real_name')
        .eq('id', repair.reporter_id)
        .single()
      if (reporter) {
        reporterName = reporter.real_name || '未知'
      }
      
      if (repair.assignee_id) {
        const { data: assignee } = await client
          .from('users')
          .select('real_name')
          .eq('id', repair.assignee_id)
          .single()
        if (assignee) {
          assigneeName = assignee.real_name || '未知'
        }
      }
    } catch (userError) {
      console.log('获取用户信息失败:', userError)
    }
    
    return NextResponse.json({
      success: true,
      data: {
        ...repair,
        reporter_name: reporterName,
        assignee_name: assigneeName,
        process_logs: logs || [],
      },
    })
  } catch (error) {
    console.error('获取工单详情失败:', error)
    return NextResponse.json(
      { success: false, error: '获取工单详情失败' },
      { status: 500 }
    )
  }
}

// DELETE 方法 - 软删除工单
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase mutation is disabled: status changes must pass PG Skill authorization and verification.
  const legacyResponse = await legacyApiGuard(request, 'repairs', { permissions: ['repair:process', 'repair:dispatch'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('repair_orders')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    
    if (error) {
      return NextResponse.json(
        { success: false, error: '删除工单失败' },
        { status: 500 }
      )
    }
    
    return NextResponse.json({
      success: true,
      message: '工单已删除',
    })
  } catch (error) {
    console.error('删除工单失败:', error)
    return NextResponse.json(
      { success: false, error: '删除工单失败' },
      { status: 500 }
    )
  }
}
