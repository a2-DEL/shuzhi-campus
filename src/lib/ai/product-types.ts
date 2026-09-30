import type { AiApprovalPolicy, AiRiskLevel, AiTaskState } from '@/lib/ai/runtime/types'
import type { UserRole } from '@/types'

export type AiProductStatus = 'planning' | 'awaiting_approval' | 'queued' | 'running' | 'verified' | 'failed' | 'cancelled'

export interface AiProductPreview {
  id: string
  skillKey: string
  ready: true
  inputHash: string
  snapshotHash: string
  resourceScope: Record<string, unknown>
  summary: Record<string, unknown>
  expiresAt: string
}

export interface AiProductEffect {
  id: string
  status: string
  targetType?: string
  targetId?: string | null
  idempotentReplay: boolean
  result: Record<string, unknown>
  verification: Record<string, unknown>
  lifecycle: string[]
}

export interface AiProductNode {
  id: string
  title: string
  skillId: string
  skillKey?: string
  agent: { id: string; name: string; avatar: string }
  state: string
  dependsOn: string[]
  input: Record<string, unknown>
  requestedInput?: Record<string, unknown>
  preview?: AiProductPreview
  effect?: AiProductEffect
  error?: string
  attempts: { current: number; maximum: number }
  timing: { startedAt?: string; completedAt?: string; durationMs?: number }
}

export interface AiProductTask {
  id: string
  version: number
  title: string
  command: string
  state: AiTaskState
  status: AiProductStatus
  owner: { id: string; name: string; role: UserRole; schoolId?: string }
  skill: { id: string; key?: string; name: string; capability: string }
  riskLevel: AiRiskLevel
  approval: {
    policy: AiApprovalPolicy
    status: 'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'REJECTED'
    requiredCount: number
    approvedCount: number
    requestedAt?: string
    decisions: Array<{ userId: string; userName: string; decision: 'APPROVED' | 'REJECTED'; reason?: string; decidedAt: string }>
  }
  plan: {
    goal: string
    assumptions: Array<{ description: string; requiresConfirmation: boolean }>
    completionCriteria: Array<{ id: string; description: string; verifier: string }>
    budget: { maxDurationSeconds: number; maxModelCalls: number; maxToolCalls: number }
    executionMode?: 'single' | 'fan_out'
  }
  nodes: AiProductNode[]
  messages: Array<{ id: string; agentId: string; agentName: string; agentAvatar: string; type: string; content: string; createdAt: string; data?: Record<string, unknown> }>
  timeline: Array<{ state: AiTaskState; label: string; at: string; reason: string }>
  observations: Array<{ id: string; nodeId: string; kind: string; payload: Record<string, unknown>; createdAt: string }>
  summary?: string
  blocker?: { code: string; message: string }
  timestamps: { createdAt: string; updatedAt: string; startedAt?: string; completedAt?: string }
}

export interface AiProductSkill {
  key: string
  id: string
  version: number
  businessLoop: string
  displayName: string
  description: string
  owner: string
  permission: string
  allowedRoles: readonly UserRole[]
  riskLevel: AiRiskLevel
  approvalPolicy: AiApprovalPolicy
  timeoutMs: number
  retryPolicy: { maxAttempts: number; backoffMs: number; retryableCodes: readonly string[] }
  rateLimit: { requests: number; windowSeconds: number }
  auditPolicy: { retainDays: number; redactFields: readonly string[]; recordInput: boolean; recordOutput: boolean }
  compensation: { supported: boolean; skillKey?: string; strategy: string }
  evalSet: string
  immutable: true
  published: true
  availableToCurrentUser: boolean
  authorizationReason: string
  runtimeAliases: string[]
}

export interface AiSystemReadiness {
  runtimeRepository: 'development_memory' | 'postgres' | 'supabase'
  businessPort: 'unconfigured' | 'postgres' | 'supabase'
  databaseConfigured: boolean
  migrationsRequired: string[]
  executionReady: boolean
  modelConfigured: boolean
  modelReady: boolean
  modelCircuitOpen: boolean
  modelProbeAt?: string
  knowledgeReady: boolean
  publishedKnowledgeDocuments: number
  failClosed: true
  message: string
}
