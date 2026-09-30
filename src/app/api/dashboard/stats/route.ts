import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取仪表盘统计数据
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'dashboard', {})
  if (legacyResponse) return legacyResponse

  try {
    const client = getSupabaseClient()
    
    // 并行获取各项统计数据
    const [
      usersResult,
      repairsResult,
      todayRepairsResult,
      processingRepairsResult,
      completedRepairsResult,
      materialsResult,
    ] = await Promise.all([
      // 用户总数
      client.from('users').select('id', { count: 'exact', head: true }),
      
      // 报修工单总数
      client.from('repairs').select('id', { count: 'exact', head: true }),
      
      // 今日新增报修
      client.from('repairs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      
      // 处理中的报修
      client.from('repairs')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'assigned', 'processing']),
      
      // 已完成的报修
      client.from('repairs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed'),
      
      // 物资统计
      client.from('materials').select('id, quantity, threshold'),
    ])
    
    // 计算物资状态
    const materials = materialsResult.data || []
    const materialStats = {
      normal: 0,
      warning: 0,
      outOfStock: 0,
    }
    
    materials.forEach((item: { quantity: number; threshold: number }) => {
      if (item.quantity <= 0) {
        materialStats.outOfStock++
      } else if (item.quantity <= item.threshold) {
        materialStats.warning++
      } else {
        materialStats.normal++
      }
    })
    
    // 计算教室使用率（模拟数据）
    const classroomUsageRate = Math.floor(Math.random() * 30) + 60 // 60-90%
    
    const stats = {
      totalUsers: usersResult.count || 0,
      totalRepairs: repairsResult.count || 0,
      todayRepairs: todayRepairsResult.count || 0,
      processingRepairs: processingRepairsResult.count || 0,
      completedRepairs: completedRepairsResult.count || 0,
      classroomUsageRate,
      materialNormal: materialStats.normal,
      materialWarning: materialStats.warning,
      materialOutOfStock: materialStats.outOfStock,
    }
    
    return NextResponse.json({
      success: true,
      data: stats,
    })
  } catch (error) {
    console.error('获取统计数据失败:', error)
    return NextResponse.json(
      { success: false, error: '获取统计数据失败' },
      { status: 500 }
    )
  }
}
