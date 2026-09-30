import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { identityUsers, schools } from './identity'

const timestampColumn = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

export const aiTaskRuns = pgTable('ai_task_runs', {
  id: uuid('id').primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  ownerUserName: varchar('owner_user_name', { length: 128 }).notNull(),
  ownerRole: varchar('owner_role', { length: 50 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 160 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  command: text('command').notNull(),
  state: varchar('state', { length: 32 }).notNull(),
  mode: varchar('mode', { length: 20 }).notNull(),
  skillId: varchar('skill_id', { length: 100 }).notNull(),
  riskLevel: varchar('risk_level', { length: 16 }).notNull(),
  approvalPolicy: varchar('approval_policy', { length: 24 }).notNull(),
  intent: jsonb('intent').notNull(),
  plan: jsonb('plan').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  summary: text('summary'),
  blocker: jsonb('blocker'),
  version: integer('version').notNull().default(1),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  retryEligible: boolean('retry_eligible').notNull().default(false),
  nextAttemptAt: timestampColumn('next_attempt_at'),
  deadLetteredAt: timestampColumn('dead_lettered_at'),
  leaseOwner: varchar('lease_owner', { length: 160 }),
  leaseToken: uuid('lease_token'),
  leaseExpiresAt: timestampColumn('lease_expires_at'),
  startedAt: timestampColumn('started_at'),
  completedAt: timestampColumn('completed_at'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_task_runs_idempotency_unique').on(table.schoolId, table.ownerUserId, table.idempotencyKey),
  index('ai_task_runs_owner_created_idx').on(table.schoolId, table.ownerUserId, table.createdAt),
  index('ai_task_runs_recovery_idx').on(table.state, table.nextAttemptAt, table.leaseExpiresAt),
  check('ai_task_runs_version_check', sql`${table.version} > 0`),
  check('ai_task_runs_attempt_check', sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} BETWEEN 1 AND 20`),
])

export const aiTaskNodes = pgTable('ai_task_nodes', {
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  id: varchar('id', { length: 128 }).notNull(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  agentId: varchar('agent_id', { length: 160 }).notNull(),
  agentName: varchar('agent_name', { length: 160 }).notNull(),
  agentAvatar: varchar('agent_avatar', { length: 64 }).notNull().default(''),
  title: varchar('title', { length: 255 }).notNull(),
  skillId: varchar('skill_id', { length: 100 }).notNull(),
  state: varchar('state', { length: 24 }).notNull(),
  dependsOn: jsonb('depends_on').notNull().default([]),
  input: jsonb('input').notNull().default({}),
  output: jsonb('output'),
  error: text('error'),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(3),
  nextAttemptAt: timestampColumn('next_attempt_at'),
  leaseOwner: varchar('lease_owner', { length: 160 }),
  leaseToken: uuid('lease_token'),
  leaseExpiresAt: timestampColumn('lease_expires_at'),
  startedAt: timestampColumn('started_at'),
  completedAt: timestampColumn('completed_at'),
  durationMs: integer('duration_ms'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.taskId, table.id] }),
  index('ai_task_nodes_runnable_idx').on(table.state, table.nextAttemptAt, table.leaseExpiresAt),
])

export const aiTaskDependencies = pgTable('ai_task_dependencies', {
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  dependsOnNodeId: varchar('depends_on_node_id', { length: 128 }).notNull(),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.taskId, table.nodeId, table.dependsOnNodeId] })])

export const aiTaskObservations = pgTable('ai_task_observations', {
  id: varchar('id', { length: 160 }).primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  kind: varchar('kind', { length: 32 }).notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
}, (table) => [index('ai_task_observations_task_idx').on(table.taskId, table.createdAt)])

export const aiAgentMessages = pgTable('ai_agent_messages', {
  id: varchar('id', { length: 160 }).primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  agentId: varchar('agent_id', { length: 160 }).notNull(),
  agentName: varchar('agent_name', { length: 160 }).notNull(),
  agentAvatar: varchar('agent_avatar', { length: 64 }).notNull().default(''),
  type: varchar('type', { length: 32 }).notNull(),
  content: text('content').notNull(),
  data: jsonb('data'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
}, (table) => [index('ai_agent_messages_task_idx').on(table.taskId, table.createdAt)])

export const aiApprovalRequests = pgTable('ai_approval_requests', {
  id: uuid('id').primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }).unique(),
  policy: varchar('policy', { length: 24 }).notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  requestedBy: varchar('requested_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  requestedAt: timestampColumn('requested_at').notNull(),
  expiresAt: timestampColumn('expires_at'),
  completedAt: timestampColumn('completed_at'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
})

export const aiApprovalDecisions = pgTable('ai_approval_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  approvalRequestId: uuid('approval_request_id').notNull().references(() => aiApprovalRequests.id, { onDelete: 'cascade' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  userName: varchar('user_name', { length: 128 }).notNull(),
  decision: varchar('decision', { length: 16 }).notNull(),
  reason: text('reason'),
  decidedAt: timestampColumn('decided_at').notNull(),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
}, (table) => [unique('ai_approval_decisions_user_unique').on(table.approvalRequestId, table.userId)])

export const aiToolInvocations = pgTable('ai_tool_invocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  skillId: varchar('skill_id', { length: 100 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  request: jsonb('request').notNull(),
  response: jsonb('response'),
  error: text('error'),
  attempt: integer('attempt').notNull().default(1),
  startedAt: timestampColumn('started_at'),
  completedAt: timestampColumn('completed_at'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_tool_invocations_idempotency_unique').on(table.schoolId, table.idempotencyKey)])

export const aiBusinessEffects = pgTable('ai_business_effects', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  effectType: varchar('effect_type', { length: 100 }).notNull(),
  targetType: varchar('target_type', { length: 100 }).notNull(),
  targetId: varchar('target_id', { length: 160 }),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).notNull(),
  status: varchar('status', { length: 24 }).notNull(),
  beforeValue: jsonb('before_value'),
  afterValue: jsonb('after_value'),
  verification: jsonb('verification'),
  appliedAt: timestampColumn('applied_at'),
  verifiedAt: timestampColumn('verified_at'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_business_effects_idempotency_unique').on(table.schoolId, table.idempotencyKey)])

export const aiTraceLinks = pgTable('ai_trace_links', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }),
  traceId: varchar('trace_id', { length: 64 }).notNull(),
  spanId: varchar('span_id', { length: 32 }),
  parentSpanId: varchar('parent_span_id', { length: 32 }),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
}, (table) => [index('ai_trace_links_trace_idx').on(table.traceId, table.taskId)])

export const aiAuditEvents = pgTable('ai_audit_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').references(() => aiTaskRuns.id, { onDelete: 'set null' }),
  nodeId: varchar('node_id', { length: 128 }),
  actorType: varchar('actor_type', { length: 24 }).notNull(),
  actorId: varchar('actor_id', { length: 160 }).notNull(),
  eventType: varchar('event_type', { length: 120 }).notNull(),
  beforeState: varchar('before_state', { length: 32 }),
  afterState: varchar('after_state', { length: 32 }),
  metadata: jsonb('metadata').notNull().default({}),
  traceId: varchar('trace_id', { length: 64 }),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
}, (table) => [index('ai_audit_events_task_idx').on(table.taskId, table.createdAt)])

export const aiOutboxEvents = pgTable('ai_outbox_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  aggregateType: varchar('aggregate_type', { length: 80 }).notNull(),
  aggregateId: varchar('aggregate_id', { length: 160 }).notNull(),
  eventType: varchar('event_type', { length: 120 }).notNull(),
  deduplicationKey: varchar('deduplication_key', { length: 220 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PENDING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(10),
  availableAt: timestampColumn('available_at').notNull().defaultNow(),
  leaseOwner: varchar('lease_owner', { length: 160 }),
  leaseToken: uuid('lease_token'),
  leaseExpiresAt: timestampColumn('lease_expires_at'),
  publishedAt: timestampColumn('published_at'),
  lastError: text('last_error'),
  createdAt: timestampColumn('created_at').notNull().defaultNow(),
  updatedAt: timestampColumn('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_outbox_events_dedupe_unique').on(table.schoolId, table.aggregateType, table.aggregateId, table.eventType, table.deduplicationKey),
  index('ai_outbox_events_publish_idx').on(table.status, table.availableAt, table.leaseExpiresAt),
  check('ai_outbox_events_attempt_check', sql`${table.attemptCount} >= 0 AND ${table.maxAttempts} BETWEEN 1 AND 100`),
])

export const AI_RUNTIME_TABLES = [
  aiTaskRuns,
  aiTaskNodes,
  aiTaskDependencies,
  aiTaskObservations,
  aiAgentMessages,
  aiApprovalRequests,
  aiApprovalDecisions,
  aiToolInvocations,
  aiBusinessEffects,
  aiTraceLinks,
  aiAuditEvents,
  aiOutboxEvents,
] as const

export const AI_RUNTIME_HAS_TRANSACTIONAL_OUTBOX = true
export const AI_RUNTIME_REQUIRES_SERVICE_ROLE = true
export const AI_RUNTIME_USES_OPTIMISTIC_VERSIONING = true
export const AI_RUNTIME_USES_RECOVERY_LEASES = true
export const AI_RUNTIME_REJECTS_DIRECT_CLIENT_WRITES = true
