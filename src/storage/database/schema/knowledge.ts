import { sql } from 'drizzle-orm'
import {
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { identityUsers, organizations, schools } from './identity'

const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

export const aiKnowledgeBases = pgTable('ai_knowledge_bases', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  slug: varchar('slug', { length: 120 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  description: text('description').notNull().default(''),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  defaultSensitivity: varchar('default_sensitivity', { length: 20 }).notNull().default('INTERNAL'),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_knowledge_bases_school_slug_unique').on(table.schoolId, table.slug),
  check('ai_knowledge_bases_status_check', sql`${table.status} IN ('ACTIVE','PAUSED','ARCHIVED')`),
])

export const aiKnowledgeDocuments = pgTable('ai_knowledge_documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  knowledgeBaseId: uuid('knowledge_base_id').notNull().references(() => aiKnowledgeBases.id, { onDelete: 'restrict' }),
  externalKey: varchar('external_key', { length: 180 }),
  title: varchar('title', { length: 300 }).notNull(),
  description: text('description').notNull().default(''),
  sourceKind: varchar('source_kind', { length: 32 }).notNull(),
  sourceUri: text('source_uri'),
  visibility: varchar('visibility', { length: 24 }).notNull().default('TENANT'),
  sensitivity: varchar('sensitivity', { length: 20 }).notNull().default('INTERNAL'),
  ownerOrganizationId: uuid('owner_organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  currentVersion: integer('current_version').notNull().default(0),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  updatedBy: varchar('updated_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  index('ai_knowledge_documents_school_status_idx').on(table.schoolId, table.status, table.updatedAt),
  check('ai_knowledge_documents_current_version_check', sql`${table.currentVersion} >= 0`),
])

export const aiKnowledgeDocumentGrants = pgTable('ai_knowledge_document_grants', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  documentId: uuid('document_id').notNull().references(() => aiKnowledgeDocuments.id, { onDelete: 'cascade' }),
  principalType: varchar('principal_type', { length: 20 }).notNull(),
  principalId: varchar('principal_id', { length: 80 }).notNull(),
  grantedBy: varchar('granted_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_knowledge_document_grants_unique').on(table.documentId, table.principalType, table.principalId),
  index('ai_knowledge_document_grants_lookup_idx').on(table.schoolId, table.principalType, table.principalId, table.documentId),
])

export const aiKnowledgeDocumentVersions = pgTable('ai_knowledge_document_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  documentId: uuid('document_id').notNull().references(() => aiKnowledgeDocuments.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  sourceText: text('source_text').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  language: varchar('language', { length: 16 }).notNull().default('zh-CN'),
  parserKind: varchar('parser_kind', { length: 40 }).notNull().default('plain-text'),
  parserVersion: varchar('parser_version', { length: 40 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PROCESSING'),
  charCount: integer('char_count').notNull(),
  chunkCount: integer('chunk_count').notNull().default(0),
  lineage: jsonb('lineage').notNull().default({}),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  publishedBy: varchar('published_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  createdAt: time('created_at').notNull().defaultNow(),
  publishedAt: time('published_at'),
}, (table) => [
  unique('ai_knowledge_document_versions_number_unique').on(table.documentId, table.versionNo),
  unique('ai_knowledge_document_versions_hash_unique').on(table.documentId, table.contentHash),
  index('ai_knowledge_versions_school_status_idx').on(table.schoolId, table.status, table.createdAt),
  check('ai_knowledge_document_versions_counts_check', sql`${table.versionNo} > 0 AND ${table.charCount} >= 0 AND ${table.chunkCount} >= 0`),
])

export const aiKnowledgeChunks = pgTable('ai_knowledge_chunks', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  documentId: uuid('document_id').notNull().references(() => aiKnowledgeDocuments.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').notNull().references(() => aiKnowledgeDocumentVersions.id, { onDelete: 'cascade' }),
  chunkIndex: integer('chunk_index').notNull(),
  sectionPath: text('section_path').array().notNull().default(sql`ARRAY[]::text[]`),
  pageStart: integer('page_start'),
  pageEnd: integer('page_end'),
  charStart: integer('char_start').notNull(),
  charEnd: integer('char_end').notNull(),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  searchVector: tsvector('search_vector').notNull(),
  featureVector: real('feature_vector').array().notNull(),
  vectorDimensions: integer('vector_dimensions').notNull(),
  embeddingBackend: varchar('embedding_backend', { length: 80 }).notNull(),
  embeddingModel: varchar('embedding_model', { length: 120 }).notNull(),
  tokenEstimate: integer('token_estimate').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_knowledge_chunks_version_index_unique').on(table.versionId, table.chunkIndex),
  unique('ai_knowledge_chunks_version_hash_unique').on(table.versionId, table.contentHash),
  index('ai_knowledge_chunks_school_document_idx').on(table.schoolId, table.documentId, table.chunkIndex),
  check('ai_knowledge_chunks_offsets_check', sql`${table.chunkIndex} >= 0 AND ${table.charStart} >= 0 AND ${table.charEnd} >= ${table.charStart}`),
  check('ai_knowledge_chunks_vector_check', sql`${table.vectorDimensions} > 0 AND ${table.vectorDimensions} = cardinality(${table.featureVector})`),
])

export const aiKnowledgeIngestionJobs = pgTable('ai_knowledge_ingestion_jobs', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  documentId: uuid('document_id').notNull().references(() => aiKnowledgeDocuments.id, { onDelete: 'cascade' }),
  versionId: uuid('version_id').references(() => aiKnowledgeDocumentVersions.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 24 }).notNull(),
  stage: varchar('stage', { length: 40 }).notNull(),
  sourceHash: varchar('source_hash', { length: 64 }).notNull(),
  chunksCreated: integer('chunks_created').notNull().default(0),
  entityCandidates: integer('entity_candidates').notNull().default(0),
  relationCandidates: integer('relation_candidates').notNull().default(0),
  errorCode: varchar('error_code', { length: 100 }),
  errorMessage: text('error_message'),
  startedAt: time('started_at').notNull().defaultNow(),
  completedAt: time('completed_at'),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').notNull().default({}),
}, (table) => [index('ai_knowledge_ingestion_jobs_school_idx').on(table.schoolId, table.startedAt)])

export const aiKnowledgeEntities = pgTable('ai_knowledge_entities', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  canonicalName: varchar('canonical_name', { length: 240 }).notNull(),
  normalizedName: varchar('normalized_name', { length: 240 }).notNull(),
  entityType: varchar('entity_type', { length: 60 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('CANDIDATE'),
  confidence: numeric('confidence', { precision: 6, scale: 5 }).notNull().default('0'),
  extractionMethod: varchar('extraction_method', { length: 60 }).notNull(),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  reviewedBy: varchar('reviewed_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  reviewedAt: time('reviewed_at'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_knowledge_entities_school_type_name_unique').on(table.schoolId, table.entityType, table.normalizedName),
  index('ai_knowledge_entities_school_status_idx').on(table.schoolId, table.status, table.entityType),
])

export const aiKnowledgeEntityMentions = pgTable('ai_knowledge_entity_mentions', {
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  chunkId: uuid('chunk_id').notNull().references(() => aiKnowledgeChunks.id, { onDelete: 'cascade' }),
  entityId: uuid('entity_id').notNull().references(() => aiKnowledgeEntities.id, { onDelete: 'cascade' }),
  mentionText: varchar('mention_text', { length: 240 }).notNull(),
  confidence: numeric('confidence', { precision: 6, scale: 5 }).notNull(),
  extractionMethod: varchar('extraction_method', { length: 60 }).notNull(),
  startOffset: integer('start_offset'),
  endOffset: integer('end_offset'),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.chunkId, table.entityId, table.mentionText] }),
  index('ai_knowledge_mentions_entity_idx').on(table.schoolId, table.entityId, table.chunkId),
])

