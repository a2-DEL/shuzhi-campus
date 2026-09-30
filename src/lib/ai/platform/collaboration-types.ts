export interface CollaborationRoomSummary {
  id: string
  taskId: string
  title: string
  objective: string
  status: 'ACTIVE' | 'AWAITING_DECISION' | 'COMPLETED' | 'BLOCKED' | 'ARCHIVED'
  ownerName: string
  taskState: string
  nodeCount: number
  messageCount: number
  acceptedDeliverables: number
  totalDeliverables: number
  updatedAt: string
}
export interface CollaborationTimelineItem {
  id: string
  source: 'agent' | 'human'
  senderId: string
  senderName: string
  avatar: string
  type: string
  content: string
  nodeId?: string
  createdAt: string
}
export interface CollaborationMember {
  id: string
  name: string
  avatar: string
  role: string
  state: string
  currentWork?: string
}
export interface CollaborationDeliverable {
  id: string
  nodeId: string
  title: string
  ownerAgentId: string
  ownerAgentName: string
  status: 'PENDING' | 'IN_PROGRESS' | 'READY_FOR_REVIEW' | 'ACCEPTED' | 'BLOCKED' | 'FAILED'
  summary: string
  evidenceCount: number
  acceptedAt?: string
}
export interface CollaborationRoomDetail extends CollaborationRoomSummary {
  command: string
  riskLevel: string
  approval: { status: string; policy: string; requiredCount: number; approvedCount: number }
  summary?: string
  members: CollaborationMember[]
  timeline: CollaborationTimelineItem[]
  deliverables: CollaborationDeliverable[]
}
export interface CollaborationOverview {
  manager: boolean
  metrics: { rooms: number; active: number; awaitingDecision: number; completed: number; agents: number; deliverables: number }
  rooms: CollaborationRoomSummary[]
  attachableTasks: Array<{ id: string; title: string; command: string; state: string; nodeCount: number; updatedAt: string }>
}
