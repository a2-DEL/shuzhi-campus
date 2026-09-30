export type MultimodalModality = 'IMAGE' | 'AUDIO' | 'DOCUMENT' | 'VIDEO'

export interface MultimodalObservationView {
  id: string
  type: string
  label: string
  summary: string
  confidence: number
  extractionMode: string
  evidenceHash: string
  status: 'CANDIDATE' | 'VERIFIED' | 'REJECTED'
  reviewedAt?: string
}

export interface MultimodalAssetView {
  id: string
  originalName: string
  modality: MultimodalModality
  contentType: string
  byteSize: number
  sha256: string
  sensitivity: string
  consentBasis: string
  status: 'UPLOADED' | 'INSPECTED' | 'VERIFIED' | 'REJECTED'
  technicalMetadata: Record<string, number | string | boolean>
  createdByName: string
  createdAt: string
  observations: MultimodalObservationView[]
}

export interface MultimodalOverview {
  persistent: true
  storage: { backend: 'local_private_object_store'; encryptedTransportRequired: true; rawBytesInDatabase: false; maximumBytes: number }
  metrics: { assets: number; images: number; audio: number; documents: number; videos: number; pendingReview: number; verified: number; totalBytes: number }
  assets: MultimodalAssetView[]
  guardrails: string[]
}

export interface FederationContributionView {
  id: string
  nodeId: string
  nodeName: string
  nodeKind: 'LOCAL' | 'SANDBOX' | 'REMOTE'
  status: 'ACCEPTED' | 'REJECTED' | 'BELOW_THRESHOLD' | 'FAILED'
  recordCount: number
  protectedRecordCount?: number
  signatureVerified: boolean
  epsilonSpent: number
  latencyMs: number
  errorCode?: string
  metrics: Array<{ metric: string; average: number; minimum: number; maximum: number; samples: number }>
}

export interface FederationNodeView {
  id: string
  slug: string
  name: string
  nodeKind: 'LOCAL' | 'SANDBOX' | 'REMOTE'
  transport: string
  status: string
  capabilities: string[]
  fingerprint: string
  lastHeartbeatAt?: string
  privacy: { minimumGroupSize: number; maxEpsilon30Days: number; epsilonSpent30Days: number }
}

export interface FederationJobView {
  id: string
  name: string
  jobType: string
  requestedModalities: string[]
  minimumGroupSize: number
  epsilonBudget: number
  status: string
  aggregate: { participatingNodes: number; protectedRecords: number; metrics: Array<{ metric: string; average: number; nodes: number }>; modalityCounts: Record<string, number> }
  resultHash?: string
  contributions: FederationContributionView[]
  createdAt: string
  completedAt?: string
}

export interface FederationOverview {
  persistent: true
  metrics: { activeNodes: number; sandboxNodes: number; remoteProductionNodes: number; completedJobs: number; verifiedContributions: number; epsilonSpent30Days: number }
  nodes: FederationNodeView[]
  jobs: FederationJobView[]
  protocol: { signing: 'Ed25519'; rawRecordsTransferred: false; minimumAggregation: number; privacyLedger: true; note: string }
}