export const aiKnowledgeRelations = pgTable('ai_knowledge_relations', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  subjectEntityId: uuid('subject_entity_id').notNull().references(() => aiKnowledgeEntities.id, { onDelete: 'restrict' }),
  predicate: varchar('predicate', { length: 100 }).notNull(),
  objectEntityId: uuid('object_entity_id').notNull().references(() => aiKnowledgeEntities.id, { onDelete: 'restrict' }),
  sourceChunkId: uuid('source_chunk_id').notNull().references(() => aiKnowledgeChunks.id, { onDelete: 'cascade' }),
  evidenceQuote: text('evidence_quote').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('CANDIDATE'),
  confidence: numeric('confidence', { precision: 6, scale: 5 }).notNull(),
  extractionMethod: varchar('extraction_method', { length: 60 }).notNull(),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  reviewedBy: varchar('reviewed_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  reviewedAt: time('reviewed_at'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_knowledge_relations_evidence_unique').on(table.subjectEntityId, table.predicate, table.objectEntityId, table.sourceChunkId),
  index('ai_knowledge_relations_subject_idx').on(table.schoolId, table.status, table.subjectEntityId),
  index('ai_knowledge_relations_object_idx').on(table.schoolId, table.status, table.objectEntityId),
  check('ai_knowledge_relations_distinct_entities_check', sql`${table.subjectEntityId} <> ${table.objectEntityId}`),
])

