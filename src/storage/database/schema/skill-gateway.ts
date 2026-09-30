import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { schools, identityUsers } from './identity'
import { aiTaskRuns } from './ai-runtime'

const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

export const skillDefinitions = pgTable('skill_definitions', {
  id: varchar('id', { length: 120 }).primaryKey(),
  domain: varchar('domain', { length: 80 }).notNull(),
  displayName: varchar('display_name', { length: 200 }).notNull(),
  description: text('description').notNull(),
  owner: varchar('owner', { length: 120 }).notNull(),
  activeVersion: integer('active_version').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [check('skill_definitions_version_check', sql`${table.activeVersion} > 0`)])

export const skillVersions = pgTable('skill_versions', {
  skillId: varchar('skill_id', { length: 120 }).notNull().references(() => skillDefinitions.id, { onDelete: 'restrict' }),
  version: integer('version').notNull(),
  skillKey: varchar('skill_key', { length: 160 }).notNull().unique(),
  inputSchema: jsonb('input_schema').notNull(),
  outputSchema: jsonb('output_schema').notNull(),
  requiredPermission: varchar('required_permission', { length: 120 }).notNull(),
  dataScopePolicy: jsonb('data_scope_policy').notNull(),
  riskLevel: varchar('risk_level', { length: 16 }).notNull(),
  approvalPolicy: varchar('approval_policy', { length: 24 }).notNull(),
  timeoutMs: integer('timeout_ms').notNull(),
  retryPolicy: jsonb('retry_policy').notNull(),
  rateLimit: jsonb('rate_limit').notNull(),
  previewPolicy: jsonb('preview_policy').notNull(),
  auditPolicy: jsonb('audit_policy').notNull(),
  compensationPolicy: jsonb('compensation_policy').notNull(),
  evalSet: varchar('eval_set', { length: 200 }).notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('published'),
  publishedAt: time('published_at'),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.skillId, table.version] }),
  check('skill_versions_version_check', sql`${table.version} > 0`),
])

export const skillBindings = pgTable('skill_bindings', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  skillKey: varchar('skill_key', { length: 160 }).notNull().references(() => skillVersions.skillKey, { onDelete: 'restrict' }),
  role: varchar('role', { length: 50 }).notNull(),
  enabled: boolean('enabled').notNull().default(true),
  scopePolicy: jsonb('scope_policy').notNull().default({ source: 'server_resource' }),
  rateLimitOverride: jsonb('rate_limit_override'),
  boundBy: varchar('bound_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('skill_bindings_tenant_skill_role_unique').on(table.schoolId, table.skillKey, table.role),
  index('skill_bindings_lookup_idx').on(table.schoolId, table.role, table.skillKey),
])

export const skillEvalResults = pgTable('skill_eval_results', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').references(() => schools.id, { onDelete: 'restrict' }),
  skillKey: varchar('skill_key', { length: 160 }).notNull().references(() => skillVersions.skillKey, { onDelete: 'restrict' }),
  evalSet: varchar('eval_set', { length: 200 }).notNull(),
  runId: varchar('run_id', { length: 160 }).notNull(),
  passed: boolean('passed').notNull(),
  score: numeric('score', { precision: 8, scale: 5 }),
  metrics: jsonb('metrics').notNull().default({}),
  evidenceUri: text('evidence_uri'),
  executedAt: time('executed_at').notNull().defaultNow(),
}, (table) => [unique('skill_eval_results_run_unique').on(table.skillKey, table.runId)])

export const skillOperationPreviews = pgTable('skill_operation_previews', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  skillKey: varchar('skill_key', { length: 160 }).notNull().references(() => skillVersions.skillKey, { onDelete: 'restrict' }),
  actorId: varchar('actor_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  input: jsonb('input').notNull(),
  inputHash: varchar('input_hash', { length: 64 }).notNull(),
  resourceScope: jsonb('resource_scope').notNull(),
  targetSnapshot: jsonb('target_snapshot').notNull(),
  snapshotHash: varchar('snapshot_hash', { length: 64 }).notNull(),
  expectedVersions: jsonb('expected_versions').notNull().default({}),
  preview: jsonb('preview').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PREPARED'),
  expiresAt: time('expires_at').notNull(),
  consumedAt: time('consumed_at'),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  unique('skill_operation_previews_snapshot_unique').on(table.schoolId, table.taskId, table.nodeId, table.snapshotHash),
  index('skill_operation_previews_active_idx').on(table.schoolId, table.taskId, table.status, table.expiresAt),
])

