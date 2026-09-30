import { legacyApiGuard } from '@/lib/legacy-api'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthorizationError, requireAuthorization } from '@/lib/authorization'
import { getSupabaseAdminClient } from '@/storage/database/supabase-client'

const createInspectionSchema = z.object({
  dormitory_id: z.string().min(1).max(36),
  room_number: z.string().trim().min(1).max(20),
  score: z.number().int().min(0).max(100),
  issues: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
  photos: z.array(z.string().url()).max(50).default([]),
  remark: z.string().trim().max(2000).optional(),
}).strict()

function authorizationResponse(error: unknown): NextResponse | null {
  if (!(error instanceof AuthorizationError)) return null
  return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.status })
}

export async function GET(request: NextRequest) {
  // Legacy Supabase inspections are quarantined until the PG domain contract is ready.
  const legacyResponse = await legacyApiGuard(request, 'dormitories/inspections', { permissions: ['dorm:view'] })
  if (legacyResponse) return legacyResponse
  try {
    const { user } = await requireAuthorization(request, { permission: 'dorm:view' })
    const page = Math.max(1, Number(request.nextUrl.searchParams.get('page') ?? 1) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get('pageSize') ?? 20) || 20))
    const building = request.nextUrl.searchParams.get('building')?.trim()
    const result = request.nextUrl.searchParams.get('result')?.trim().toUpperCase()
    const client = getSupabaseAdminClient()

    let dormitoryIds: string[] | undefined
    if (building) {
      const dormitories = await client
        .from('dormitories')
        .select('id')
        .eq('school_id', user.school_id!)
        .ilike('building_name', `%${building}%`)
      if (dormitories.error) {
        return NextResponse.json({ success: false, error: dormitories.error.message }, { status: 503 })
      }
      dormitoryIds = (dormitories.data ?? []).map((item) => item.id)
      if (dormitoryIds.length === 0) {
        return NextResponse.json({ success: true, data: { data: [], pagination: { page, pageSize, total: 0, totalPages: 0 } } })
      }
    }

    let query = client
      .from('dorm_inspections')
      .select('*', { count: 'exact' })
      .eq('school_id', user.school_id!)
      .order('created_at', { ascending: false })
    if (dormitoryIds) query = query.in('dormitory_id', dormitoryIds)
    if (result === 'EXCELLENT') query = query.gte('score', 90)
    if (result === 'GOOD') query = query.gte('score', 80).lt('score', 90)
    if (result === 'QUALIFIED') query = query.gte('score', 60).lt('score', 80)
    if (result === 'UNQUALIFIED') query = query.lt('score', 60)

    const from = (page - 1) * pageSize
    const response = await query.range(from, from + pageSize - 1)
    if (response.error) {
      return NextResponse.json({ success: false, error: response.error.message }, { status: 503 })
    }
    const total = response.count ?? 0
    return NextResponse.json({
      success: true,
      data: { data: response.data ?? [], pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } },
    })
  } catch (error) {
    return authorizationResponse(error)
      ?? NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Inspection query failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Legacy Supabase inspections are quarantined until the PG domain contract is ready.
  const legacyResponse = await legacyApiGuard(request, 'dormitories/inspections', { permissions: ['dorm:inspect'] })
  if (legacyResponse) return legacyResponse
  try {
    const { user } = await requireAuthorization(request, { permission: 'dorm:inspect' })
    const parsed = createInspectionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Invalid inspection input', issues: parsed.error.flatten() }, { status: 400 })
    }
    const client = getSupabaseAdminClient()
    const dormitory = await client
      .from('dormitories')
      .select('id')
      .eq('id', parsed.data.dormitory_id)
      .eq('school_id', user.school_id!)
      .maybeSingle()
    if (dormitory.error) return NextResponse.json({ success: false, error: dormitory.error.message }, { status: 503 })
    if (!dormitory.data) return NextResponse.json({ success: false, error: 'Dormitory not found in authorized tenant' }, { status: 404 })

    const response = await client
      .from('dorm_inspections')
      .insert({
        id: crypto.randomUUID(), school_id: user.school_id, dormitory_id: parsed.data.dormitory_id,
        room_number: parsed.data.room_number, inspector_id: user.id,
        inspection_date: new Date().toISOString(), score: parsed.data.score,
        issues: parsed.data.issues, images: parsed.data.photos,
        notes: parsed.data.remark ?? null, status: 'COMPLETED', version: 1,
      })
      .select()
      .single()
    if (response.error) return NextResponse.json({ success: false, error: response.error.message }, { status: 503 })
    return NextResponse.json({ success: true, data: response.data }, { status: 201 })
  } catch (error) {
    return authorizationResponse(error)
      ?? NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Inspection creation failed' }, { status: 500 })
  }
}
