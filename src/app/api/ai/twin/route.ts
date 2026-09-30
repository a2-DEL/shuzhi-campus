import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { captureTwinSnapshot, dispatchTwinRecommendation, getTwinOverview, runTwinScenario, TwinError } from '@/lib/ai/platform/twin'

const interventions = z.object({ repairCapacityDelta: z.number().int().min(0).max(20), energyReductionPct: z.number().min(0).max(30), notificationEscalation: z.boolean(), visitorDeskDelta: z.number().int().min(0).max(10), eventAttendees: z.number().int().min(0).max(5_000) }).strict()
const simulateSchema = z.object({ action: z.literal('simulate'), name: z.string().trim().min(3).max(220), hypothesis: z.string().trim().min(8).max(1_500), snapshotId: z.string().uuid().optional(), interventions }).strict()
const captureSchema = z.object({ action: z.literal('capture') }).strict()
const dispatchSchema = z.object({ action: z.literal('dispatch'), recommendationId: z.string().uuid() }).strict()

function failure(error: unknown): NextResponse {
  if (error instanceof TwinError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'BACKEND_UNAVAILABLE' ? 503 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('Twin request failed', error)
  return NextResponse.json({ success: false, error: '校园数字孪生暂时不可用', code: 'TWIN_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await getTwinOverview(user) }, { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const body = await request.json().catch(() => null)
  try {
    if (body?.action === 'capture') {
      const parsed = captureSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '快照请求无效', code: 'INVALID_TWIN_CAPTURE' }, { status: 400 })
      return NextResponse.json({ success: true, data: await captureTwinSnapshot(user) })
    }
    if (body?.action === 'simulate') {
      const parsed = simulateSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? '推演参数无效', code: 'INVALID_TWIN_SIMULATION' }, { status: 400 })
      return NextResponse.json({ success: true, data: await runTwinScenario(user, parsed.data) }, { status: 201 })
    }
    if (body?.action === 'dispatch') {
      const parsed = dispatchSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '建议下发请求无效', code: 'INVALID_TWIN_DISPATCH' }, { status: 400 })
      return NextResponse.json({ success: true, data: await dispatchTwinRecommendation(user, parsed.data.recommendationId) })
    }
    return NextResponse.json({ success: false, error: '不支持的数字孪生操作', code: 'UNSUPPORTED_TWIN_ACTION' }, { status: 400 })
  } catch (error) { return failure(error) }
}