export const aiSkillRateLimitCounters = pgTable('ai_skill_rate_limit_counters', {
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  actorId: varchar('actor_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'cascade' }),
  skillKey: varchar('skill_key', { length: 160 }).notNull().references(() => skillVersions.skillKey, { onDelete: 'cascade' }),
  windowStartedAt: time('window_started_at').notNull(),
  requestCount: integer('request_count').notNull().default(1),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.schoolId, table.actorId, table.skillKey, table.windowStartedAt] }),
  check('ai_skill_rate_limit_count_check', sql`${table.requestCount} > 0`),
])

export const aiRepairPolicyDecisions = pgTable('ai_repair_policy_decisions', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  actorId: varchar('actor_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  policyVersion: varchar('policy_version', { length: 80 }).notNull(),
  snapshotHash: varchar('snapshot_hash', { length: 64 }).notNull(),
  targetCount: integer('target_count').notNull(),
  repairIds: jsonb('repair_ids').notNull(),
  checks: jsonb('checks').notNull(),
  decision: varchar('decision', { length: 24 }).notNull(),
  businessWriteOccurred: boolean('business_write_occurred').notNull().default(false),
  createdAt: time('created_at').notNull().defaultNow(),
  verifiedAt: time('verified_at'),
}, (table) => [
  unique('ai_repair_policy_decisions_task_node_unique').on(table.schoolId, table.taskId, table.nodeId),
  index('ai_repair_policy_decisions_task_idx').on(table.schoolId, table.taskId, table.decision, table.createdAt),
  check('ai_repair_policy_decisions_target_count_check', sql`${table.targetCount} BETWEEN 1 AND 50`),
  check('ai_repair_policy_decisions_no_business_write_check', sql`${table.businessWriteOccurred} = false`),
])

