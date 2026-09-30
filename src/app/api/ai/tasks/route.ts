import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { AiPlanningError } from '@/lib/ai/runtime/planner'
import { AiRuntimeError, createAndPlanAiTask, listAccessibleAiTasks } from '@/lib/ai/runtime/orchestrator'
import { toAiProductTask } from '@/lib/ai/product-view'
import { AiTaskState } from '@/lib/ai/runtime/types'

const workflowStepSchema = z.object({ skillId: z.string().trim().min(1).max(100), params: z.record(z.string(), z.unknown()).optional(), title: z.string().trim().max(255).optional(), dependsOn: z.array(z.string().trim().max(128)).max(8).optional() })

const createSchema = z.object({
  command: z.string().trim().min(1).max(4_000),
  skill_id: z.string().trim().min(1).max(100).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  workflow: z.array(workflowStepSchema).max(7).optional(),
})

const STATE_ALIASES: Record<string, AiTaskState> = {
  pending: 'PREVIEWED',
  planning: 'PLANNED',
  previewed: 'PREVIEWED',
  awaiting_confirmation: 'AWAITING_APPROVAL',
  executing: 'RUNNING',
  completed: 'COMPLETED',
  partial: 'PARTIAL',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
  queued: 'QUEUED',
}

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AiPlanningError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors }, { status: error.code === 'PERMISSION_DENIED' ? 403 : 400 })
  }
  if (error instanceof AiRuntimeError) {
    const status = error.code === 'TASK_ACCESS_DENIED' ? 403 : error.code === 'TASK_NOT_FOUND' ? 404 : 409
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : fallback, code: 'AI_TASK_FAILED' }, { status: 500 })
}

// GET: return only tasks visible to the authenticated user and school scope
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const requestedStatus = searchParams.get('status')?.toLowerCase()
  const state = requestedStatus ? STATE_ALIASES[requestedStatus] ?? (requestedStatus.toUpperCase() as AiTaskState) : undefined
  const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(searchParams.get('page_size') || '20', 10) || 20))
  const tasks = await listAccessibleAiTasks(user, state)
  const from = (page - 1) * pageSize
  const pageData = tasks.slice(from, from + pageSize).map(toAiProductTask)

  return NextResponse.json({
    success: true,
    data: {
      data: pageData,
      pagination: { page, pageSize, total: tasks.length, totalPages: Math.ceil(tasks.length / pageSize) },
    },
  })
}

// POST: use the governed runtime; never simulate execution with setTimeout
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })

  try {
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid task command', code: 'INVALID_TASK_REQUEST' }, { status: 400 })
    const idempotencyKey = request.headers.get('idempotency-key')?.trim()
    if (idempotencyKey && idempotencyKey.length > 160) return NextResponse.json({ success: false, error: 'Idempotency-Key is too long', code: 'INVALID_IDEMPOTENCY_KEY' }, { status: 400 })
    const task = await createAndPlanAiTask(user, {
      command: parsed.data.command,
      skillId: parsed.data.skill_id,
      params: parsed.data.params,
      workflow: parsed.data.workflow,
      idempotencyKey,
    })
    return NextResponse.json({ success: true, data: toAiProductTask(task) }, { status: 201 })
  } catch (error) {
    return errorResponse(error, 'Failed to create AI task')
  }
}
