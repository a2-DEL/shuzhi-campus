import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import {
  AiOperationsError,
  getAiOperationsOverview,
  runAiOperationsDiagnostics,
  updateAiRuntimeSettings,
} from '@/lib/ai/operations/service'

const settingsSchema = z.object({
  routeMode: z.enum(['local_governed', 'external_preferred', 'hybrid_fail_closed']),
  primaryProvider: z.string().trim().max(64).optional(),
  fallbackProvider: z.string().trim().max(64).optional(),
  maxModelCalls: z.number().int().min(1).max(1000),
  dailyBudgetCents: z.number().int().min(0).max(100_000_000),
})

function failure(error: unknown): NextResponse {
  if (error instanceof AiOperationsError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_PROVIDER' ? 409 : error.code === 'PERSISTENCE_REQUIRED' ? 503 : 500
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'AI operations unavailable', code: 'OPERATIONS_UNAVAILABLE' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, data: await getAiOperationsOverview(user) })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({}))
    if (body?.action !== 'diagnose') return NextResponse.json({ success: false, error: 'Unsupported operations action', code: 'INVALID_ACTION' }, { status: 400 })
    return NextResponse.json({ success: true, data: await runAiOperationsDiagnostics(user) })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const parsed = settingsSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid runtime settings', code: 'INVALID_SETTINGS' }, { status: 400 })
    return NextResponse.json({ success: true, data: await updateAiRuntimeSettings(user, parsed.data) })
  } catch (error) {
    return failure(error)
  }
}
