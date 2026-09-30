import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { UserRole, type User } from '@/types'
import { answerKnowledgeQuestion, extractKnowledgeGraphCandidates } from '@/lib/ai/model-gateway/baize'
import type {
  KnowledgeChunkDraft,
  KnowledgeDocumentView,
  KnowledgeGraphExploreView,
  KnowledgeGraphView,
  KnowledgeIngestInput,
  KnowledgeRankingWeights,
  KnowledgeOverview,
  KnowledgeSearchResponse,
  KnowledgeSourceKind,
  KnowledgeVectorDiagnostics,
  KnowledgeVectorSearchResponse,
  KnowledgeUserContext,
} from './types'

const VECTOR_DIMENSIONS = 128
const VECTOR_BACKEND = 'postgres-array-cosine-v1'
const VECTOR_MODEL = 'hashed-cjk-ngram-v1'
const PARSER_VERSION = 'plain-text-sections-v1'
const MAX_SOURCE_CHARACTERS = 250_000
const MAX_TITLE_CHARACTERS = 300
const MAX_CHUNK_CHARACTERS = 900
const CHUNK_OVERLAP = 120

export class KnowledgeError extends Error {
  constructor(
    readonly code: 'UNAUTHENTICATED' | 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'KnowledgeError'
  }
}

export function knowledgeContext(user: User): KnowledgeUserContext {
  if (!user.school_id) throw new KnowledgeError('TENANT_REQUIRED', '\u5f53\u524d\u8eab\u4efd\u6ca1\u6709\u7ed1\u5b9a\u5b66\u6821\u79df\u6237')
  return { user, schoolId: user.school_id }
}

export function canManageKnowledge(user: User): boolean {
  return user.role === UserRole.SUPER_ADMIN || user.role === UserRole.AI_OPS_ADMIN
}

function requirePostgres(): void {
  if (!hasPostgresDatabaseUrl()) throw new KnowledgeError('BACKEND_UNAVAILABLE', '\u77e5\u8bc6\u4e2d\u67a2\u9700\u8981 PostgreSQL \u6301\u4e45\u5316\uff0c\u5f53\u524d\u7cfb\u7edf\u4fdd\u6301\u5931\u8d25\u5173\u95ed')
}

function requireKnowledgeManager(user: User): KnowledgeUserContext {
  const context = knowledgeContext(user)
  if (!canManageKnowledge(user)) throw new KnowledgeError('FORBIDDEN', '\u53ea\u6709\u7cfb\u7edf\u7ba1\u7406\u5458\u6216 AI \u8fd0\u7ef4\u7ba1\u7406\u5458\u53ef\u4ee5\u6cbb\u7406\u77e5\u8bc6\u7248\u672c')
  requirePostgres()
  return context
}

function iso(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : undefined
}

export function hashKnowledgeText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function normalizedSource(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim()
}

function sectionAt(text: string, offset: number): string[] {
  const before = text.slice(0, offset)
  const headings = before.match(/(?:^|\n)\s*(?:#{1,6}\s+|\u7b2c[\u4e00-\u9fff0-9]+[\u7ae0\u8282\u6761\u3001. ]+)([^\n]{1,120})/g) ?? []
  const last = headings.at(-1)?.replace(/^\s*(?:#{1,6}\s+|\u7b2c[\u4e00-\u9fff0-9]+[\u7ae0\u8282\u6761\u3001. ]+)/, '').trim()
  return last ? [last] : []
}

export function chunkKnowledgeText(input: string, maxCharacters = MAX_CHUNK_CHARACTERS, overlap = CHUNK_OVERLAP): KnowledgeChunkDraft[] {
  const text = normalizedSource(input)
  if (!text) return []
  const chunks: KnowledgeChunkDraft[] = []
  let cursor = 0
  let index = 0
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + maxCharacters)
    if (end < text.length) {
      const boundaryStart = Math.min(end, cursor + Math.floor(maxCharacters * 0.55))
      const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('?', end), text.lastIndexOf('?', end), text.lastIndexOf('!', end), text.lastIndexOf('?', end))
      if (boundary >= boundaryStart) end = boundary + 1
    }
    const raw = text.slice(cursor, end)
    const leftTrimmed = raw.replace(/^\s+/, '')
    const rightTrimmed = leftTrimmed.replace(/\s+$/, '')
    const leading = raw.length - leftTrimmed.length
    const trailing = raw.length - leftTrimmed.length - rightTrimmed.length
    const start = cursor + leading
    const finish = end - trailing
    if (rightTrimmed) {
      chunks.push({ index, content: rightTrimmed, sectionPath: sectionAt(text, start), charStart: start, charEnd: finish })
      index += 1
    }
    if (end >= text.length) break
    const nextCursor = Math.max(cursor + 1, end - overlap)
    cursor = nextCursor <= cursor ? end : nextCursor
  }
  return chunks
}

function hashIndex(value: string): { index: number; sign: number } {
  const digest = createHash('sha256').update(value, 'utf8').digest()
  return { index: digest.readUInt32BE(0) % VECTOR_DIMENSIONS, sign: (digest[4] & 1) === 0 ? 1 : -1 }
}

function vectorUnitWeight(unit: string): number {
  if (unit.length >= 3) return 1.45
  if (unit.length === 2) return 1.2
  return 0.7
}

export function createKnowledgeFeatureVector(input: string, dimensions = VECTOR_DIMENSIONS): number[] {
  if (dimensions !== VECTOR_DIMENSIONS) throw new KnowledgeError('INVALID_REQUEST', `\u77e5\u8bc6\u5411\u91cf\u7ef4\u5ea6\u5fc5\u987b\u4e3a ${VECTOR_DIMENSIONS}`)
  const text = normalizedSource(input).toLocaleLowerCase()
  const units: string[] = []
  const codePoints = Array.from(text).filter((value) => /[\p{L}\p{N}]/u.test(value))
  for (const value of codePoints) units.push(value)
  for (let i = 0; i < codePoints.length - 1; i += 1) units.push(`${codePoints[i]}${codePoints[i + 1]}`)
  for (let i = 0; i < codePoints.length - 2; i += 1) units.push(`${codePoints[i]}${codePoints[i + 1]}${codePoints[i + 2]}`)
  for (const word of text.match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []) units.push(word)
  const vector = Array<number>(dimensions).fill(0)
  for (const unit of units) {
    const bucket = hashIndex(unit)
    vector[bucket.index] += bucket.sign * vectorUnitWeight(unit)
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))
  if (!norm) return vector
  return vector.map((value) => Number((value / norm).toFixed(8)))
}

