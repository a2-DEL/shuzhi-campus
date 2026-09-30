import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { extractKnowledgeGraph, KnowledgeError, listKnowledgeRelationCandidates, reviewKnowledgeRelation } from '@/lib/ai/knowledge/service'

function errorResponse(error: unknown): NextResponse {
  const code = error instanceof KnowledgeError ? error.code : 'KNOWLEDGE_UNAVAILABLE'
  const status = code === 'FORBIDDEN' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'INVALID_REQUEST' ? 400 : 503
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '\u56fe\u8c31\u6cbb\u7406\u6682\u4e0d\u53ef\u7528', code }, { status })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await listKnowledgeRelationCandidates(user) }) } catch (error) { return errorResponse(error) }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as { action?: string; documentId?: string }
    if (body.action !== 'extract' || !body.documentId) return NextResponse.json({ success: false, error: '\u8bf7\u9009\u62e9\u8981\u63d0\u53d6\u56fe\u8c31\u5019\u9009\u7684\u77e5\u8bc6\u6587\u6863', code: 'INVALID_REQUEST' }, { status: 400 })
    return NextResponse.json({ success: true, data: await extractKnowledgeGraph(user, body.documentId) }, { status: 201 })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as { relationId?: string; decision?: 'approve' | 'reject' }
    if (!body.relationId || !['approve', 'reject'].includes(body.decision ?? '')) return NextResponse.json({ success: false, error: '\u56fe\u8c31\u5ba1\u6838\u53c2\u6570\u4e0d\u5b8c\u6574', code: 'INVALID_REQUEST' }, { status: 400 })
    await reviewKnowledgeRelation(user, body.relationId, body.decision!)
    return NextResponse.json({ success: true, data: { relationId: body.relationId, status: body.decision === 'approve' ? 'PUBLISHED' : 'REJECTED' } })
  } catch (error) { return errorResponse(error) }
}
