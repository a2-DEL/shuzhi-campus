import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { AiPlanningError } from '@/lib/ai/runtime/planner'
import {
  AiRuntimeError,
  createAndPlanAiTask,
  decideAiTask,
} from '@/lib/ai/runtime/orchestrator'
import { toAiProductTask } from '@/lib/ai/product-view'

const workflowStepSchema = z.object({ skillId: z.string().trim().min(1).max(100), params: z.record(z.string(), z.unknown()).optional(), title: z.string().trim().max(255).optional(), dependsOn: z.array(z.string().trim().max(128)).max(8).optional() })

const executeSchema = z.object({
  command: z.string().trim().min(1).max(4_000),
  skill_id: z.string().trim().min(1).max(100).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  workflow: z.array(workflowStepSchema).max(7).optional(),
})

const decisionSchema = z.object({
  task_id: z.string().uuid(),
  action: z.enum(['confirm', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

function errorResponse(error: unknown, fallback: string): NextResponse {
  if (error instanceof AiPlanningError) {
    return NextResponse.json({ success: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors }, { status: error.code === 'PERMISSION_DENIED' ? 403 : 400 })
  }
  if (error instanceof AiRuntimeError) {
    const status = error.code === 'TASK_ACCESS_DENIED' ? 403 : error.code === 'TASK_NOT_FOUND' ? 404 : 409
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  const message = error instanceof Error ? error.message : fallback
  return NextResponse.json({ success: false, error: message, code: 'AI_TASK_FAILED' }, { status: 500 })
}

// POST: create a governed plan; auto-run low-risk reads and require approval for writes
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })

  try {
    const parsed = executeSchema.safeParse(await request.json())
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
    return NextResponse.json({ success: true, data: toAiProductTask(task) })
  } catch (error) {
    return errorResponse(error, 'Failed to create AI task')
  }
}

// PATCH: approve or reject using the authenticated server-side identity
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })

  try {
    const parsed = decisionSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid approval request', code: 'INVALID_DECISION_REQUEST' }, { status: 400 })
    const task = await decideAiTask(user, parsed.data.task_id, parsed.data.action === 'confirm' ? 'approve' : 'reject', parsed.data.reason)
    const waitingForSecondApproval = task.state === 'AWAITING_APPROVAL' && (task.approval?.decisions.length ?? 0) === 1
    return NextResponse.json(
      { success: true, data: toAiProductTask(task), requires_second_approval: waitingForSecondApproval },
      { status: waitingForSecondApproval ? 202 : 200 }
    )
  } catch (error) {
    return errorResponse(error, 'Failed to decide AI task')
  }
}