export const aiKnowledgeRetrievals = pgTable('ai_knowledge_retrievals', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  userId: varchar('user_id', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  queryHash: varchar('query_hash', { length: 64 }).notNull(),
  queryCharacters: integer('query_characters').notNull(),
  routeMode: varchar('route_mode', { length: 32 }).notNull(),
  vectorBackend: varchar('vector_backend', { length: 80 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  resultCount: integer('result_count').notNull().default(0),
  citationCount: integer('citation_count').notNull().default(0),
  topScore: numeric('top_score', { precision: 8, scale: 7 }),
  modelInvocationId: uuid('model_invocation_id'),
  answerHash: varchar('answer_hash', { length: 64 }),
  refusalCode: varchar('refusal_code', { length: 100 }),
  latencyMs: integer('latency_ms'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  completedAt: time('completed_at'),
}, (table) => [
  unique('ai_knowledge_retrievals_school_trace_unique').on(table.schoolId, table.traceId),
  index('ai_knowledge_retrievals_school_created_idx').on(table.schoolId, table.createdAt),
  index('ai_knowledge_retrievals_user_created_idx').on(table.schoolId, table.userId, table.createdAt),
])

export const aiKnowledgeRetrievalItems = pgTable('ai_knowledge_retrieval_items', {
  retrievalId: uuid('retrieval_id').notNull().references(() => aiKnowledgeRetrievals.id, { onDelete: 'cascade' }),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  chunkId: uuid('chunk_id').notNull().references(() => aiKnowledgeChunks.id, { onDelete: 'restrict' }),
  rank: integer('rank').notNull(),
  citationLabel: varchar('citation_label', { length: 20 }).notNull(),
  lexicalScore: numeric('lexical_score', { precision: 8, scale: 7 }).notNull(),
  vectorScore: numeric('vector_score', { precision: 8, scale: 7 }).notNull(),
  graphScore: numeric('graph_score', { precision: 8, scale: 7 }).notNull(),
  authorityScore: numeric('authority_score', { precision: 8, scale: 7 }).notNull(),
  fusedScore: numeric('fused_score', { precision: 8, scale: 7 }).notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.retrievalId, table.rank] }),
  unique('ai_knowledge_retrieval_items_chunk_unique').on(table.retrievalId, table.chunkId),
  unique('ai_knowledge_retrieval_items_label_unique').on(table.retrievalId, table.citationLabel),
])

export const aiKnowledgeAuditEvents = pgTable('ai_knowledge_audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  actorUserId: varchar('actor_user_id', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 80 }).notNull(),
  targetType: varchar('target_type', { length: 60 }).notNull(),
  targetId: varchar('target_id', { length: 100 }).notNull(),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_knowledge_audit_school_created_idx').on(table.schoolId, table.createdAt)])

export const AI_KNOWLEDGE_TABLES = [
  'ai_knowledge_bases',
  'ai_knowledge_documents',
  'ai_knowledge_document_grants',
  'ai_knowledge_document_versions',
  'ai_knowledge_chunks',
  'ai_knowledge_ingestion_jobs',
  'ai_knowledge_entities',
  'ai_knowledge_entity_mentions',
  'ai_knowledge_relations',
  'ai_knowledge_retrievals',
  'ai_knowledge_retrieval_items',
  'ai_knowledge_audit_events',
] as const
