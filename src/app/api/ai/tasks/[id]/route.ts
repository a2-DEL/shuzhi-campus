import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { AiRuntimeError, cancelAiTask, decideAiTask, getAccessibleAiTask } from '@/lib/ai/runtime/orchestrator'
import { toAiProductTask } from '@/lib/ai/product-view'

const actionSchema = z.object({
  action: z.enum(['confirm', 'reject', 'cancel']),
  reason: z.string().trim().max(500).optional(),
})

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AiRuntimeError) {
    const status = error.code === 'TASK_ACCESS_DENIED' ? 403 : error.code === 'TASK_NOT_FOUND' ? 404 : 409
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : fallback, code: 'AI_TASK_FAILED' }, { status: 500 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const { id } = await params
    return NextResponse.json({ success: true, data: toAiProductTask(await getAccessibleAiTask(user, id)) })
  } catch (error) {
    return errorResponse(error, 'Failed to get task details')
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const { id } = await params
    const parsed = actionSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Unsupported task action', code: 'INVALID_TASK_ACTION' }, { status: 400 })
    const task = parsed.data.action === 'cancel'
      ? await cancelAiTask(user, id, parsed.data.reason)
      : await decideAiTask(user, id, parsed.data.action === 'confirm' ? 'approve' : 'reject', parsed.data.reason)
    return NextResponse.json({ success: true, data: toAiProductTask(task) })
  } catch (error) {
    return errorResponse(error, 'Failed to update task')
  }
}
