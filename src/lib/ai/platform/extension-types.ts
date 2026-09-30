export interface PluginCapability {
  id: string
  name: string
  description: string
  skillId: string
}
export interface PluginManifest {
  summary: string
  capabilities: PluginCapability[]
  allowedRoles: string[]
}
export interface PluginView {
  id: string
  slug: string
  name: string
  description: string
  publisher: string
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED' | 'ARCHIVED'
  trustLevel: 'INTERNAL' | 'VERIFIED' | 'RESTRICTED'
  currentVersion: number
  createdAt: string
  updatedAt: string
  version?: { id: string; versionNo: number; status: 'DRAFT' | 'PUBLISHED' | 'SUPERSEDED'; manifest: PluginManifest; publishedAt?: string }
}
export interface McpToolView {
  id: string
  name: string
  title: string
  description: string
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  status: 'AVAILABLE' | 'REVIEW_REQUIRED' | 'DISABLED'
  inputSchema: Record<string, unknown>
}
export interface McpServerView {
  id: string
  slug: string
  name: string
  description: string
  endpointLabel: string
  transport: 'STREAMABLE_HTTP' | 'SSE'
  authMode: 'NONE' | 'BEARER_ENV'
  credentialConfigured: boolean
  status: 'DRAFT' | 'ACTIVE' | 'DEGRADED' | 'DISABLED'
  trustLevel: 'INTERNAL' | 'VERIFIED' | 'RESTRICTED'
  protocolVersion?: string
  serverInfo: Record<string, unknown>
  lastProbeAt?: string
  lastLatencyMs?: number
  lastErrorCode?: string
  tools: McpToolView[]
  createdAt: string
}
export interface ExtensionSkillView {
  key: string
  id: string
  displayName: string
  description: string
  version: number
  businessLoop: string
  riskLevel: string
  approvalPolicy: string
  available: boolean
  owner: string
  evalSet: string
}
export interface ExtensionOverview {
  manager: boolean
  metrics: { skills: number; plugins: number; activeMcpServers: number; mcpTools: number; successfulProbes: number; invocations: number }
  skills: ExtensionSkillView[]
  plugins: PluginView[]
  mcpServers: McpServerView[]
  recentInvocations: Array<{ id: string; serverName: string; toolName: string; status: string; latencyMs: number; createdAt: string }>
}
