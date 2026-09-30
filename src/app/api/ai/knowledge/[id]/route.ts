import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { archiveKnowledgeDocument, getKnowledgeDocument, KnowledgeError } from '@/lib/ai/knowledge/service'

function errorResponse(error: unknown): NextResponse {
  if (error instanceof KnowledgeError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'INVALID_REQUEST' ? 400 : 503
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '\u77e5\u8bc6\u6587\u6863\u6682\u4e0d\u53ef\u7528', code: 'KNOWLEDGE_UNAVAILABLE' }, { status: 503 })
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(_request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const { id } = await context.params
    return NextResponse.json({ success: true, data: await getKnowledgeDocument(user, id) })
  } catch (error) { return errorResponse(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => ({})) as { action?: string }
    if (!['archive', 'restore'].includes(body.action ?? '')) return NextResponse.json({ success: false, error: '\u53ea\u5141\u8bb8\u5f52\u6863\u6216\u6062\u590d\u77e5\u8bc6\u6587\u6863', code: 'INVALID_REQUEST' }, { status: 400 })
    return NextResponse.json({ success: true, data: await archiveKnowledgeDocument(user, id, body.action === 'restore') })
  } catch (error) { return errorResponse(error) }
}
