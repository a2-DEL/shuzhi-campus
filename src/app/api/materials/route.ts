import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseClient } from '@/storage/database/supabase-client'

// 获取物资列表
export async function GET(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:view'] })
  if (legacyResponse) return legacyResponse

  try {
    const searchParams = request.nextUrl.searchParams
    const category = searchParams.get('category')
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    
    const client = getSupabaseClient()
    
    let query = client
      .from('materials')
      .select('*', { count: 'exact' })
      .order('name', { ascending: true })
    
    if (category) {
      query = query.eq('category', category)
    }
    if (status) {
      query = query.eq('status', status)
    }
    if (search) {
      query = query.ilike('name', `%${search}%`)
    }
    
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1
    
    const { data, error, count } = await query.range(from, to)
    
    if (error) {
      if (error.code === '42P01') {
        return NextResponse.json({
          success: true,
          data: {
            data: getMockMaterials(),
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
    console.error('获取物资列表失败:', error)
    return NextResponse.json({ success: false, error: '获取物资列表失败' }, { status: 500 })
  }
}

// 创建物资
export async function POST(request: NextRequest) {
  // Legacy Supabase handler retained for reference; PG migration guard prevents stale reads and direct writes.
  const legacyResponse = await legacyApiGuard(request, 'materials', { permissions: ['material:approve'] })
  if (legacyResponse) return legacyResponse

  try {
    const body = await request.json()
    const { name, category, unit, stock, min_stock, price, location, supplier } = body
    
    if (!name || !category || !unit) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 })
    }
    
    // 计算状态
    let status = 'IN_STOCK'
    if (stock === 0) status = 'OUT_OF_STOCK'
    else if (stock < min_stock) status = 'LOW_STOCK'
    
    const client = getSupabaseClient()
    
    const { data, error } = await client
      .from('materials')
      .insert({
        name,
        category,
        unit,
        stock: stock || 0,
        min_stock: min_stock || 10,
        price: price || 0,
        location,
        supplier,
        status,
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('创建物资失败:', error)
    return NextResponse.json({ success: false, error: '创建物资失败' }, { status: 500 })
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
    {
      id: '4',
      name: '拖把',
      category: 'CLEANING',
      unit: '把',
      stock: 25,
      min_stock: 10,
      price: 22,
      location: '仓库B区',
      supplier: '清洁用品批发',
      status: 'IN_STOCK',
      created_at: '2024-01-01T00:00:00Z',
    },
    {
      id: '5',
      name: '打印机墨盒',
      category: 'ELECTRONIC',
      unit: '个',
      stock: 8,
      min_stock: 5,
      price: 180,
      location: '仓库C区',
      supplier: '佳能专卖店',
      status: 'IN_STOCK',
      created_at: '2024-01-01T00:00:00Z',
    },
  ]
}
