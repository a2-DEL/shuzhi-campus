import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { FederationError, getFederationOverview, runFederationJob } from '@/lib/ai/platform/federation'

const runSchema = z.object({ action: z.literal('run'), name: z.string().trim().min(4).max(220), jobType: z.enum(['MULTIMODAL_METRICS','CAMPUS_RISK_AGGREGATION','RETRIEVAL_TELEMETRY']), requestedModalities: z.array(z.enum(['IMAGE','AUDIO','DOCUMENT','VIDEO','BUSINESS_METRIC'])).max(5), minimumGroupSize: z.number().int().min(3).max(1000), epsilonBudget: z.number().positive().max(10) }).strict()
function failure(error: unknown): NextResponse {
  if (error instanceof FederationError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'BACKEND_UNAVAILABLE' || error.code === 'STORAGE_FAILURE' ? 503 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('Federation request failed', error)
  return NextResponse.json({ success: false, error: '联邦协同控制面暂时不可用', code: 'FEDERATION_UNAVAILABLE' }, { status: 503 })
}
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request); if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await getFederationOverview(user) }, { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request); if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { const parsed = runSchema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? '联邦任务参数无效', code: 'INVALID_FEDERATION_JOB' }, { status: 400 }); return NextResponse.json({ success: true, data: await runFederationJob(user, parsed.data) }, { status: 201 }) } catch (error) { return failure(error) }
}
