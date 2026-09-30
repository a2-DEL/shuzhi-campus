import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { AiRuntimeError } from '@/lib/ai/runtime/orchestrator'
import { AiPlanningError } from '@/lib/ai/runtime/planner'
import {
  acceptCollaborationDeliverable, addCollaborationNote, CollaborationError, createCollaborationRoom,
  decideCollaborationRoom, getCollaborationOverview, getCollaborationRoom,
} from '@/lib/ai/platform/collaboration'

const stepSchema = z.object({ skillId: z.string().trim().min(1).max(100), title: z.string().trim().max(220).optional(), params: z.record(z.string(), z.unknown()).optional(), dependsOn: z.array(z.string().trim().max(128)).max(8).optional() }).strict()
const createSchema = z.object({ action: z.literal('create'), taskId: z.string().uuid().optional(), title: z.string().trim().max(220).optional(), objective: z.string().trim().max(2_000).optional(), command: z.string().trim().max(4_000).optional(), skillId: z.string().trim().max(100).optional(), params: z.record(z.string(), z.unknown()).optional(), workflow: z.array(stepSchema).max(7).optional() }).strict().refine((value) => Boolean(value.taskId || value.command), { message: '需要已有任务或业务指令' })
const noteSchema = z.object({ action: z.literal('note'), roomId: z.string().uuid(), content: z.string().trim().min(2).max(2_000), noteType: z.enum(['NOTE','CLARIFICATION','DECISION_CONTEXT','ACCEPTANCE']).optional(), nodeId: z.string().trim().max(128).optional() }).strict()
const decideSchema = z.object({ action: z.literal('decide'), roomId: z.string().uuid(), decision: z.enum(['approve','reject']), reason: z.string().trim().max(500).optional() }).strict()
const acceptSchema = z.object({ action: z.literal('accept'), roomId: z.string().uuid(), deliverableId: z.string().uuid() }).strict()

function failure(error: unknown): NextResponse {
  if (error instanceof CollaborationError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'BACKEND_UNAVAILABLE' ? 503 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  if (error instanceof AiPlanningError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'PERMISSION_DENIED' ? 403 : 400 })
  if (error instanceof AiRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'TASK_ACCESS_DENIED' ? 403 : error.code === 'TASK_NOT_FOUND' ? 404 : 409 })
  console.error('Collaboration request failed', error)
  return NextResponse.json({ success: false, error: '多 Agent 协同办公暂时不可用', code: 'COLLABORATION_UNAVAILABLE' }, { status: 503 })
}
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request); if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { const roomId = request.nextUrl.searchParams.get('roomId'); return NextResponse.json({ success: true, data: roomId ? await getCollaborationRoom(user, roomId) : await getCollaborationOverview(user) }, { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request); if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const body = await request.json().catch(() => null)
  try {
    if (body?.action === 'create') { const parsed=createSchema.safeParse(body); if(!parsed.success)return NextResponse.json({success:false,error:parsed.error.issues[0]?.message??'创建请求无效',code:'INVALID_COLLABORATION_CREATE'},{status:400}); return NextResponse.json({success:true,data:await createCollaborationRoom(user,parsed.data)},{status:201}) }
    if (body?.action === 'note') { const parsed=noteSchema.safeParse(body); if(!parsed.success)return NextResponse.json({success:false,error:'协作说明无效',code:'INVALID_COLLABORATION_NOTE'},{status:400}); return NextResponse.json({success:true,data:await addCollaborationNote(user,parsed.data.roomId,parsed.data.content,parsed.data.noteType,parsed.data.nodeId)}) }
    if (body?.action === 'decide') { const parsed=decideSchema.safeParse(body); if(!parsed.success)return NextResponse.json({success:false,error:'裁决请求无效',code:'INVALID_COLLABORATION_DECISION'},{status:400}); return NextResponse.json({success:true,data:await decideCollaborationRoom(user,parsed.data.roomId,parsed.data.decision,parsed.data.reason)}) }
    if (body?.action === 'accept') { const parsed=acceptSchema.safeParse(body); if(!parsed.success)return NextResponse.json({success:false,error:'验收请求无效',code:'INVALID_DELIVERABLE_ACCEPTANCE'},{status:400}); return NextResponse.json({success:true,data:await acceptCollaborationDeliverable(user,parsed.data.roomId,parsed.data.deliverableId)}) }
    return NextResponse.json({ success: false, error: '不支持的协同操作', code: 'UNSUPPORTED_COLLABORATION_ACTION' }, { status: 400 })
  } catch (error) { return failure(error) }
}
