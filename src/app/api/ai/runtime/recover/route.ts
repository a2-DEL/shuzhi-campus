import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { AiTaskRepositoryError } from '@/lib/ai/runtime/repository'
import { recoverAiTasks } from '@/lib/ai/runtime/recovery'
import { UserRole } from '@/types'
import { authorize } from '@/lib/authorization'

const requestSchema = z.object({
  worker_id: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(20).optional(),
  lease_seconds: z.number().int().min(10).max(600).optional(),
  resume: z.boolean().optional(),
})

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const decision = authorize(user, { permission: 'ai:recover' })
  if (!decision.allowed || ![UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN].includes(user.role)) {
    return NextResponse.json({ success: false, error: 'AI recovery operations require the AI operations administrator role', code: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid recovery request', code: 'INVALID_RECOVERY_REQUEST' }, { status: 400 })
    const workerId = parsed.data.worker_id ?? `manual-recovery:${user.id}`
    const results = await recoverAiTasks(workerId, parsed.data.limit ?? 1, {
      leaseSeconds: parsed.data.lease_seconds,
      resume: parsed.data.resume ?? false,
    })
    return NextResponse.json({
      success: true,
      data: {
        worker_id: workerId,
        recovered: results.length,
        tasks: results.map((result) => ({
          status: result.status,
          task_id: result.task?.id,
          state: result.task?.state,
          version: result.task?.version,
          attempt_count: result.task?.attemptCount,
          lease_expires_at: result.task?.leaseExpiresAt,
        })),
      },
    })
  } catch (error) {
    if (error instanceof AiTaskRepositoryError) {
      const status = error.code === 'VERSION_CONFLICT' || error.code === 'LEASE_LOST' ? 409 : 500
      return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Task recovery failed', code: 'RECOVERY_FAILED' }, { status: 500 })
  }
}
