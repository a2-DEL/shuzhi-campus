import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import {
  EvolutionError,
  approveEvolutionExperiment,
  collectEvolutionSignals,
  createEvolutionExperiment,
  getEvolutionOverview,
  rejectEvolutionExperiment,
  rollbackEvolutionRelease,
  runEvolutionEvaluation,
} from '@/lib/ai/platform/evolution'

const weightsSchema = z.object({ lexical: z.number().min(0).max(0.8), vector: z.number().min(0).max(0.8), graph: z.number().min(0).max(0.8), authority: z.number().min(0).max(0.8) }).strict()
const createSchema = z.object({ action: z.literal('create'), datasetId: z.string().uuid().optional(), signalId: z.string().uuid().optional(), hypothesis: z.string().trim().min(8).max(1_000), changeSummary: z.string().trim().min(4).max(1_000), candidateVersion: z.string().trim().min(3).max(80).optional(), candidateWeights: weightsSchema }).strict()
const evaluateSchema = z.object({ action: z.literal('evaluate'), experimentId: z.string().uuid() }).strict()
const approveSchema = z.object({ action: z.literal('approve'), experimentId: z.string().uuid(), releaseNotes: z.string().trim().min(8).max(2_000) }).strict()
const rejectSchema = z.object({ action: z.literal('reject'), experimentId: z.string().uuid(), reason: z.string().trim().max(500).default('') }).strict()
const rollbackSchema = z.object({ action: z.literal('rollback'), releaseId: z.string().uuid(), reason: z.string().trim().min(4).max(500) }).strict()
const collectSchema = z.object({ action: z.literal('collect') }).strict()

function failure(error: unknown): NextResponse {
  if (error instanceof EvolutionError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'BACKEND_UNAVAILABLE' ? 503 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('Evolution request failed', error)
  return NextResponse.json({ success: false, error: '自进化治理服务暂时不可用', code: 'EVOLUTION_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, data: await getEvolutionOverview(user) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const body = await request.json().catch(() => null)
  try {
    if (body?.action === 'collect') {
      const parsed = collectSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '信号采集请求无效', code: 'INVALID_EVOLUTION_COLLECT' }, { status: 400 })
      return NextResponse.json({ success: true, data: await collectEvolutionSignals(user) })
    }
    if (body?.action === 'create') {
      const parsed = createSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? '候选实验参数无效', code: 'INVALID_EVOLUTION_CREATE' }, { status: 400 })
      return NextResponse.json({ success: true, data: await createEvolutionExperiment(user, parsed.data) }, { status: 201 })
    }
    if (body?.action === 'evaluate') {
      const parsed = evaluateSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '评测请求无效', code: 'INVALID_EVOLUTION_EVALUATE' }, { status: 400 })
      return NextResponse.json({ success: true, data: await runEvolutionEvaluation(user, parsed.data.experimentId) })
    }
    if (body?.action === 'approve') {
      const parsed = approveSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '发布审批信息无效', code: 'INVALID_EVOLUTION_APPROVE' }, { status: 400 })
      return NextResponse.json({ success: true, data: await approveEvolutionExperiment(user, parsed.data.experimentId, parsed.data.releaseNotes) })
    }
    if (body?.action === 'reject') {
      const parsed = rejectSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '退回信息无效', code: 'INVALID_EVOLUTION_REJECT' }, { status: 400 })
      return NextResponse.json({ success: true, data: await rejectEvolutionExperiment(user, parsed.data.experimentId, parsed.data.reason) })
    }
    if (body?.action === 'rollback') {
      const parsed = rollbackSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: '回滚信息无效', code: 'INVALID_EVOLUTION_ROLLBACK' }, { status: 400 })
      return NextResponse.json({ success: true, data: await rollbackEvolutionRelease(user, parsed.data.releaseId, parsed.data.reason) })
    }
    return NextResponse.json({ success: false, error: '不支持的自进化操作', code: 'UNSUPPORTED_EVOLUTION_ACTION' }, { status: 400 })
  } catch (error) { return failure(error) }
}
