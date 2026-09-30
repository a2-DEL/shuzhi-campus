import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { AiRuntimeError, getAccessibleAiTask } from '@/lib/ai/runtime/orchestrator'
import { toAiProductTask } from '@/lib/ai/product-view'

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AiRuntimeError) {
    const status = error.code === 'TASK_ACCESS_DENIED' ? 403 : error.code === 'TASK_NOT_FOUND' ? 404 : 409
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Failed to get task steps', code: 'AI_TASK_FAILED' }, { status: 500 })
}

// GET: read-only task-node view; only the runtime may mutate node state
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const taskId = new URL(request.url).searchParams.get('task_id')
    if (!taskId) return NextResponse.json({ success: false, error: 'task_id is required', code: 'INVALID_TASK_ID' }, { status: 400 })
    const task = await getAccessibleAiTask(user, taskId)
    return NextResponse.json({ success: true, data: toAiProductTask(task).nodes })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST() {
  return NextResponse.json({ success: false, error: 'Task nodes can only be created by the Agent runtime', code: 'RUNTIME_OWNED_RESOURCE' }, { status: 405 })
}

export async function PUT() {
  return NextResponse.json({ success: false, error: 'Task node state can only be advanced by the Agent runtime', code: 'RUNTIME_OWNED_RESOURCE' }, { status: 405 })
}
