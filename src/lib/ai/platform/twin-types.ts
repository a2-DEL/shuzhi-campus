export interface TwinMetrics {
  repairs: { open: number; overdue: number; urgent: number; averageResolutionHours: number }
  spaces: { classrooms: number; available: number; maintenance: number; upcomingBookings: number }
  energy: { assets: number; loadKw: number; validReadings: number; suspectReadings: number }
  visitors: { pending: number; approved: number; onCampus: number }
  safety: { open: number; critical: number }
  communications: { deliveries: number; acknowledged: number; failed: number; acknowledgementRate: number }
  resources: { lowStock: number; outOfStock: number }
  agents: { active: number; failed: number; completed24h: number }
  campusRiskScore: number
}

export interface TwinTopologyNode {
  id: string
  name: string
  type: string
  status: string
  repairCount: number
  classroomCount: number
  energyAssetCount: number
  safetyCount: number
}

export interface TwinSnapshotView {
  id: string
  modelId: string
  observedAt: string
  sourceWatermark: string
  metrics: TwinMetrics
  topology: TwinTopologyNode[]
  dataQualityScore: number
  evidenceHash: string
  sourceCounts: Record<string, number>
}

export interface TwinInterventions {
  repairCapacityDelta: number
  energyReductionPct: number
  notificationEscalation: boolean
  visitorDeskDelta: number
  eventAttendees: number
}

export interface TwinRecommendationView {
  id: string
  type: string
  title: string
  summary: string
  expectedImpact: Record<string, number | string>
  status: 'PROPOSED' | 'DISPATCHED' | 'ACCEPTED' | 'DISMISSED'
  taskId?: string
}

export interface TwinSimulationView {
  id: string
  scenarioId: string
  scenarioName: string
  hypothesis: string
  interventions: TwinInterventions
  status: 'RUNNING' | 'COMPLETED' | 'FAILED'
  engineVersion: string
  baseline: TwinMetrics
  projected: TwinMetrics
  deltas: Record<string, number>
  assumptions: string[]
  confidence: number
  evidenceHash?: string
  recommendations: TwinRecommendationView[]
  startedAt: string
  completedAt?: string
}

export interface TwinOverview {
  persistent: true
  model: { id: string; name: string; description: string; version: string; status: string }
  snapshot?: TwinSnapshotView
  latestSimulation?: TwinSimulationView
  recentSimulations: TwinSimulationView[]
  metrics: { snapshots: number; scenarios: number; simulations: number; dispatchedRecommendations: number }
  engine: { version: string; deterministic: true; writesBusinessData: false; note: string }
}