export const notificationDeliveries = pgTable('notification_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  notificationId: varchar('notification_id', { length: 36 }).notNull(),
  recipientUserId: varchar('recipient_user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  channel: varchar('channel', { length: 20 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  attemptCount: integer('attempt_count').notNull().default(0),
  deliveredAt: time('delivered_at'),
  readAt: time('read_at'),
  acknowledgedAt: time('acknowledged_at'),
  lastError: text('last_error'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('notification_deliveries_recipient_channel_unique').on(table.notificationId, table.recipientUserId, table.channel)])

export const classSchedules = pgTable('class_schedules', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  classroomId: varchar('classroom_id', { length: 36 }).notNull(),
  classId: uuid('class_id'),
  startsAt: time('starts_at').notNull(),
  endsAt: time('ends_at').notNull(),
  courseName: varchar('course_name', { length: 200 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  source: varchar('source', { length: 80 }).notNull(),
  sourceVersion: varchar('source_version', { length: 80 }),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  index('class_schedules_conflict_idx').on(table.schoolId, table.classroomId, table.startsAt, table.endsAt),
  check('class_schedules_time_check', sql`${table.endsAt} > ${table.startsAt}`),
])

export const hygieneInspections = pgTable('hygiene_inspections', {
  id: varchar('id', { length: 36 }).primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  organizationId: uuid('organization_id'),
  buildingId: uuid('building_id'),
  classId: uuid('class_id'),
  location: varchar('location', { length: 200 }).notNull(),
  inspectorId: varchar('inspector_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  inspectedAt: time('inspected_at').notNull(),
  deterministicScore: numeric('deterministic_score', { precision: 6, scale: 2 }),
  aiAdvisoryScore: numeric('ai_advisory_score', { precision: 6, scale: 2 }),
  evidence: jsonb('evidence').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('COMPLETED'),
  version: integer('version').notNull().default(1),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
})

export const hygieneRectifications = pgTable('hygiene_rectifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  inspectionId: varchar('inspection_id', { length: 36 }).notNull().references(() => hygieneInspections.id, { onDelete: 'restrict' }),
  assigneeId: varchar('assignee_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  requirements: jsonb('requirements').notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  dueAt: time('due_at').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('OPEN'),
  evidence: jsonb('evidence').notNull().default([]),
  version: integer('version').notNull().default(1),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [index('hygiene_rectifications_due_idx').on(table.schoolId, table.status, table.dueAt)])

export const dormSafetyEvents = pgTable('dorm_safety_events', {
  id: varchar('id', { length: 36 }).primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  buildingId: uuid('building_id').notNull(),
  dormitoryId: varchar('dormitory_id', { length: 36 }),
  roomNumber: varchar('room_number', { length: 20 }),
  eventType: varchar('event_type', { length: 80 }).notNull(),
  source: varchar('source', { length: 40 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(),
  observedValue: jsonb('observed_value').notNull(),
  ruleEvidence: jsonb('rule_evidence').notNull().default({}),
  status: varchar('status', { length: 24 }).notNull().default('PENDING_CONFIRMATION'),
  confirmedBy: varchar('confirmed_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'restrict' }),
  confirmedAt: time('confirmed_at'),
  confirmationNote: text('confirmation_note'),
  version: integer('version').notNull().default(1),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [index('dorm_safety_events_pending_idx').on(table.schoolId, table.buildingId, table.status, table.createdAt)])

export const iotReadings = pgTable('iot_readings', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  buildingId: uuid('building_id').notNull(),
  dormitoryId: varchar('dormitory_id', { length: 36 }),
  roomNumber: varchar('room_number', { length: 20 }),
  deviceId: varchar('device_id', { length: 160 }).notNull(),
  metric: varchar('metric', { length: 80 }).notNull(),
  value: numeric('value', { precision: 20, scale: 6 }).notNull(),
  unit: varchar('unit', { length: 32 }).notNull(),
  quality: varchar('quality', { length: 20 }).notNull(),
  observedAt: time('observed_at').notNull(),
  sourceMessageId: varchar('source_message_id', { length: 200 }).notNull(),
  rawHash: varchar('raw_hash', { length: 64 }).notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  unique('iot_readings_source_message_unique').on(table.schoolId, table.sourceMessageId),
  index('iot_readings_series_idx').on(table.schoolId, table.deviceId, table.metric, table.observedAt),
])

export const energyAssets = pgTable('energy_assets', {
  id: varchar('id', { length: 36 }).primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  buildingId: uuid('building_id'),
  assetCode: varchar('asset_code', { length: 100 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  assetType: varchar('asset_type', { length: 80 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  ratedCapacity: numeric('rated_capacity', { precision: 20, scale: 6 }),
  metadata: jsonb('metadata').notNull().default({}),
  version: integer('version').notNull().default(1),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('energy_assets_code_unique').on(table.schoolId, table.assetCode)])

export const energyReadings = pgTable('energy_readings', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  assetId: varchar('asset_id', { length: 36 }).notNull().references(() => energyAssets.id, { onDelete: 'restrict' }),
  metric: varchar('metric', { length: 80 }).notNull(),
  value: numeric('value', { precision: 20, scale: 6 }).notNull(),
  unit: varchar('unit', { length: 32 }).notNull(),
  quality: varchar('quality', { length: 20 }).notNull(),
  observedAt: time('observed_at').notNull(),
  source: varchar('source', { length: 80 }).notNull(),
  sourceRecordId: varchar('source_record_id', { length: 200 }).notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  unique('energy_readings_source_unique').on(table.schoolId, table.source, table.sourceRecordId),
  index('energy_readings_series_idx').on(table.schoolId, table.assetId, table.metric, table.observedAt),
])

export const maintenanceRecommendations = pgTable('maintenance_recommendations', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  assetId: varchar('asset_id', { length: 36 }).notNull().references(() => energyAssets.id, { onDelete: 'restrict' }),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  sourceReadingIds: jsonb('source_reading_ids').notNull(),
  recommendedAction: text('recommended_action').notNull(),
  rationale: text('rationale').notNull(),
  confidence: numeric('confidence', { precision: 6, scale: 5 }).notNull(),
  dueAt: time('due_at').notNull(),
  estimatedSavingsKwh: numeric('estimated_savings_kwh', { precision: 20, scale: 6 }),
  dataQuality: jsonb('data_quality').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  version: integer('version').notNull().default(1),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [index('maintenance_recommendations_status_idx').on(table.schoolId, table.assetId, table.status, table.dueAt)])

export const SKILL_GATEWAY_CONTROL_TABLES = [skillDefinitions, skillVersions, skillBindings, skillEvalResults, skillOperationPreviews, aiSkillRateLimitCounters] as const
export const SKILL_GATEWAY_DOMAIN_TABLES = [aiRepairPolicyDecisions, notificationDeliveries, classSchedules, hygieneInspections, hygieneRectifications, dormSafetyEvents, iotReadings, energyAssets, energyReadings, maintenanceRecommendations] as const
export const SKILL_GATEWAY_REQUIRES_IMMUTABLE_PUBLISHED_VERSIONS = true
export const SKILL_GATEWAY_REQUIRES_SERVICE_ROLE = true
export const SKILL_GATEWAY_HAS_NINE_EXPLICIT_ADAPTERS = true
export const SKILL_GATEWAY_REJECTS_ARBITRARY_SQL_AND_URLS = true
