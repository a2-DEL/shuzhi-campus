import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取物资详情
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
      .from('materials')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      // 返回模拟数据
      const mockMaterial = getMockMaterials().find(m => m.id === id)
      if (mockMaterial) {
        return NextResponse.json({ success: true, data: mockMaterial })
      }
      return NextResponse.json({ success: false, error: '物资不存在' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('获取物资详情失败:', error)
    return NextResponse.json({ success: false, error: '获取物资详情失败' }, { status: 500 })
  }
}

// 更新物资
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
    const { name, category, unit, stock, min_stock, price, location, supplier } = body
    
    // 计算状态
    let status = 'IN_STOCK'
    if (stock === 0) status = 'OUT_OF_STOCK'
    else if (stock < min_stock) status = 'LOW_STOCK'
    
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('materials')
      .update({
        name,
        category,
        unit,
        stock,
        min_stock,
        price,
        location,
        supplier,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('更新物资失败:', error)
    return NextResponse.json({ success: false, error: '更新物资失败' }, { status: 500 })
  }
}

// 删除物资
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:approve'] })
  if (legacyResponse) return legacyResponse

  try {
    const { id } = await params
    const client = getSupabaseClient()
    
    const { error } = await client
      .from('materials')
      .delete()
      .eq('id', id)
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, message: '删除成功' })
  } catch (error) {
    console.error('删除物资失败:', error)
    return NextResponse.json({ success: false, error: '删除物资失败' }, { status: 500 })
  }
}

// 模拟数据
function getMockMaterials() {
  return [
    {
      id: '1',
      name: 'A4打印纸',
      category: 'OFFICE',
      unit: '包',
      stock: 150,
      min_stock: 50,
      price: 25,
      location: '仓库A区1号货架',
      supplier: '得力文具',
      status: 'IN_STOCK',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '2',
      name: '中性笔',
      category: 'OFFICE',
      unit: '盒',
      stock: 30,
      min_stock: 20,
      price: 15,
      location: '仓库A区2号货架',
      supplier: '晨光文具',
      status: 'LOW_STOCK',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '3',
      name: '扫把',
      category: 'CLEANING',
      unit: '把',
      stock: 0,
      min_stock: 10,
      price: 18,
      location: '仓库B区',
      status: 'OUT_OF_STOCK',
      created_at: '2024-01-01T00:00:00Z',
    },
  ]
}
