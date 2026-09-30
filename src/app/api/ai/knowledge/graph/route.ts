import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { getKnowledgeGraph, KnowledgeError } from '@/lib/ai/knowledge/service'

export async function GET(_request: NextRequest) {
  const user = await getAuthUser(_request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    return NextResponse.json({ success: true, data: await getKnowledgeGraph(user) })
  } catch (error) {
    const status = error instanceof KnowledgeError && error.code === 'FORBIDDEN' ? 403 : 503
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '\u77e5\u8bc6\u56fe\u8c31\u6682\u4e0d\u53ef\u7528', code: error instanceof KnowledgeError ? error.code : 'KNOWLEDGE_UNAVAILABLE' }, { status })
  }
}
