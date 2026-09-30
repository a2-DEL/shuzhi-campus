import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { answerKnowledgeWithRag, KnowledgeError } from '@/lib/ai/knowledge/service'

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const body = await request.json().catch(() => ({})) as { question?: unknown }
    return NextResponse.json({ success: true, data: await answerKnowledgeWithRag(user, String(body.question ?? '')) })
  } catch (error) {
    const code = error instanceof KnowledgeError ? error.code : 'KNOWLEDGE_UNAVAILABLE'
    const status = code === 'INVALID_REQUEST' ? 400 : code === 'FORBIDDEN' ? 403 : code === 'TENANT_REQUIRED' ? 400 : 503
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '\u77e5\u8bc6\u68c0\u7d22\u6682\u4e0d\u53ef\u7528', code }, { status })
  }
}
