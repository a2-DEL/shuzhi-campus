import { UserRole } from '@/types'
import type { PreparedSkillOperation } from '@/lib/ai/skills/contracts'

export const AI_TASK_STATES = [
  'RECEIVED',
  'AUTHENTICATED',
  'CLASSIFIED',
  'CONTEXT_BUILT',
  'PLANNED',
  'PLAN_VALIDATED',
  'POLICY_CHECKED',
  'PREVIEWED',
  'AWAITING_APPROVAL',
  'QUEUED',
  'RUNNING',
  'OBSERVING',
  'REPLANNING',
  'VERIFYING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'COMPENSATED',
] as const

export type AiTaskState = typeof AI_TASK_STATES[number]
export type AiRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type AiApprovalPolicy = 'automatic' | 'single_approval' | 'dual_approval'
export type AiTaskMode = 'question' | 'advice' | 'execute'
export type AiNodeState = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'BLOCKED'

export interface AiAgentCard {
  id: string
  name: string
  role: 'coordinator' | 'planner' | 'specialist' | 'reviewer'
  avatar: string
  description: string
  capabilities: string[]
  skills: string[]
}

export interface AiAgentTeamCard {
  role: UserRole
  roleLabel: string
  coordinator: AiAgentCard
  members: AiAgentCard[]
}

export interface AiSkillDefinition {
  id: string
  name: string
  legacyName: string
  description: string
  capability: string
  requiredPermission: string
  riskLevel: AiRiskLevel
  approvalPolicy: AiApprovalPolicy
  readOnly: boolean
  executable: boolean
  gatewaySkillKey?: string
}

export interface AiIntentClassification {
  mode: AiTaskMode
  skillId: string
  confidence: number
  params: Record<string, unknown>
  reasoning: string
}

export interface AiCompletionCriterion {
  id: string
  description: string
  verifier: string
}

export interface AiPlanSubtask {
  id: string
  title: string
  capability: string
  preferredAgent: string
  preferredAgentName: string
  skillId: string
  dependsOn: string[]
  inputBindings: Record<string, string>
  inputParams?: Record<string, unknown>
  expectedOutputSchema: Record<string, string>
  riskLevel: AiRiskLevel
  timeoutSeconds: number
  retryPolicy: {
    maxAttempts: number
    backoffSeconds: number
  }
  approvalPolicy: AiApprovalPolicy
  compensationSkillId?: string
}

export interface AiTaskPlan {
  goal: string
  mode: AiTaskMode
  assumptions: Array<{
    description: string
    requiresConfirmation: boolean
  }>
  completionCriteria: AiCompletionCriterion[]
  subtasks: AiPlanSubtask[]
  executionMode?: 'single' | 'fan_out'
  budget: {
    maxDurationSeconds: number
    maxModelCalls: number
    maxToolCalls: number
  }
}

export interface AiTaskNode {
  id: string
  taskId: string
  agentId: string
  agentName: string
  agentAvatar: string
  title: string
  skillId: string
  state: AiNodeState
  dependsOn: string[]
  input: Record<string, unknown>
  preparedOperation?: PreparedSkillOperation
  output?: Record<string, unknown>
  error?: string
  startedAt?: string
  completedAt?: string
  durationMs?: number
  attemptCount: number
  maxAttempts: number
  nextAttemptAt?: string
  leaseOwner?: string
  leaseToken?: string
  leaseExpiresAt?: string
  createdAt: string
  updatedAt: string
}

export interface AiTaskObservation {
  id: string
  taskId: string
  nodeId: string
  kind: 'tool_result' | 'business_readback' | 'error'
  payload: Record<string, unknown>
  createdAt: string
}

export interface AiTaskMessage {
  id: string
  taskId: string
  agentId: string
  agentName: string
  agentAvatar: string
  type: 'chat' | 'handover' | 'result' | 'error' | 'approval_request' | 'approval_decision'
  content: string
  createdAt: string
  data?: Record<string, unknown>
}

export interface AiApprovalRecord {
  policy: AiApprovalPolicy
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  requestedAt: string
  decisions: Array<{
    userId: string
    userName: string
    decision: 'APPROVED' | 'REJECTED'
    reason?: string
    decidedAt: string
  }>
}

export interface AiTaskRecord {
  id: string
  idempotencyKey: string
  version: number
  title: string
  command: string
  ownerUserId: string
  ownerUserName: string
  ownerRole: UserRole
  schoolId?: string
  state: AiTaskState
  intent: AiIntentClassification
  riskLevel: AiRiskLevel
  approvalPolicy: AiApprovalPolicy
  plan: AiTaskPlan
  nodes: AiTaskNode[]
  observations: AiTaskObservation[]
  messages: AiTaskMessage[]
  stateHistory: Array<{
    from?: AiTaskState
    to: AiTaskState
    at: string
    reason: string
  }>
  approval?: AiApprovalRecord
  summary?: string
  blocker?: {
    code: string
    message: string
  }
  createdAt: string
  updatedAt: string
  startedAt?: string
  completedAt?: string
  attemptCount: number
  maxAttempts: number
  retryEligible: boolean
  nextAttemptAt?: string
  deadLetteredAt?: string
  leaseOwner?: string
  leaseToken?: string
  leaseExpiresAt?: string
}

export interface AiWorkflowStep {
  skillId: string
  params?: Record<string, unknown>
  title?: string
  dependsOn?: string[]
}

export interface CreateAiTaskInput {
  command: string
  skillId?: string
  params?: Record<string, unknown>
  workflow?: AiWorkflowStep[]
  idempotencyKey?: string
}
