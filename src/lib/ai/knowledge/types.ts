import type { User } from '@/types'

export type KnowledgeSourceKind = 'TEXT' | 'MARKDOWN' | 'POLICY' | 'RUNBOOK' | 'FAQ' | 'BUSINESS_EVENT'
export type KnowledgeVisibility = 'TENANT' | 'ROLE' | 'ORGANIZATION' | 'PRIVATE'
export type KnowledgeSensitivity = 'PUBLIC' | 'INTERNAL' | 'RESTRICTED' | 'CONFIDENTIAL'
export type KnowledgeDocumentStatus = 'DRAFT' | 'PROCESSING' | 'PUBLISHED' | 'ARCHIVED' | 'FAILED'
export type KnowledgeGrantType = 'ROLE' | 'ORGANIZATION' | 'USER'

export interface KnowledgeRankingWeights {
  lexical: number
  vector: number
  graph: number
  authority: number
}

export interface KnowledgeGrantInput {
  principalType: KnowledgeGrantType
  principalId: string
}

export interface KnowledgeIngestInput {
  title: string
  description?: string
  content: string
  sourceKind?: KnowledgeSourceKind
  sourceUri?: string
  externalKey?: string
  visibility?: KnowledgeVisibility
  sensitivity?: KnowledgeSensitivity
  ownerOrganizationId?: string
  grants?: KnowledgeGrantInput[]
  metadata?: Record<string, unknown>
}

export interface KnowledgeChunkDraft {
  index: number
  content: string
  sectionPath: string[]
  charStart: number
  charEnd: number
}

export interface KnowledgeDocumentView {
  id: string
  knowledgeBaseId: string
  title: string
  description: string
  sourceKind: KnowledgeSourceKind
  sourceUri?: string
  visibility: KnowledgeVisibility
  sensitivity: KnowledgeSensitivity
  status: KnowledgeDocumentStatus
  currentVersion: number
  chunkCount: number
  entityCount: number
  relationCount: number
  latestVersionAt?: string
  updatedAt: string
  createdByName?: string
}

export interface KnowledgeOverview {
  persistence: 'postgres' | 'development_memory'
  base: { id: string; slug: string; name: string; description: string; status: string }
  metrics: {
    documents: number
    publishedDocuments: number
    chunks: number
    publishedEntities: number
    publishedRelations: number
    candidateRelations: number
    retrievalsToday: number
    answeredToday: number
    citationRateToday: number
  }
  vector: { backend: string; dimensions: number; ann: boolean; note: string }
  recentJobs: Array<{ id: string; documentId: string; title: string; status: string; stage: string; chunksCreated: number; relationCandidates: number; createdAt: string }>
}

export interface KnowledgeCitation {
  label: string
  documentId: string
  documentTitle: string
  version: number
  chunkId: string
  section: string
  excerpt: string
  score: number
  lexicalScore: number
  vectorScore: number
  graphScore: number
  sourceKind: KnowledgeSourceKind
}

export interface KnowledgeSearchResponse {
  status: 'ANSWERED' | 'REFUSED'
  answer: string
  refusalCode?: string
  confidence: number
  route: { mode: 'HYBRID' | 'HYBRID_GRAPH' | 'REFUSED'; stages: string[]; vectorBackend: string }
  citations: KnowledgeCitation[]
  retrieval: { id: string; traceId: string; resultCount: number; citationCount: number; latencyMs: number; model?: { provider: 'deepseek'; invocationId: string; traceId: string; purpose: 'knowledge.answer'; model: string; latencyMs: number; totalTokens: number } }
}

export interface KnowledgeGraphView {
  nodes: Array<{ id: string; label: string; type: string; confidence: number; degree: number }>
  edges: Array<{ id: string; source: string; target: string; label: string; confidence: number; evidence: string; documentTitle: string }>
  candidateRelations: number
}

export interface KnowledgeVectorDiagnostics {
  backend: string
  model: string
  dimensions: number
  ann: boolean
  weights: KnowledgeRankingWeights
  rankingVersion: string
  governedRelease: boolean
  coverage: { accessibleDocuments: number; indexedChunks: number; validVectors: number; coverageRate: number; minDimensions: number; maxDimensions: number }
  retrievals: { total: number; answered: number; refused: number; averageLatencyMs: number; averageTopScore: number }
  recent: Array<{ id: string; routeMode: string; status: string; resultCount: number; topScore: number; latencyMs: number; createdAt: string }>
}

export interface KnowledgeVectorSearchResponse {
  retrievalId: string
  traceId: string
  routeMode: 'HYBRID' | 'HYBRID_GRAPH' | 'REFUSED'
  backend: string
  dimensions: number
  latencyMs: number
  topScore: number
  results: KnowledgeCitation[]
}

export interface KnowledgeGraphExploreView {
  graph: KnowledgeGraphView
  focus?: { id: string; label: string; type: string; degree: number }
  metrics: { entities: number; relations: number; sourceDocuments: number; evidenceCoverage: number; topHubs: Array<{ id: string; label: string; degree: number }>; typeDistribution: Array<{ type: string; count: number }> }
  path?: { found: boolean; nodes: string[]; edges: string[]; labels: string[] }
}

export interface KnowledgeUserContext {
  user: User
  schoolId: string
}
