export type WorkflowNodeKind = 'trigger' | 'knowledge' | 'agent' | 'skill' | 'approval' | 'aggregate'

export interface WorkflowNodeDefinition {
  id: string
  kind: WorkflowNodeKind
  label: string
  description?: string
  skillId?: string
  agentLabel?: string
  params?: Record<string, unknown>
  position: { x: number; y: number }
}

export interface WorkflowEdgeDefinition {
  id: string
  source: string
  target: string
  label?: string
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeDefinition[]
  edges: WorkflowEdgeDefinition[]
}

export interface WorkflowView {
  id: string
  slug: string
  name: string
  description: string
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
  triggerKind: 'MANUAL' | 'SCHEDULED' | 'EVENT'
  currentVersion: number
  visibilityRoles: string[]
  tags: string[]
  ownerUserId?: string
  lastRunAt?: string
  createdAt: string
  updatedAt: string
  version?: {
    id: string
    versionNo: number
    status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED'
    definition: WorkflowDefinition
    checksum: string
    publishedAt?: string
  }
}

export interface WorkflowRunEventView {
  id: string
  seq: number
  eventType: string
  nodeId?: string
  agentId?: string
  title: string
  message: string
  createdAt: string
}

export interface WorkflowRunView {
  id: string
  workflowId: string
  workflowName: string
  versionNo: number
  taskId?: string
  status: 'QUEUED' | 'RUNNING' | 'AWAITING_APPROVAL' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  outputSummary: Record<string, unknown>
  startedAt?: string
  completedAt?: string
  createdAt: string
  events: WorkflowRunEventView[]
}

export interface WorkflowOverview {
  manager: boolean
  metrics: {
    workflows: number
    published: number
    runs: number
    awaitingApproval: number
    completed: number
  }
  workflows: WorkflowView[]
  recentRuns: WorkflowRunView[]
}
