import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { FederationError, getMultimodalOverview, ingestMultimodalAsset, reviewMultimodalObservation } from '@/lib/ai/platform/federation'

const reviewSchema = z.object({ action: z.literal('review'), observationId: z.string().uuid(), decision: z.enum(['approve','reject']) }).strict()
function failure(error: unknown): NextResponse {
  if (error instanceof FederationError) {
    const status = error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'BACKEND_UNAVAILABLE' || error.code === 'STORAGE_FAILURE' ? 503 : 400
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status, headers: { 'Cache-Control': 'no-store' } })
  }
  console.error('Multimodal request failed', error)
  return NextResponse.json({ success: false, error: '多模态证据服务暂时不可用', code: 'MULTIMODAL_UNAVAILABLE' }, { status: 503 })
}
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request); if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try { return NextResponse.json({ success: true, data: await getMultimodalOverview(user) }, { headers: { 'Cache-Control': 'no-store' } }) } catch (error) { return failure(error) }
}
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request); if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData(); const file = form.get('file')
      if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') return NextResponse.json({ success: false, error: '请选择要登记的多模态文件', code: 'FILE_REQUIRED' }, { status: 400 })
      const bytes = Buffer.from(await file.arrayBuffer())
      const asset = await ingestMultimodalAsset(user, { name: file.name, contentType: file.type || 'application/octet-stream', bytes, sensitivity: String(form.get('sensitivity') ?? 'INTERNAL'), consentBasis: String(form.get('consentBasis') ?? ''), annotation: String(form.get('annotation') ?? '') || undefined })
      return NextResponse.json({ success: true, data: asset }, { status: 201 })
    }
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ success: false, error: '观察复核请求无效', code: 'INVALID_MULTIMODAL_REVIEW' }, { status: 400 })
    return NextResponse.json({ success: true, data: await reviewMultimodalObservation(user, parsed.data.observationId, parsed.data.decision) })
  } catch (error) { return failure(error) }
}