function estimatedTokens(text: string): number {
  return Math.max(1, Math.ceil(Array.from(text).length / 2))
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function sourceKind(value: unknown): KnowledgeSourceKind {
  const allowed: KnowledgeSourceKind[] = ['TEXT', 'MARKDOWN', 'POLICY', 'RUNBOOK', 'FAQ', 'BUSINESS_EVENT']
  return allowed.includes(value as KnowledgeSourceKind) ? value as KnowledgeSourceKind : 'TEXT'
}

function validateInput(input: KnowledgeIngestInput): Required<Pick<KnowledgeIngestInput, 'title' | 'content'>> & KnowledgeIngestInput {
  const title = String(input.title ?? '').trim()
  const content = normalizedSource(String(input.content ?? ''))
  if (!title || title.length > MAX_TITLE_CHARACTERS) throw new KnowledgeError('INVALID_REQUEST', `\u6587\u6863\u6807\u9898\u5fc5\u987b\u4e3a 1-${MAX_TITLE_CHARACTERS} \u4e2a\u5b57\u7b26`)
  if (content.length < 40 || content.length > MAX_SOURCE_CHARACTERS) throw new KnowledgeError('INVALID_REQUEST', `\u6587\u6863\u6b63\u6587\u5fc5\u987b\u4e3a 40-${MAX_SOURCE_CHARACTERS} \u4e2a\u5b57\u7b26`)
  return { ...input, title, content, sourceKind: sourceKind(input.sourceKind), description: String(input.description ?? '').trim().slice(0, 2000), metadata: asObject(input.metadata) }
}

function organizationIds(user: User): string[] {
  const ids = new Set<string>()
  if (user.primary_organization_id) ids.add(user.primary_organization_id)
  for (const assignment of user.role_assignments ?? []) {
    if (assignment.scope_type === 'organization' && assignment.scope_id) ids.add(assignment.scope_id)
  }
  return [...ids]
}

interface AccessFilter { sql: string; params: unknown[] }

function accessFilter(user: User, alias = 'd'): AccessFilter {
  const schoolId = user.school_id
  if (!schoolId) throw new KnowledgeError('TENANT_REQUIRED', '\u5f53\u524d\u8eab\u4efd\u6ca1\u6709\u7ed1\u5b9a\u5b66\u6821\u79df\u6237')
  const params: unknown[] = [schoolId]
  if (canManageKnowledge(user)) return { sql: `${alias}.school_id=$1::uuid`, params }
  const roleIndex = params.push(user.role)
  const userIndex = params.push(user.id)
  const orgIndex = params.push(organizationIds(user))
  return {
    sql: `${alias}.school_id=$1::uuid AND ${alias}.status='PUBLISHED' AND (
      ${alias}.visibility='TENANT'
      OR EXISTS (
        SELECT 1 FROM ai_knowledge_document_grants g
        WHERE g.school_id=${alias}.school_id AND g.document_id=${alias}.id AND (
          (g.principal_type='ROLE' AND g.principal_id=$${roleIndex})
          OR (g.principal_type='USER' AND g.principal_id=$${userIndex})
          OR (g.principal_type='ORGANIZATION' AND g.principal_id=ANY($${orgIndex}::text[]))
        )
      )
    )`,
    params,
  }
}

async function ensureDefaultBase(client: Pool | PoolClient, schoolId: string, userId?: string): Promise<{ id: string; slug: string; name: string; description: string; status: string }> {
  const result = await client.query(
    `INSERT INTO ai_knowledge_bases(school_id,slug,name,description,created_by)
     VALUES($1::uuid,'campus-knowledge','\u6821\u56ed\u77e5\u8bc6\u4e2d\u67a2','\u5236\u5ea6\u3001\u4e1a\u52a1\u89c4\u7a0b\u3001\u8fd0\u884c\u624b\u518c\u4e0e\u7ecf\u8fc7\u5ba1\u6838\u7684 Agent \u7ecf\u9a8c\u3002',$2)
     ON CONFLICT(school_id,slug) DO UPDATE SET updated_at=now()
     RETURNING id,slug,name,description,status`,
    [schoolId, userId ?? null],
  )
  return result.rows[0]
}

function mapDocument(row: Record<string, unknown>): KnowledgeDocumentView {
  return {
    id: String(row.id),
    knowledgeBaseId: String(row.knowledge_base_id),
    title: String(row.title),
    description: String(row.description ?? ''),
    sourceKind: String(row.source_kind) as KnowledgeSourceKind,
    sourceUri: typeof row.source_uri === 'string' ? row.source_uri : undefined,
    visibility: String(row.visibility) as KnowledgeDocumentView['visibility'],
    sensitivity: String(row.sensitivity) as KnowledgeDocumentView['sensitivity'],
    status: String(row.status) as KnowledgeDocumentView['status'],
    currentVersion: Number(row.current_version ?? 0),
    chunkCount: Number(row.chunk_count ?? 0),
    entityCount: Number(row.entity_count ?? 0),
    relationCount: Number(row.relation_count ?? 0),
    latestVersionAt: iso(row.latest_version_at),
    updatedAt: iso(row.updated_at) ?? new Date().toISOString(),
    createdByName: typeof row.created_by_name === 'string' ? row.created_by_name : undefined,
  }
}

const DOCUMENT_SELECT = `
  SELECT d.id,d.knowledge_base_id,d.title,d.description,d.source_kind,d.source_uri,d.visibility,d.sensitivity,
         d.status,d.current_version,d.updated_at,u.name AS created_by_name,
         v.published_at AS latest_version_at,
         count(DISTINCT c.id)::int AS chunk_count,
         count(DISTINCT em.entity_id)::int AS entity_count,
         count(DISTINCT r.id)::int AS relation_count
    FROM ai_knowledge_documents d
    LEFT JOIN users u ON u.id=d.created_by
    LEFT JOIN ai_knowledge_document_versions v ON v.document_id=d.id AND v.version_no=d.current_version
    LEFT JOIN ai_knowledge_chunks c ON c.document_id=d.id AND c.version_id=v.id
    LEFT JOIN ai_knowledge_entity_mentions em ON em.chunk_id=c.id
    LEFT JOIN ai_knowledge_relations r ON r.source_chunk_id=c.id AND r.status='PUBLISHED'
`

export async function getKnowledgeOverview(user: User): Promise<KnowledgeOverview> {
  const { schoolId } = knowledgeContext(user)
  requirePostgres()
  const pool = getPostgresPool()
  const baseResult = await pool.query<{ id: string; slug: string; name: string; description: string; status: string }>(
    "SELECT id,slug,name,description,status FROM ai_knowledge_bases WHERE school_id=$1::uuid AND slug='campus-knowledge'",
    [schoolId],
  )
  const base = baseResult.rows[0] ?? (canManageKnowledge(user)
    ? await ensureDefaultBase(pool, schoolId, user.id)
    : (() => { throw new KnowledgeError('BACKEND_UNAVAILABLE', '\u5f53\u524d\u79df\u6237\u5c1a\u672a\u521d\u59cb\u5316\u77e5\u8bc6\u4e2d\u67a2') })())
  const access = accessFilter(user, 'd')
  const retrievalFilter = canManageKnowledge(user) ? 'school_id=$1::uuid' : 'school_id=$1::uuid AND user_id=$3'
  const candidateMetric = canManageKnowledge(user)
    ? "(SELECT count(*)::int FROM ai_knowledge_relations WHERE school_id=$1::uuid AND status='CANDIDATE')"
    : '0::int'
  const [metrics, jobs] = await Promise.all([
    pool.query<{
      documents: number; published_documents: number; chunks: number; published_entities: number; published_relations: number; candidate_relations: number; retrievals_today: number; answered_today: number; citation_rate_today: number
    }>(
      `SELECT
        (SELECT count(*)::int FROM ai_knowledge_documents d WHERE ${access.sql} AND d.status <> 'ARCHIVED') AS documents,
        (SELECT count(*)::int FROM ai_knowledge_documents d WHERE ${access.sql} AND d.status='PUBLISHED') AS published_documents,
        (SELECT count(*)::int FROM ai_knowledge_chunks c JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE ${access.sql} AND d.status='PUBLISHED' AND c.version_id IN (SELECT v.id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED')) AS chunks,
        (SELECT count(*)::int FROM ai_knowledge_entities e WHERE e.school_id=$1::uuid AND e.status='PUBLISHED' AND EXISTS (SELECT 1 FROM ai_knowledge_entity_mentions em JOIN ai_knowledge_chunks c ON c.id=em.chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE em.entity_id=e.id AND ${access.sql})) AS published_entities,
        (SELECT count(*)::int FROM ai_knowledge_relations r JOIN ai_knowledge_chunks c ON c.id=r.source_chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE r.status='PUBLISHED' AND ${access.sql}) AS published_relations,
        ${candidateMetric} AS candidate_relations,
        (SELECT count(*)::int FROM ai_knowledge_retrievals WHERE ${retrievalFilter} AND created_at >= date_trunc('day', now())) AS retrievals_today,
        (SELECT count(*)::int FROM ai_knowledge_retrievals WHERE ${retrievalFilter} AND status='ANSWERED' AND created_at >= date_trunc('day', now())) AS answered_today,
        COALESCE((SELECT avg(CASE WHEN citation_count > 0 THEN 1.0 ELSE 0.0 END)::numeric FROM ai_knowledge_retrievals WHERE ${retrievalFilter} AND created_at >= date_trunc('day', now())),0) AS citation_rate_today`,
      access.params,
    ),
    pool.query<{ id: string; document_id: string; title: string; status: string; stage: string; chunks_created: number; relation_candidates: number; created_at: Date | string }>(
      `SELECT j.id,j.document_id,d.title,j.status,j.stage,j.chunks_created,j.relation_candidates,j.started_at AS created_at
       FROM ai_knowledge_ingestion_jobs j JOIN ai_knowledge_documents d ON d.id=j.document_id
       WHERE j.school_id=$1::uuid AND ${access.sql} ORDER BY j.started_at DESC LIMIT 6`,
      access.params,
    ),
  ])
  const row = metrics.rows[0]
  return {
    persistence: 'postgres',
    base,
    metrics: {
      documents: Number(row?.documents ?? 0),
      publishedDocuments: Number(row?.published_documents ?? 0),
      chunks: Number(row?.chunks ?? 0),
      publishedEntities: Number(row?.published_entities ?? 0),
      publishedRelations: Number(row?.published_relations ?? 0),
      candidateRelations: Number(row?.candidate_relations ?? 0),
      retrievalsToday: Number(row?.retrievals_today ?? 0),
      answeredToday: Number(row?.answered_today ?? 0),
      citationRateToday: Number(row?.citation_rate_today ?? 0),
    },
    vector: { backend: VECTOR_BACKEND, dimensions: VECTOR_DIMENSIONS, ann: false, note: '\u5f53\u524d\u672c\u5730 PostgreSQL \u4f7f\u7528\u53ef\u5ba1\u8ba1\u5b9e\u6570\u7279\u5f81\u5411\u91cf\u4e0e\u4f59\u5f26\u51fd\u6570\uff1b\u63a5\u5165 pgvector \u65f6\u4fdd\u6301\u540c\u4e00\u670d\u52a1\u5951\u7ea6\u3002' },
    recentJobs: jobs.rows.map((job) => ({ id: job.id, documentId: job.document_id, title: job.title, status: job.status, stage: job.stage, chunksCreated: Number(job.chunks_created), relationCandidates: Number(job.relation_candidates), createdAt: iso(job.created_at) ?? new Date().toISOString() })),
  }
}

export async function listKnowledgeDocuments(user: User): Promise<KnowledgeDocumentView[]> {
  knowledgeContext(user)
  requirePostgres()
  const filter = accessFilter(user)
  const result = await getPostgresPool().query(`${DOCUMENT_SELECT} WHERE ${filter.sql} GROUP BY d.id,u.name,v.published_at ORDER BY d.updated_at DESC LIMIT 100`, filter.params)
  return result.rows.map((row: Record<string, unknown>) => mapDocument(row))
}

export async function getKnowledgeDocument(user: User, documentId: string): Promise<KnowledgeDocumentView> {
  knowledgeContext(user)
  requirePostgres()
  const filter = accessFilter(user)
  const params = [...filter.params, documentId]
  const result = await getPostgresPool().query(`${DOCUMENT_SELECT} WHERE ${filter.sql} AND d.id=$${params.length}::uuid GROUP BY d.id,u.name,v.published_at`, params)
  const row = result.rows[0] as Record<string, unknown> | undefined
  if (!row) throw new KnowledgeError('NOT_FOUND', '\u77e5\u8bc6\u6587\u6863\u4e0d\u5b58\u5728\u6216\u5f53\u524d\u89d2\u8272\u65e0\u6743\u67e5\u770b')
  return mapDocument(row)
}

async function validateGrants(client: Pool | PoolClient, schoolId: string, user: User, input: KnowledgeIngestInput): Promise<void> {
  if (input.ownerOrganizationId) {
    const organization = await client.query('SELECT 1 FROM organizations WHERE id=$1::uuid AND school_id=$2::uuid', [input.ownerOrganizationId, schoolId])
    if (organization.rowCount !== 1) throw new KnowledgeError('INVALID_REQUEST', '\u6587\u6863\u5f52\u5c5e\u7ec4\u7ec7\u4e0d\u5c5e\u4e8e\u5f53\u524d\u79df\u6237')
  }
  for (const grant of input.grants ?? []) {
    if (!['ROLE', 'ORGANIZATION', 'USER'].includes(grant.principalType) || !grant.principalId.trim()) throw new KnowledgeError('INVALID_REQUEST', '\u77e5\u8bc6\u6388\u6743\u9879\u683c\u5f0f\u4e0d\u6b63\u786e')
    if (grant.principalType === 'ORGANIZATION') {
      const result = await client.query('SELECT 1 FROM organizations WHERE id=$1::uuid AND school_id=$2::uuid', [grant.principalId, schoolId])
      if (result.rowCount !== 1) throw new KnowledgeError('INVALID_REQUEST', '\u6388\u6743\u7ec4\u7ec7\u4e0d\u5c5e\u4e8e\u5f53\u524d\u79df\u6237')
    }
    if (grant.principalType === 'USER') {
      const result = await client.query('SELECT 1 FROM users WHERE id=$1 AND school_id=$2::uuid AND NOT is_deleted', [grant.principalId, schoolId])
      if (result.rowCount !== 1) throw new KnowledgeError('INVALID_REQUEST', '\u6388\u6743\u7528\u6237\u4e0d\u5c5e\u4e8e\u5f53\u524d\u79df\u6237')
    }
  }
  if (input.visibility === 'PRIVATE' && !(input.grants ?? []).some((grant) => grant.principalType === 'USER' && grant.principalId === user.id)) {
    input.grants = [...(input.grants ?? []), { principalType: 'USER', principalId: user.id }]
  }
}

export async function ingestKnowledgeDocument(user: User, rawInput: KnowledgeIngestInput): Promise<KnowledgeDocumentView> {
  const { schoolId } = requireKnowledgeManager(user)
  const input = validateInput(rawInput)
  const contentHash = hashKnowledgeText(input.content)
  const chunks = chunkKnowledgeText(input.content)
  if (chunks.length === 0) throw new KnowledgeError('INVALID_REQUEST', '\u6587\u6863\u6ca1\u6709\u53ef\u5efa\u7acb\u7d22\u5f15\u7684\u6b63\u6587')
  const client = await getPostgresPool().connect()
  const traceId = randomUUID().replaceAll('-', '')
  try {
    await client.query('BEGIN')
    const base = await ensureDefaultBase(client, schoolId, user.id)
    await validateGrants(client, schoolId, user, input)
    let documentId: string
    let currentVersion = 0
    const existing = input.externalKey
      ? await client.query<{ id: string; current_version: number }>('SELECT id,current_version FROM ai_knowledge_documents WHERE school_id=$1::uuid AND knowledge_base_id=$2::uuid AND external_key=$3 FOR UPDATE', [schoolId, base.id, input.externalKey])
      : { rows: [] as Array<{ id: string; current_version: number }> }
    if (existing.rows[0]) {
      documentId = existing.rows[0].id
      currentVersion = Number(existing.rows[0].current_version)
    } else {
      const created = await client.query<{ id: string }>(
        `INSERT INTO ai_knowledge_documents(school_id,knowledge_base_id,external_key,title,description,source_kind,source_uri,visibility,sensitivity,owner_organization_id,status,created_by,updated_by,metadata)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,'PROCESSING',$11,$11,$12::jsonb) RETURNING id`,
        [schoolId, base.id, input.externalKey ?? null, input.title, input.description ?? '', input.sourceKind, input.sourceUri ?? null, input.visibility ?? 'TENANT', input.sensitivity ?? 'INTERNAL', input.ownerOrganizationId ?? null, user.id, JSON.stringify(input.metadata ?? {})],
      )
      documentId = created.rows[0].id
    }
    const duplicate = await client.query<{ id: string; version_no: number }>('SELECT id,version_no FROM ai_knowledge_document_versions WHERE document_id=$1::uuid AND content_hash=$2', [documentId, contentHash])
    if (duplicate.rows[0]) {
      await client.query('UPDATE ai_knowledge_documents SET status=\'PUBLISHED\',current_version=$2,updated_by=$3,updated_at=now() WHERE id=$1::uuid', [documentId, duplicate.rows[0].version_no, user.id])
      await client.query('COMMIT')
      return getKnowledgeDocument(user, documentId)
    }
    const versionNo = currentVersion + 1
    const version = await client.query<{ id: string }>(
      `INSERT INTO ai_knowledge_document_versions(school_id,document_id,version_no,source_text,content_hash,parser_kind,parser_version,status,char_count,lineage,created_by)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,'PROCESSING',$8,$9::jsonb,$10) RETURNING id`,
      [schoolId, documentId, versionNo, input.content, contentHash, input.sourceKind === 'MARKDOWN' ? 'markdown' : 'plain-text', PARSER_VERSION, input.content.length, JSON.stringify({ traceId, sourceUri: input.sourceUri ?? null }), user.id],
    )
    const versionId = version.rows[0].id
    const job = await client.query<{ id: string }>(
      `INSERT INTO ai_knowledge_ingestion_jobs(school_id,document_id,version_id,status,stage,source_hash,created_by)
       VALUES($1::uuid,$2::uuid,$3,'INDEXING','CHUNKING',$4,$5) RETURNING id`,
      [schoolId, documentId, versionId, contentHash, user.id],
    )
    for (const chunk of chunks) {
      const chunkHash = hashKnowledgeText(`${chunk.index}:${chunk.content}`)
      const vector = createKnowledgeFeatureVector(chunk.content)
      await client.query(
        `INSERT INTO ai_knowledge_chunks(school_id,document_id,version_id,chunk_index,section_path,char_start,char_end,content,content_hash,search_vector,feature_vector,vector_dimensions,embedding_backend,embedding_model,token_estimate,metadata)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::text[],$6,$7,$8,$9,to_tsvector('simple',$8),$10::real[],$11,$12,$13,$14,$15::jsonb)`,
        [schoolId, documentId, versionId, chunk.index, chunk.sectionPath, chunk.charStart, chunk.charEnd, chunk.content, chunkHash, vector, VECTOR_DIMENSIONS, VECTOR_BACKEND, VECTOR_MODEL, estimatedTokens(chunk.content), JSON.stringify({ sectionPath: chunk.sectionPath })],
      )
    }
    if (input.grants) {
      await client.query('DELETE FROM ai_knowledge_document_grants WHERE school_id=$1::uuid AND document_id=$2::uuid', [schoolId, documentId])
      for (const grant of input.grants) {
        await client.query(
          `INSERT INTO ai_knowledge_document_grants(school_id,document_id,principal_type,principal_id,granted_by)
           VALUES($1::uuid,$2::uuid,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [schoolId, documentId, grant.principalType, grant.principalId, user.id],
        )
      }
    }
    await client.query(`UPDATE ai_knowledge_document_versions SET status='SUPERSEDED' WHERE document_id=$1::uuid AND id<>$2::uuid AND status='PUBLISHED'`, [documentId, versionId])
    await client.query(`UPDATE ai_knowledge_document_versions SET status='PUBLISHED',chunk_count=$2,published_by=$3,published_at=now() WHERE id=$1::uuid`, [versionId, chunks.length, user.id])
    await client.query(`UPDATE ai_knowledge_documents SET title=$2,description=$3,source_kind=$4,source_uri=$5,visibility=$6,sensitivity=$7,owner_organization_id=$8,status='PUBLISHED',current_version=$9,updated_by=$10,updated_at=now(),metadata=$11::jsonb WHERE id=$1::uuid`, [documentId, input.title, input.description ?? '', input.sourceKind, input.sourceUri ?? null, input.visibility ?? 'TENANT', input.sensitivity ?? 'INTERNAL', input.ownerOrganizationId ?? null, versionNo, user.id, JSON.stringify(input.metadata ?? {})])
    await client.query(`UPDATE ai_knowledge_ingestion_jobs SET status='COMPLETED',stage='INDEXED',chunks_created=$2,completed_at=now() WHERE id=$1::uuid`, [job.rows[0].id, chunks.length])
    await client.query(`INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata) VALUES($1::uuid,$2,'DOCUMENT_VERSION_PUBLISHED','DOCUMENT',$3,$4,$5::jsonb)`, [schoolId, user.id, documentId, traceId, JSON.stringify({ versionNo, chunks: chunks.length, sourceKind: input.sourceKind, vectorBackend: VECTOR_BACKEND })])
    await client.query('COMMIT')
    return getKnowledgeDocument(user, documentId)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error instanceof KnowledgeError ? error : new KnowledgeError('BACKEND_UNAVAILABLE', error instanceof Error ? error.message : '\u77e5\u8bc6\u6587\u6863\u5bfc\u5165\u5931\u8d25')
  } finally {
    client.release()
  }
}

export async function archiveKnowledgeDocument(user: User, documentId: string, restore = false): Promise<KnowledgeDocumentView> {
  const { schoolId } = requireKnowledgeManager(user)
  const result = await getPostgresPool().query<{ current_version: number }>('SELECT current_version FROM ai_knowledge_documents WHERE id=$1::uuid AND school_id=$2::uuid', [documentId, schoolId])
  if (!result.rows[0]) throw new KnowledgeError('NOT_FOUND', '\u77e5\u8bc6\u6587\u6863\u4e0d\u5b58\u5728')
  const status = restore ? 'PUBLISHED' : 'ARCHIVED'
  await getPostgresPool().query('UPDATE ai_knowledge_documents SET status=$3,updated_by=$2,updated_at=now() WHERE id=$1::uuid AND school_id=$4::uuid', [documentId, user.id, status, schoolId])
  await getPostgresPool().query('INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata) VALUES($1::uuid,$2,$3,\'DOCUMENT\',$4,$5,$6::jsonb)', [schoolId, user.id, restore ? 'DOCUMENT_RESTORED' : 'DOCUMENT_ARCHIVED', documentId, randomUUID().replaceAll('-', ''), JSON.stringify({ currentVersion: result.rows[0].current_version })])
  return getKnowledgeDocument(user, documentId)
}

export async function listKnowledgeJobs(user: User): Promise<KnowledgeOverview['recentJobs']> {
  knowledgeContext(user)
  requirePostgres()
  const filter = accessFilter(user)
  const result = await getPostgresPool().query<{ id: string; document_id: string; title: string; status: string; stage: string; chunks_created: number; relation_candidates: number; created_at: Date | string }>(
    `SELECT j.id,j.document_id,d.title,j.status,j.stage,j.chunks_created,j.relation_candidates,j.started_at AS created_at
       FROM ai_knowledge_ingestion_jobs j JOIN ai_knowledge_documents d ON d.id=j.document_id
      WHERE j.school_id=$1::uuid AND ${filter.sql.replaceAll('d.', 'd.')}
      ORDER BY j.started_at DESC LIMIT 20`,
    filter.params,
  )
  return result.rows.map((row) => ({ id: row.id, documentId: row.document_id, title: row.title, status: row.status, stage: row.stage, chunksCreated: Number(row.chunks_created), relationCandidates: Number(row.relation_candidates), createdAt: iso(row.created_at) ?? new Date().toISOString() }))
}



export interface KnowledgeRetrievalContext {
  id: string
  traceId: string
  question: string
  routeMode: 'HYBRID' | 'HYBRID_GRAPH' | 'REFUSED'
  vectorBackend: string
  results: import('./types').KnowledgeCitation[]
  topScore: number
  latencyMs: number
  weights: KnowledgeRankingWeights
  rankingVersion: string
  governedRelease: boolean
}

export interface KnowledgeRetrievalOptions {
  weights?: KnowledgeRankingWeights
  evaluation?: { experimentId: string; caseId: string; variant: 'baseline' | 'candidate' }
}

export const DEFAULT_KNOWLEDGE_RANKING_WEIGHTS: Readonly<KnowledgeRankingWeights> = Object.freeze({ lexical: 0.42, vector: 0.38, graph: 0.15, authority: 0.05 })
export const KNOWLEDGE_RANKING_TARGET = 'knowledge.hybrid-ranking'

function excerpt(value: string, maximum = 420): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maximum)
}

function score(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0
}

export function validateKnowledgeRankingWeights(value: unknown): KnowledgeRankingWeights {
  const record = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const weights: KnowledgeRankingWeights = {
    lexical: Number(record.lexical), vector: Number(record.vector), graph: Number(record.graph), authority: Number(record.authority),
  }
  const values = Object.values(weights)
  if (values.some((item) => !Number.isFinite(item) || item < 0 || item > 0.8)) {
    throw new KnowledgeError('INVALID_REQUEST', '检索权重必须是 0 到 0.8 之间的有限数值')
  }
  const total = values.reduce((sum, item) => sum + item, 0)
  if (Math.abs(total - 1) > 0.0001) throw new KnowledgeError('INVALID_REQUEST', '检索权重之和必须等于 1')
  return weights
}

export async function getActiveKnowledgeRanking(schoolId: string): Promise<{ weights: KnowledgeRankingWeights; version: string; governedRelease: boolean }> {
  try {
    const result = await getPostgresPool().query<{ version: string; config: unknown }>(
      `SELECT version,config FROM ai_evolution_releases
       WHERE school_id=$1::uuid AND target_id=$2 AND status='ACTIVE'
       ORDER BY activated_at DESC LIMIT 1`,
      [schoolId, KNOWLEDGE_RANKING_TARGET],
    )
    const row = result.rows[0]
    if (!row) return { weights: { ...DEFAULT_KNOWLEDGE_RANKING_WEIGHTS }, version: 'baseline-v1', governedRelease: false }
    const config = row.config && typeof row.config === 'object' && !Array.isArray(row.config) ? row.config as Record<string, unknown> : {}
    return { weights: validateKnowledgeRankingWeights(config.weights), version: row.version, governedRelease: true }
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code ?? '') : ''
    if (code === '42P01') return { weights: { ...DEFAULT_KNOWLEDGE_RANKING_WEIGHTS }, version: 'baseline-v1', governedRelease: false }
    if (error instanceof KnowledgeError) return { weights: { ...DEFAULT_KNOWLEDGE_RANKING_WEIGHTS }, version: 'baseline-v1', governedRelease: false }
    throw error
  }
}

export async function retrieveKnowledge(user: User, question: string, options: KnowledgeRetrievalOptions = {}): Promise<KnowledgeRetrievalContext> {
  const { schoolId } = knowledgeContext(user)
  requirePostgres()
  const normalizedQuestion = normalizedSource(question)
  if (normalizedQuestion.length < 2 || normalizedQuestion.length > 500) throw new KnowledgeError('INVALID_REQUEST', '知识问题必须为 2-500 个字符')
  const started = Date.now()
  const traceId = randomUUID().replaceAll('-', '')
  const queryHash = hashKnowledgeText(normalizedQuestion)
  const access = accessFilter(user, 'd')
  const ranking = options.weights
    ? { weights: validateKnowledgeRankingWeights(options.weights), version: options.evaluation ? `evaluation-${options.evaluation.variant}` : 'explicit', governedRelease: false }
    : await getActiveKnowledgeRanking(schoolId)
  const queryIndex = access.params.length + 1
  const vectorIndex = queryIndex + 1
  const lexicalIndex = vectorIndex + 1
  const semanticIndex = lexicalIndex + 1
  const graphIndex = semanticIndex + 1
  const authorityIndex = graphIndex + 1
  const params = [...access.params, normalizedQuestion, createKnowledgeFeatureVector(normalizedQuestion), ranking.weights.lexical, ranking.weights.vector, ranking.weights.graph, ranking.weights.authority]
  const result = await getPostgresPool().query<{
    chunk_id: string; document_id: string; title: string; source_kind: string; current_version: number; section_path: string[]; content: string
    lexical_score: number | string; vector_score: number | string; graph_score: number | string; authority_score: number | string; fused_score: number | string
  }>(
    `WITH graph_hits AS (
       SELECT em.chunk_id, LEAST(1, count(*)::double precision / 3) AS graph_score
       FROM ai_knowledge_entity_mentions em
       JOIN ai_knowledge_entities e ON e.id=em.entity_id
       WHERE em.school_id=$1::uuid AND e.status='PUBLISHED'
         AND (position(lower(e.canonical_name) in lower($${queryIndex})) > 0 OR similarity(e.canonical_name,$${queryIndex}) >= 0.18)
       GROUP BY em.chunk_id
     ), candidates AS (
       SELECT c.id AS chunk_id,c.document_id,d.title,d.source_kind,d.current_version,c.section_path,c.content,
         LEAST(1, GREATEST(0, similarity(c.content,$${queryIndex})))::double precision AS lexical_score,
         LEAST(1, GREATEST(0, ai_cosine_similarity(c.feature_vector,$${vectorIndex}::real[])))::double precision AS vector_score,
         COALESCE(gh.graph_score,0)::double precision AS graph_score,
         CASE WHEN d.source_kind IN ('POLICY','RUNBOOK') THEN 0.95 ELSE 0.82 END::double precision AS authority_score
       FROM ai_knowledge_chunks c
       JOIN ai_knowledge_documents d ON d.id=c.document_id
       JOIN ai_knowledge_document_versions v ON v.id=c.version_id AND v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED'
       LEFT JOIN graph_hits gh ON gh.chunk_id=c.id
       WHERE ${access.sql} AND d.status='PUBLISHED'
     )
     SELECT *, LEAST(1, ($${lexicalIndex}::double precision*lexical_score + $${semanticIndex}::double precision*vector_score + $${graphIndex}::double precision*graph_score + $${authorityIndex}::double precision*authority_score))::double precision AS fused_score
     FROM candidates
     WHERE lexical_score >= 0.025 OR vector_score >= 0.10 OR graph_score > 0
     ORDER BY fused_score DESC LIMIT 8`,
    params,
  )
  const rows = result.rows.filter((row) => score(row.fused_score) >= 0.16)
  const routeMode = rows.some((row) => score(row.graph_score) > 0) ? 'HYBRID_GRAPH' : rows.length > 0 ? 'HYBRID' : 'REFUSED'
  const citations = rows.map((row, index) => ({
    label: `K${index + 1}`,
    documentId: row.document_id,
    documentTitle: row.title,
    version: Number(row.current_version),
    chunkId: row.chunk_id,
    section: Array.isArray(row.section_path) ? row.section_path.join(' / ') : '',
    excerpt: excerpt(row.content),
    score: score(row.fused_score),
    lexicalScore: score(row.lexical_score),
    vectorScore: score(row.vector_score),
    graphScore: score(row.graph_score),
    sourceKind: row.source_kind as import('./types').KnowledgeSourceKind,
  }))
  const latencyMs = Date.now() - started
  const retrieval = await getPostgresPool().query<{ id: string }>(
    `INSERT INTO ai_knowledge_retrievals(school_id,user_id,trace_id,query_hash,query_characters,route_mode,vector_backend,status,result_count,citation_count,top_score,latency_ms,metadata,completed_at)
     VALUES($1::uuid,$2,$3,$4,$5,$6::varchar,$7::varchar,$8::varchar,$9,$10,$11,$12,$13::jsonb,CASE WHEN $8::varchar='REFUSED' THEN now() ELSE NULL END) RETURNING id`,
    [schoolId, user.id, traceId, queryHash, normalizedQuestion.length, routeMode, VECTOR_BACKEND, routeMode === 'REFUSED' ? 'REFUSED' : 'RUNNING', citations.length, citations.length, citations[0]?.score ?? null, latencyMs, JSON.stringify({ resultLimit: 8, permissionFiltered: !canManageKnowledge(user), graphExpanded: routeMode === 'HYBRID_GRAPH', rankingVersion: ranking.version, governedRelease: ranking.governedRelease, evaluation: options.evaluation ?? null, rawQueryStored: false })],
  )
  const retrievalId = retrieval.rows[0].id
  for (const [index, citation] of citations.entries()) {
    await getPostgresPool().query(
      `INSERT INTO ai_knowledge_retrieval_items(retrieval_id,school_id,chunk_id,rank,citation_label,lexical_score,vector_score,graph_score,authority_score,fused_score)
       VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10)`,
      [retrievalId, schoolId, citation.chunkId, index + 1, citation.label, citation.lexicalScore, citation.vectorScore, citation.graphScore, score(rows[index].authority_score), citation.score],
    )
  }
  return { id: retrievalId, traceId, question: normalizedQuestion, routeMode, vectorBackend: VECTOR_BACKEND, results: citations, topScore: citations[0]?.score ?? 0, latencyMs, weights: ranking.weights, rankingVersion: ranking.version, governedRelease: ranking.governedRelease }
}

export async function finalizeKnowledgeRetrieval(input: { retrievalId: string; schoolId: string; status: 'ANSWERED' | 'REFUSED' | 'FAILED'; answer?: string; citationCount: number; modelInvocationId?: string; refusalCode?: string; latencyMs: number }): Promise<void> {
  await getPostgresPool().query(
    `UPDATE ai_knowledge_retrievals SET status=$3,citation_count=$4,model_invocation_id=$5::uuid,answer_hash=$6,refusal_code=$7,latency_ms=$8,completed_at=now()
     WHERE id=$1::uuid AND school_id=$2::uuid`,
    [input.retrievalId, input.schoolId, input.status, input.citationCount, input.modelInvocationId ?? null, input.answer ? hashKnowledgeText(input.answer) : null, input.refusalCode ?? null, input.latencyMs],
  )
}


export async function getKnowledgeVectorDiagnostics(user: User): Promise<KnowledgeVectorDiagnostics> {
  const { schoolId } = knowledgeContext(user)
  requirePostgres()
  const ranking = await getActiveKnowledgeRanking(schoolId)
  const access = accessFilter(user, 'd')
  const retrievalFilter = canManageKnowledge(user) ? 'r.school_id=$1::uuid' : 'r.school_id=$1::uuid AND r.user_id=$2'
  const retrievalParams = canManageKnowledge(user) ? [schoolId] : [schoolId, user.id]
  const [coverageResult, retrievalResult, recentResult] = await Promise.all([
    getPostgresPool().query<{
      documents: number; chunks: number; valid_vectors: number; min_dimensions: number; max_dimensions: number
    }>(
      `SELECT count(DISTINCT d.id)::int documents,count(c.id)::int chunks,
              count(c.id) FILTER (WHERE array_length(c.feature_vector,1)=$${access.params.length + 1})::int valid_vectors,
              COALESCE(min(array_length(c.feature_vector,1)),0)::int min_dimensions,
              COALESCE(max(array_length(c.feature_vector,1)),0)::int max_dimensions
         FROM ai_knowledge_documents d
         LEFT JOIN ai_knowledge_document_versions v ON v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED'
         LEFT JOIN ai_knowledge_chunks c ON c.document_id=d.id AND c.version_id=v.id
        WHERE ${access.sql} AND d.status='PUBLISHED'`,
      [...access.params, VECTOR_DIMENSIONS],
    ),
    getPostgresPool().query<{ total: number; answered: number; refused: number; average_latency: number; average_score: number }>(
      `SELECT count(*)::int total,count(*) FILTER (WHERE status='ANSWERED')::int answered,
              count(*) FILTER (WHERE status='REFUSED')::int refused,
              COALESCE(avg(latency_ms),0)::double precision average_latency,
              COALESCE(avg(top_score),0)::double precision average_score
         FROM ai_knowledge_retrievals r WHERE ${retrievalFilter}`,
      retrievalParams,
    ),
    getPostgresPool().query<{
      id: string; route_mode: string; status: string; result_count: number; top_score: number; latency_ms: number; created_at: string
    }>(
      `SELECT id,route_mode,status,result_count,COALESCE(top_score,0)::double precision top_score,latency_ms,created_at
         FROM ai_knowledge_retrievals r WHERE ${retrievalFilter} ORDER BY created_at DESC LIMIT 12`,
      retrievalParams,
    ),
  ])
  const coverage = coverageResult.rows[0] ?? { documents: 0, chunks: 0, valid_vectors: 0, min_dimensions: 0, max_dimensions: 0 }
  const retrievals = retrievalResult.rows[0] ?? { total: 0, answered: 0, refused: 0, average_latency: 0, average_score: 0 }
  return {
    backend: VECTOR_BACKEND,
    model: VECTOR_MODEL,
    dimensions: VECTOR_DIMENSIONS,
    ann: false,
    weights: ranking.weights,
    rankingVersion: ranking.version,
    governedRelease: ranking.governedRelease,
    coverage: {
      accessibleDocuments: Number(coverage.documents), indexedChunks: Number(coverage.chunks), validVectors: Number(coverage.valid_vectors),
      coverageRate: Number(coverage.chunks) > 0 ? Number(coverage.valid_vectors) / Number(coverage.chunks) : 0,
      minDimensions: Number(coverage.min_dimensions), maxDimensions: Number(coverage.max_dimensions),
    },
    retrievals: {
      total: Number(retrievals.total), answered: Number(retrievals.answered), refused: Number(retrievals.refused),
      averageLatencyMs: Math.round(Number(retrievals.average_latency)), averageTopScore: Number(retrievals.average_score),
    },
    recent: recentResult.rows.map((row) => ({
      id: row.id, routeMode: row.route_mode, status: row.status, resultCount: Number(row.result_count), topScore: Number(row.top_score),
      latencyMs: Number(row.latency_ms), createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    })),
  }
}

export async function inspectKnowledgeVectorSearch(user: User, question: string): Promise<KnowledgeVectorSearchResponse> {
  const { schoolId } = knowledgeContext(user)
  const retrieval = await retrieveKnowledge(user, question)
  const status = retrieval.results.length > 0 ? 'ANSWERED' as const : 'REFUSED' as const
  await finalizeKnowledgeRetrieval({
    retrievalId: retrieval.id, schoolId, status, citationCount: retrieval.results.length,
    refusalCode: status === 'REFUSED' ? 'VECTOR_DIAGNOSTIC_NO_MATCH' : undefined, latencyMs: retrieval.latencyMs,
  })
  await getPostgresPool().query(
    `INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata)
     VALUES($1::uuid,$2,'VECTOR_DIAGNOSTIC_COMPLETED','RETRIEVAL',$3,$4,$5::jsonb)`,
    [schoolId, user.id, retrieval.id, retrieval.traceId, JSON.stringify({ routeMode: retrieval.routeMode, resultCount: retrieval.results.length, backend: VECTOR_BACKEND, rawQueryStored: false })],
  )
  return {
    retrievalId: retrieval.id, traceId: retrieval.traceId, routeMode: retrieval.routeMode, backend: VECTOR_BACKEND,
    dimensions: VECTOR_DIMENSIONS, latencyMs: retrieval.latencyMs, topScore: retrieval.topScore, results: retrieval.results,
  }
}


export async function answerKnowledgeWithRag(user: User, question: string): Promise<KnowledgeSearchResponse> {
  const { schoolId } = knowledgeContext(user)
  const started = Date.now()
  const context = await retrieveKnowledge(user, question)
  const stages = [
    '\u610f\u56fe\u8bc6\u522b',
    '\u79df\u6237\u4e0e\u89d2\u8272\u88c1\u526a',
    '\u5168\u6587\u4e0e\u7279\u5f81\u5411\u91cf\u5e76\u884c\u53ec\u56de',
    context.routeMode === 'HYBRID_GRAPH' ? '\u5df2\u53d1\u5e03\u56fe\u8c31\u5173\u7cfb\u6269\u5c55' : '\u56fe\u8c31\u6269\u5c55\u5f85\u547d',
    '\u5f15\u7528\u7248\u672c\u6838\u9a8c',
  ]
  if (context.routeMode === 'REFUSED' || context.results.length === 0) {
    const answer = '\u5f53\u524d\u77e5\u85cf\u4e2d\u6ca1\u6709\u8fbe\u5230\u53ef\u4fe1\u9608\u503c\u7684\u6709\u6743\u4f9d\u636e\u3002\u767d\u6cfd\u4e0d\u4f1a\u7528\u6a21\u578b\u5e38\u8bc6\u66ff\u4ee3\u5b66\u6821\u5236\u5ea6\uff1b\u8bf7\u8865\u5145\u4e1a\u52a1\u8303\u56f4\uff0c\u6216\u8ba9\u77e5\u8bc6\u7ba1\u7406\u5458\u53d1\u5e03\u5bf9\u5e94\u89c4\u7a0b\u3002'
    const latencyMs = Date.now() - started
    await finalizeKnowledgeRetrieval({ retrievalId: context.id, schoolId, status: 'REFUSED', citationCount: 0, refusalCode: 'INSUFFICIENT_AUTHORIZED_EVIDENCE', latencyMs })
    return { status: 'REFUSED', answer, refusalCode: 'INSUFFICIENT_AUTHORIZED_EVIDENCE', confidence: 1, route: { mode: 'REFUSED', stages, vectorBackend: context.vectorBackend }, citations: [], retrieval: { id: context.id, traceId: context.traceId, resultCount: 0, citationCount: 0, latencyMs } }
  }
  try {
    const generated = await answerKnowledgeQuestion(user, {
      question: context.question,
      citations: context.results.map((citation) => ({ label: citation.label, documentTitle: citation.documentTitle, version: citation.version, section: citation.section, excerpt: citation.excerpt })),
    })
    if (generated.refused) {
      const latencyMs = Date.now() - started
      await finalizeKnowledgeRetrieval({ retrievalId: context.id, schoolId, status: 'REFUSED', citationCount: 0, modelInvocationId: generated.evidence.invocationId, refusalCode: 'MODEL_EVIDENCE_GAP', latencyMs })
      return { status: 'REFUSED', answer: generated.text, refusalCode: 'MODEL_EVIDENCE_GAP', confidence: 1, route: { mode: 'REFUSED', stages, vectorBackend: context.vectorBackend }, citations: [], retrieval: { id: context.id, traceId: context.traceId, resultCount: context.results.length, citationCount: 0, latencyMs, model: generated.evidence } }
    }
    const citations = context.results.filter((citation) => generated.citationLabels.includes(citation.label))
    if (citations.length === 0) throw new KnowledgeError('CONFLICT', '\u6a21\u578b\u7b54\u590d\u672a\u901a\u8fc7\u5f15\u7528\u6838\u9a8c')
    const confidence = Math.min(0.97, 0.64 + context.topScore * 0.24 + Math.min(3, citations.length) * 0.035 + (context.routeMode === 'HYBRID_GRAPH' ? 0.03 : 0))
    const latencyMs = Date.now() - started
    await finalizeKnowledgeRetrieval({ retrievalId: context.id, schoolId, status: 'ANSWERED', answer: generated.text, citationCount: citations.length, modelInvocationId: generated.evidence.invocationId, latencyMs })
    await getPostgresPool().query(
      `INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata)
       VALUES($1::uuid,$2,'RAG_ANSWER_VERIFIED','RETRIEVAL',$3,$4,$5::jsonb)`,
      [schoolId, user.id, context.id, context.traceId, JSON.stringify({ routeMode: context.routeMode, citationLabels: citations.map((citation) => citation.label), modelInvocationId: generated.evidence.invocationId, answerStored: false })],
    )
    return { status: 'ANSWERED', answer: generated.text, confidence, route: { mode: context.routeMode, stages, vectorBackend: context.vectorBackend }, citations, retrieval: { id: context.id, traceId: context.traceId, resultCount: context.results.length, citationCount: citations.length, latencyMs, model: generated.evidence } }
  } catch (error) {
    const citations = context.results.slice(0, 2)
    const first = citations[0]
    const answer = `\u767d\u6cfd\u5df2\u5b8c\u6210\u6743\u9650\u4e0e\u7248\u672c\u6838\u9a8c\uff0c\u5e76\u5b9a\u4f4d\u5230\u300a${first.documentTitle}\u300b\u4e2d\u7684\u76f4\u63a5\u4f9d\u636e\uff1a${first.excerpt} [${first.label}]`
    const latencyMs = Date.now() - started
    await finalizeKnowledgeRetrieval({ retrievalId: context.id, schoolId, status: 'ANSWERED', answer, citationCount: citations.length, latencyMs })
    await getPostgresPool().query(
      `INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata)
       VALUES($1::uuid,$2,'RAG_EXTRACTIVE_FALLBACK','RETRIEVAL',$3,$4,$5::jsonb)`,
      [schoolId, user.id, context.id, context.traceId, JSON.stringify({ routeMode: context.routeMode, citationLabels: citations.map((citation) => citation.label), reasonCode: error instanceof KnowledgeError ? error.code : 'MODEL_UNAVAILABLE', answerStored: false })],
    )
    return { status: 'ANSWERED', answer, confidence: Math.min(0.72, 0.52 + context.topScore), route: { mode: context.routeMode, stages, vectorBackend: context.vectorBackend }, citations, retrieval: { id: context.id, traceId: context.traceId, resultCount: context.results.length, citationCount: citations.length, latencyMs } }
  }
}

interface StoredEntity { id: string; canonical_name: string; entity_type: string }

function normalizedEntityName(value: string): string {
  return value.toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
}

export async function extractKnowledgeGraph(user: User, documentId: string): Promise<{ entities: number; relations: number; modelInvocationId: string }> {
  const { schoolId } = requireKnowledgeManager(user)
  const document = await getKnowledgeDocument(user, documentId)
  const chunksResult = await getPostgresPool().query<{ id: string; content: string; chunk_index: number }>(
    `SELECT c.id,c.content,c.chunk_index FROM ai_knowledge_chunks c JOIN ai_knowledge_documents d ON d.id=c.document_id
     WHERE c.school_id=$1::uuid AND c.document_id=$2::uuid AND d.status='PUBLISHED' AND c.version_id IN (SELECT id FROM ai_knowledge_document_versions WHERE document_id=d.id AND version_no=d.current_version)
     ORDER BY c.chunk_index LIMIT 24`,
    [schoolId, documentId],
  )
  if (chunksResult.rows.length === 0) throw new KnowledgeError('NOT_FOUND', '\u5f53\u524d\u6587\u6863\u6ca1\u6709\u5df2\u53d1\u5e03\u77e5\u8bc6\u5757')
  const chunks = chunksResult.rows.map((row) => ({ label: `C${row.chunk_index + 1}`, content: row.content }))
  const extracted = await extractKnowledgeGraphCandidates(user, { documentTitle: document.title, chunks })
  const byLabel = new Map(chunksResult.rows.map((row) => [`C${row.chunk_index + 1}`, row]))
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const entityMap = new Map<string, StoredEntity>()
    for (const entity of extracted.entities) {
      const normalized = normalizedEntityName(entity.name)
      const row = await client.query<StoredEntity>(
        `INSERT INTO ai_knowledge_entities(school_id,canonical_name,normalized_name,entity_type,status,confidence,extraction_method,created_by,metadata)
         VALUES($1::uuid,$2,$3,$4,'CANDIDATE',$5,'deepseek.graph_extract',$6,$7::jsonb)
         ON CONFLICT(school_id,entity_type,normalized_name) DO UPDATE SET confidence=GREATEST(ai_knowledge_entities.confidence,EXCLUDED.confidence),updated_at=now()
         RETURNING id,canonical_name,entity_type`,
        [schoolId, entity.name, normalized, entity.type ?? 'CONCEPT', entity.confidence, user.id, JSON.stringify({ sourceDocumentId: documentId, sourceChunkLabel: entity.sourceChunkLabel })],
      )
      const stored = row.rows[0]
      if (!stored) continue
      entityMap.set(`${entity.type ?? 'CONCEPT'}:${normalized}`, stored)
      const sourceChunk = byLabel.get(entity.sourceChunkLabel)
      if (sourceChunk) {
        await client.query(
          `INSERT INTO ai_knowledge_entity_mentions(school_id,chunk_id,entity_id,mention_text,confidence,extraction_method)
           VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,'deepseek.graph_extract') ON CONFLICT DO NOTHING`,
          [schoolId, sourceChunk.id, stored.id, entity.name, entity.confidence],
        )
      }
    }
    let relationCount = 0
    for (const relation of extracted.relations) {
      const subject = [...entityMap.values()].find((item) => item.canonical_name === relation.name)
      const object = [...entityMap.values()].find((item) => item.canonical_name === relation.objectName)
      const sourceChunk = byLabel.get(relation.sourceChunkLabel ?? '')
      if (!subject || !object || !sourceChunk || subject.id === object.id) continue
      const inserted = await client.query(
        `INSERT INTO ai_knowledge_relations(school_id,subject_entity_id,predicate,object_entity_id,source_chunk_id,evidence_quote,status,confidence,extraction_method,created_by,metadata)
         VALUES($1::uuid,$2::uuid,$3,$4::uuid,$5::uuid,$6,'CANDIDATE',$7,'deepseek.graph_extract',$8,$9::jsonb) ON CONFLICT DO NOTHING`,
        [schoolId, subject.id, relation.predicate, object.id, sourceChunk.id, relation.evidence, relation.confidence, user.id, JSON.stringify({ sourceDocumentId: documentId, sourceChunkLabel: relation.sourceChunkLabel })],
      )
      relationCount += inserted.rowCount ?? 0
    }
    await client.query(
      `INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata)
       VALUES($1::uuid,$2,'GRAPH_CANDIDATES_EXTRACTED','DOCUMENT',$3,$4,$5::jsonb)`,
      [schoolId, user.id, documentId, extracted.evidence.traceId, JSON.stringify({ entityCandidates: extracted.entities.length, relationCandidates: relationCount, modelInvocationId: extracted.evidence.invocationId })],
    )
    await client.query('COMMIT')
    return { entities: extracted.entities.length, relations: relationCount, modelInvocationId: extracted.evidence.invocationId }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally { client.release() }
}

export interface KnowledgeRelationCandidateView {
  id: string
  subject: string
  predicate: string
  object: string
  evidence: string
  confidence: number
  documentTitle: string
  status: string
}

export async function listKnowledgeRelationCandidates(user: User): Promise<KnowledgeRelationCandidateView[]> {
  const { schoolId } = requireKnowledgeManager(user)
  const result = await getPostgresPool().query<{ id: string; subject: string; predicate: string; object: string; evidence_quote: string; confidence: string | number; title: string; status: string }>(
    `SELECT r.id,s.canonical_name AS subject,r.predicate,o.canonical_name AS object,r.evidence_quote,r.confidence::numeric,d.title,r.status
       FROM ai_knowledge_relations r JOIN ai_knowledge_entities s ON s.id=r.subject_entity_id JOIN ai_knowledge_entities o ON o.id=r.object_entity_id
       JOIN ai_knowledge_chunks c ON c.id=r.source_chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id
      WHERE r.school_id=$1::uuid AND r.status='CANDIDATE' ORDER BY r.confidence DESC,r.created_at DESC LIMIT 100`,
    [schoolId],
  )
  return result.rows.map((row) => ({ id: row.id, subject: row.subject, predicate: row.predicate, object: row.object, evidence: row.evidence_quote, confidence: Number(row.confidence), documentTitle: row.title, status: row.status }))
}

export async function reviewKnowledgeRelation(user: User, relationId: string, decision: 'approve' | 'reject'): Promise<void> {
  const { schoolId } = requireKnowledgeManager(user)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const relation = await client.query<{ subject_entity_id: string; object_entity_id: string }>('SELECT subject_entity_id,object_entity_id FROM ai_knowledge_relations WHERE id=$1::uuid AND school_id=$2::uuid AND status=\'CANDIDATE\' FOR UPDATE', [relationId, schoolId])
    if (!relation.rows[0]) throw new KnowledgeError('NOT_FOUND', '\u56fe\u8c31\u5019\u9009\u5173\u7cfb\u4e0d\u5b58\u5728\u6216\u5df2\u5904\u7406')
    const status = decision === 'approve' ? 'PUBLISHED' : 'REJECTED'
    await client.query('UPDATE ai_knowledge_relations SET status=$3,reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id=$1::uuid AND school_id=$4::uuid', [relationId, user.id, status, schoolId])
    if (decision === 'approve') {
      await client.query('UPDATE ai_knowledge_entities SET status=\'PUBLISHED\',reviewed_by=$2,reviewed_at=now(),updated_at=now() WHERE id IN ($1::uuid,$3::uuid) AND school_id=$4::uuid', [relation.rows[0].subject_entity_id, user.id, relation.rows[0].object_entity_id, schoolId])
    }
    await client.query('INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata) VALUES($1::uuid,$2,$3,\'RELATION\',$4,$5,$6::jsonb)', [schoolId, user.id, decision === 'approve' ? 'GRAPH_RELATION_APPROVED' : 'GRAPH_RELATION_REJECTED', relationId, randomUUID().replaceAll('-', ''), JSON.stringify({ decision })])
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

export async function getKnowledgeGraph(user: User): Promise<KnowledgeGraphView> {
  const { schoolId } = knowledgeContext(user)
  requirePostgres()
  const filter = accessFilter(user)
  const result = await getPostgresPool().query<{ id: string; canonical_name: string; entity_type: string; confidence: string | number; degree: number }>(
    `SELECT e.id,e.canonical_name,e.entity_type,e.confidence::numeric,
            (SELECT count(*)::int FROM ai_knowledge_relations r JOIN ai_knowledge_chunks rc ON rc.id=r.source_chunk_id JOIN ai_knowledge_documents rd ON rd.id=rc.document_id WHERE r.status='PUBLISHED' AND rd.status='PUBLISHED' AND rc.version_id IN (SELECT rv.id FROM ai_knowledge_document_versions rv WHERE rv.document_id=rd.id AND rv.version_no=rd.current_version AND rv.status='PUBLISHED') AND (r.subject_entity_id=e.id OR r.object_entity_id=e.id)) AS degree
       FROM ai_knowledge_entities e
      WHERE e.school_id=$1::uuid AND e.status='PUBLISHED'
        AND EXISTS (SELECT 1 FROM ai_knowledge_entity_mentions em JOIN ai_knowledge_chunks c ON c.id=em.chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE em.entity_id=e.id AND d.status='PUBLISHED' AND c.version_id IN (SELECT v.id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED') AND ${filter.sql})
      ORDER BY degree DESC,e.canonical_name LIMIT 80`,
    filter.params,
  )
  const edges = await getPostgresPool().query<{ id: string; subject_entity_id: string; object_entity_id: string; predicate: string; confidence: string | number; evidence_quote: string; title: string }>(
    `SELECT r.id,r.subject_entity_id,r.object_entity_id,r.predicate,r.confidence::numeric,r.evidence_quote,d.title
       FROM ai_knowledge_relations r JOIN ai_knowledge_chunks c ON c.id=r.source_chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id
      WHERE r.school_id=$1::uuid AND r.status='PUBLISHED' AND d.status='PUBLISHED' AND c.version_id IN (SELECT v.id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED') AND ${filter.sql}
      ORDER BY r.confidence DESC LIMIT 120`,
    filter.params,
  )
  const candidates = canManageKnowledge(user)
    ? await getPostgresPool().query<{ count: number }>("SELECT count(*)::int AS count FROM ai_knowledge_relations r JOIN ai_knowledge_chunks c ON c.id=r.source_chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE r.school_id=$1::uuid AND r.status='CANDIDATE' AND d.status='PUBLISHED' AND c.version_id IN (SELECT v.id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED')", [schoolId])
    : await getPostgresPool().query<{ count: number }>(`SELECT count(*)::int AS count FROM ai_knowledge_relations r JOIN ai_knowledge_chunks c ON c.id=r.source_chunk_id JOIN ai_knowledge_documents d ON d.id=c.document_id WHERE r.status='CANDIDATE' AND d.status='PUBLISHED' AND c.version_id IN (SELECT v.id FROM ai_knowledge_document_versions v WHERE v.document_id=d.id AND v.version_no=d.current_version AND v.status='PUBLISHED') AND ${filter.sql}`, filter.params)
  return {
    nodes: result.rows.map((row) => ({ id: row.id, label: row.canonical_name, type: row.entity_type, confidence: Number(row.confidence), degree: Number(row.degree) })),
    edges: edges.rows.map((row) => ({ id: row.id, source: row.subject_entity_id, target: row.object_entity_id, label: row.predicate, confidence: Number(row.confidence), evidence: row.evidence_quote, documentTitle: row.title })),
    candidateRelations: Number(candidates.rows[0]?.count ?? 0),
  }
}

export async function exploreKnowledgeGraph(user: User, input: { focusId?: string; search?: string; depth?: number; fromId?: string; toId?: string } = {}): Promise<KnowledgeGraphExploreView> {
  const { schoolId } = knowledgeContext(user)
  const graph = await getKnowledgeGraph(user)
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]))
  const adjacency = new Map<string, Array<{ nodeId: string; edgeId: string }>>()
  graph.nodes.forEach((node) => adjacency.set(node.id, []))
  graph.edges.forEach((edge) => {
    adjacency.get(edge.source)?.push({ nodeId: edge.target, edgeId: edge.id })
    adjacency.get(edge.target)?.push({ nodeId: edge.source, edgeId: edge.id })
  })
  const search = normalizedSource(input.search ?? '').toLowerCase()
  const focusNode = (input.focusId ? nodesById.get(input.focusId) : undefined)
    ?? (search ? graph.nodes.find((node) => node.label.toLowerCase() === search) ?? graph.nodes.find((node) => node.label.toLowerCase().includes(search)) : undefined)
  const depth = Math.min(Math.max(Number(input.depth ?? 2), 1), 4)
  let visibleIds = new Set(graph.nodes.map((node) => node.id))
  if (focusNode) {
    visibleIds = new Set([focusNode.id])
    let frontier = [focusNode.id]
    for (let level = 0; level < depth; level += 1) {
      const next: string[] = []
      for (const id of frontier) for (const neighbor of adjacency.get(id) ?? []) if (!visibleIds.has(neighbor.nodeId)) { visibleIds.add(neighbor.nodeId); next.push(neighbor.nodeId) }
      frontier = next
    }
  }
  const scopedGraph: KnowledgeGraphView = {
    nodes: graph.nodes.filter((node) => visibleIds.has(node.id)),
    edges: graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    candidateRelations: graph.candidateRelations,
  }
  let path: KnowledgeGraphExploreView['path']
  if (input.fromId && input.toId) {
    const queue = [input.fromId]
    const previous = new Map<string, { nodeId: string; edgeId: string }>()
    const seen = new Set(queue)
    while (queue.length > 0 && !seen.has(input.toId)) {
      const current = queue.shift()!
      for (const neighbor of adjacency.get(current) ?? []) {
        if (seen.has(neighbor.nodeId)) continue
        seen.add(neighbor.nodeId); previous.set(neighbor.nodeId, { nodeId: current, edgeId: neighbor.edgeId }); queue.push(neighbor.nodeId)
      }
    }
    if (seen.has(input.toId) && nodesById.has(input.fromId) && nodesById.has(input.toId)) {
      const nodeIds = [input.toId]; const edgeIds: string[] = []
      let cursor = input.toId
      while (cursor !== input.fromId) { const item = previous.get(cursor); if (!item) break; edgeIds.unshift(item.edgeId); cursor = item.nodeId; nodeIds.unshift(cursor) }
      path = { found: nodeIds[0] === input.fromId, nodes: nodeIds, edges: edgeIds, labels: nodeIds.map((id) => nodesById.get(id)?.label ?? id) }
    } else path = { found: false, nodes: [], edges: [], labels: [] }
  }
  const typeCounts = new Map<string, number>()
  graph.nodes.forEach((node) => typeCounts.set(node.type, (typeCounts.get(node.type) ?? 0) + 1))
  const evidenceCoverage = graph.edges.length > 0 ? graph.edges.filter((edge) => edge.evidence.trim().length > 0 && edge.documentTitle.trim().length > 0).length / graph.edges.length : 0
  await getPostgresPool().query(
    `INSERT INTO ai_knowledge_audit_events(school_id,actor_user_id,action,target_type,target_id,trace_id,metadata)
     VALUES($1::uuid,$2,'GRAPH_EXPLORED','KNOWLEDGE_BASE',$3,$4,$5::jsonb)`,
    [schoolId, user.id, focusNode?.id ?? 'tenant-knowledge-graph', randomUUID().replaceAll('-', ''), JSON.stringify({ focusId: focusNode?.id, depth, searchHash: search ? hashKnowledgeText(search) : undefined, pathRequested: Boolean(input.fromId && input.toId), rawSearchStored: false })],
  )
  return {
    graph: scopedGraph,
    focus: focusNode ? { id: focusNode.id, label: focusNode.label, type: focusNode.type, degree: focusNode.degree } : undefined,
    metrics: {
      entities: graph.nodes.length, relations: graph.edges.length, sourceDocuments: new Set(graph.edges.map((edge) => edge.documentTitle)).size, evidenceCoverage,
      topHubs: [...graph.nodes].sort((left, right) => right.degree - left.degree).slice(0, 8).map((node) => ({ id: node.id, label: node.label, degree: node.degree })),
      typeDistribution: [...typeCounts.entries()].sort((left, right) => right[1] - left[1]).map(([type, count]) => ({ type, count })),
    },
    path,
  }
}

