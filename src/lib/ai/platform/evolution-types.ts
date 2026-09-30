export type EvolutionSignalSeverity = 'low' | 'medium' | 'high' | 'critical'
export type EvolutionSignalStatus = 'OPEN' | 'LINKED' | 'RESOLVED' | 'DISMISSED'
export type EvolutionExperimentStatus = 'DRAFT' | 'EVALUATING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'REJECTED' | 'ROLLED_BACK'
export type EvolutionEvalStatus = 'RUNNING' | 'PASSED' | 'FAILED' | 'BLOCKED'

export interface EvolutionRankingWeights {
  lexical: number
  vector: number
  graph: number
  authority: number
}

export interface EvolutionSignalView {
  id: string
  sourceType: string
  signalType: string
  severity: EvolutionSignalSeverity
  status: EvolutionSignalStatus
  summary: string
  evidenceHash: string
  createdAt: string
  updatedAt: string
}

export interface EvolutionDatasetView {
  id: string
  slug: string
  name: string
  description: string
  targetType: string
  version: number
  status: string
  caseCount: number
  highRiskCases: number
  updatedAt: string
}

export interface EvolutionEvalRunView {
  id: string
  status: EvolutionEvalStatus
  caseCount: number
  passedCases: number
  baselineScore?: number
  candidateScore?: number
  safetyScore?: number
  latencyDeltaMs?: number
  evidenceHash?: string
  startedAt: string
  completedAt?: string
}

export interface EvolutionReleaseView {
  id: string
  experimentId: string
  targetId: string
  version: string
  status: 'ACTIVE' | 'ROLLED_BACK'
  releaseNotes: string
  weights: EvolutionRankingWeights
  activatedByName: string
  activatedAt: string
  rolledBackAt?: string
}

export interface EvolutionExperimentView {
  id: string
  signalId?: string
  datasetId: string
  datasetName: string
  targetType: string
  targetId: string
  baselineVersion: string
  candidateVersion: string
  hypothesis: string
  changeSummary: string
  baselineWeights: EvolutionRankingWeights
  candidateWeights: EvolutionRankingWeights
  status: EvolutionExperimentStatus
  createdByName: string
  reviewedByName?: string
  createdAt: string
  updatedAt: string
  latestRun?: EvolutionEvalRunView
  release?: EvolutionReleaseView
}

export interface EvolutionOverview {
  persistent: true
  operator: true
  target: { id: string; name: string; defaultVersion: string }
  metrics: {
    openSignals: number
    benchmarkDatasets: number
    benchmarkCases: number
    experiments: number
    readyForReview: number
    activeReleases: number
    evaluationPassRate: number
  }
  production: {
    version: string
    governedRelease: boolean
    weights: EvolutionRankingWeights
    activatedAt?: string
  }
  guardrails: string[]
  signals: EvolutionSignalView[]
  datasets: EvolutionDatasetView[]
  experiments: EvolutionExperimentView[]
  releases: EvolutionReleaseView[]
}
