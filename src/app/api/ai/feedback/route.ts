import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { AiFeedbackError, listAiFeedback, reviewAiFeedback, submitAiFeedback } from '@/lib/ai/feedback'

const submitSchema = z.object({
  taskId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  outcome: z.enum(['helpful', 'needs_follow_up', 'unsafe', 'incorrect']),
  comment: z.string().trim().max(2000).optional(),
})
const reviewSchema = z.object({
  feedbackId: z.string().uuid(),
  status: z.enum(['reviewed', 'applied', 'dismissed']),
})

function failure(error: unknown): NextResponse {
  if (error instanceof AiFeedbackError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'TASK_NOT_READY' ? 409 : error.code === 'TENANT_REQUIRED' ? 409 : 503
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Feedback unavailable', code: 'FEEDBACK_UNAVAILABLE' }, { status: 500 })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, data: await listAiFeedback(user) })
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const parsed = submitSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid feedback', code: 'INVALID_FEEDBACK' }, { status: 400 })
    return NextResponse.json({ success: true, data: await submitAiFeedback(user, parsed.data) }, { status: 201 })
  } catch (error) {
    return failure(error)
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const parsed = reviewSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: 'Invalid review action', code: 'INVALID_REVIEW' }, { status: 400 })
    return NextResponse.json({ success: true, data: await reviewAiFeedback(user, parsed.data.feedbackId, parsed.data.status) })
  } catch (error) {
    return failure(error)
  }
}
