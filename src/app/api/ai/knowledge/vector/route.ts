import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { getKnowledgeVectorDiagnostics, inspectKnowledgeVectorSearch, KnowledgeError } from '@/lib/ai/knowledge/service'

const searchSchema = z.object({ query: z.string().trim().min(2).max(500) }).strict()
function failure(error: unknown): NextResponse {
  if (error instanceof KnowledgeError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'INVALID_REQUEST' ? 400 : error.code === 'NOT_FOUND' ? 404 : error.code === 'BACKEND_UNAVAILABLE' ? 503 : 409
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  return NextResponse.json({ success: false, error: '向量检索诊断暂时不可用', code: 'VECTOR_DIAGNOSTICS_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
}
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await getKnowledgeVectorDiagnostics(user) }, { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const parsed = searchSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: '检索文本必须为 2-500 个字符', code: 'INVALID_VECTOR_QUERY' }, { status: 400 })
    return NextResponse.json({ success: true, data: await inspectKnowledgeVectorSearch(user, parsed.data.query) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return failure(error) }
}
