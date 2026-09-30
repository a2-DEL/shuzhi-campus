import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import {
  createWorkflow,
  getWorkflowOverview,
  publishWorkflow,
  runWorkflow,
  WorkflowPlatformError,
  workflowDefinitionSchema,
} from '@/lib/ai/platform/workflows'
import { UserRole } from '@/types'

const roleSchema = z.nativeEnum(UserRole)
const createSchema = z.object({
  action: z.literal('create'),
  name: z.string().trim().min(1).max(220),
  slug: z.string().trim().max(140).optional(),
  description: z.string().trim().max(1_000).optional(),
  triggerKind: z.enum(['MANUAL', 'SCHEDULED', 'EVENT']).optional(),
  visibilityRoles: z.array(roleSchema).max(20).optional(),
  tags: z.array(z.string().trim().min(1).max(32)).max(8).optional(),
  definition: workflowDefinitionSchema,
}).strict()
const runSchema = z.object({
  action: z.literal('run'),
  workflowId: z.string().uuid(),
  command: z.string().trim().min(1).max(4_000).optional(),
  nodeInputs: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
}).strict()
const publishSchema = z.object({ action: z.literal('publish'), workflowId: z.string().uuid() }).strict()

function failure(error: unknown): NextResponse {
  if (error instanceof WorkflowPlatformError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'INVALID_REQUEST' ? 400 : error.code === 'BACKEND_UNAVAILABLE' ? 503 : 422
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('Workflow platform request failed', error)
  return NextResponse.json({ success: false, error: '工作流中枢暂时不可用', code: 'WORKFLOW_PLATFORM_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, data: await getWorkflowOverview(user) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const body = await request.json().catch(() => null)
  try {
    if (body?.action === 'create') {
      const parsed = createSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? '工作流定义无效', code: 'INVALID_WORKFLOW_REQUEST' }, { status: 400 })
      return NextResponse.json({ success: true, data: await createWorkflow(user, parsed.data) }, { status: 201 })
    }
    if (body?.action === 'run') {
      const parsed = runSchema.safeParse(body)
      if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? '运行请求无效', code: 'INVALID_WORKFLOW_RUN' }, { status: 400 })
      return NextResponse.json({ success: true, data: await runWorkflow(user, parsed.data.workflowId, { command: parsed.data.command, nodeInputs: parsed.data.nodeInputs }) })
    }
    return NextResponse.json({ success: false, error: '不支持的工作流操作', code: 'UNSUPPORTED_WORKFLOW_ACTION' }, { status: 400 })
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const parsed = publishSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: '发布请求无效', code: 'INVALID_WORKFLOW_PUBLISH' }, { status: 400 })
    return NextResponse.json({ success: true, data: await publishWorkflow(user, parsed.data.workflowId) })
  } catch (error) { return failure(error) }
}
