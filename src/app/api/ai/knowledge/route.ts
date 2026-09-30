import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import {
  getKnowledgeOverview,
  ingestKnowledgeDocument,
  KnowledgeError,
  listKnowledgeDocuments,
  listKnowledgeJobs,
} from '@/lib/ai/knowledge/service'
import type { KnowledgeIngestInput } from '@/lib/ai/knowledge/types'

function errorResponse(error: unknown): NextResponse {
  if (error instanceof KnowledgeError) {
    const status = error.code === 'UNAUTHENTICATED' ? 401 : error.code === 'FORBIDDEN' ? 403 : error.code === 'NOT_FOUND' ? 404 : error.code === 'CONFLICT' ? 409 : error.code === 'INVALID_REQUEST' ? 400 : 503
    return NextResponse.json({ success: false, error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '\u77e5\u8bc6\u4e2d\u67a2\u6682\u4e0d\u53ef\u7528', code: 'KNOWLEDGE_UNAVAILABLE' }, { status: 503 })
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  const scope = request.nextUrl.searchParams.get('scope') ?? 'overview'
  try {
    if (scope === 'documents') return NextResponse.json({ success: true, data: await listKnowledgeDocuments(user) })
    if (scope === 'jobs') return NextResponse.json({ success: true, data: await listKnowledgeJobs(user) })
    return NextResponse.json({ success: true, data: await getKnowledgeOverview(user) })
  } catch (error) {
    return errorResponse(error)
  }
}

async function readIngestInput(request: NextRequest): Promise<KnowledgeIngestInput> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    const file = form.get('file')
    const content = typeof file === 'object' && file && 'text' in file && typeof file.text === 'function' ? await file.text() : String(form.get('content') ?? '')
    let grants: KnowledgeIngestInput['grants']
    const grantsValue = form.get('grants')
    if (typeof grantsValue === 'string' && grantsValue.trim()) {
      try { grants = JSON.parse(grantsValue) } catch { throw new KnowledgeError('INVALID_REQUEST', '\u77e5\u8bc6\u6388\u6743\u914d\u7f6e\u4e0d\u662f\u6709\u6548\u683c\u5f0f') }
    }
    return {
      title: String(form.get('title') ?? (typeof file === 'object' && file && 'name' in file ? file.name : '')),
      description: String(form.get('description') ?? ''),
      content,
      sourceKind: String(form.get('sourceKind') ?? 'TEXT') as KnowledgeIngestInput['sourceKind'],
      sourceUri: String(form.get('sourceUri') ?? ''),
      externalKey: String(form.get('externalKey') ?? ''),
      visibility: String(form.get('visibility') ?? 'TENANT') as KnowledgeIngestInput['visibility'],
      sensitivity: String(form.get('sensitivity') ?? 'INTERNAL') as KnowledgeIngestInput['sensitivity'],
      ownerOrganizationId: String(form.get('ownerOrganizationId') ?? ''),
      grants,
    }
  }
  const body = await request.json().catch(() => ({})) as Partial<KnowledgeIngestInput>
  return {
    title: String(body.title ?? ''),
    description: body.description,
    content: String(body.content ?? ''),
    sourceKind: body.sourceKind,
    sourceUri: body.sourceUri,
    externalKey: body.externalKey,
    visibility: body.visibility,
    sensitivity: body.sensitivity,
    ownerOrganizationId: body.ownerOrganizationId,
    grants: body.grants,
    metadata: body.metadata,
  }
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  try {
    const input = await readIngestInput(request)
    const document = await ingestKnowledgeDocument(user, input)
    return NextResponse.json({ success: true, data: document }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
