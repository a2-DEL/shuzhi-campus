import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { aiTaskRuns } from './ai-runtime'
import { identityUsers, schools } from './identity'

const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

export const aiWorkflows = pgTable('ai_workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  slug: varchar('slug', { length: 140 }).notNull(),
  name: varchar('name', { length: 220 }).notNull(),
  description: text('description').notNull().default(''),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  triggerKind: varchar('trigger_kind', { length: 24 }).notNull().default('MANUAL'),
  currentVersion: integer('current_version').notNull().default(0),
  visibilityRoles: text('visibility_roles').array().notNull().default(sql`ARRAY[]::text[]`),
  tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
  ownerUserId: varchar('owner_user_id', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  lastRunAt: time('last_run_at'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_workflows_school_slug_unique').on(table.schoolId, table.slug),
  check('ai_workflows_current_version_check', sql`${table.currentVersion} >= 0`),
])

export const aiWorkflowVersions = pgTable('ai_workflow_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  workflowId: uuid('workflow_id').notNull().references(() => aiWorkflows.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  definition: jsonb('definition').notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  publishedBy: varchar('published_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  createdAt: time('created_at').notNull().defaultNow(),
  publishedAt: time('published_at'),
}, (table) => [
  unique('ai_workflow_versions_number_unique').on(table.workflowId, table.versionNo),
  unique('ai_workflow_versions_checksum_unique').on(table.workflowId, table.checksum),
  index('ai_workflow_versions_lookup_idx').on(table.schoolId, table.workflowId, table.versionNo),
  check('ai_workflow_versions_version_check', sql`${table.versionNo} > 0`),
])

export const aiWorkflowRuns = pgTable('ai_workflow_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  workflowId: uuid('workflow_id').notNull().references(() => aiWorkflows.id, { onDelete: 'cascade' }),
  workflowVersionId: uuid('workflow_version_id').notNull().references(() => aiWorkflowVersions.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').references(() => aiTaskRuns.id, { onDelete: 'set null' }),
  triggeredBy: varchar('triggered_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 32 }).notNull().default('QUEUED'),
  inputHash: varchar('input_hash', { length: 64 }).notNull(),
  outputSummary: jsonb('output_summary').notNull().default({}),
  startedAt: time('started_at'),
  completedAt: time('completed_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  index('ai_workflow_runs_school_created_idx').on(table.schoolId, table.createdAt),
  index('ai_workflow_runs_workflow_idx').on(table.schoolId, table.workflowId, table.createdAt),
])

export const aiWorkflowRunEvents = pgTable('ai_workflow_run_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  runId: uuid('run_id').notNull().references(() => aiWorkflowRuns.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  eventType: varchar('event_type', { length: 64 }).notNull(),
  nodeId: varchar('node_id', { length: 140 }),
  agentId: varchar('agent_id', { length: 160 }),
  title: varchar('title', { length: 220 }).notNull(),
  message: text('message').notNull(),
  payload: jsonb('payload').notNull().default({}),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_workflow_run_events_sequence_unique').on(table.runId, table.seq),
  index('ai_workflow_run_events_stream_idx').on(table.schoolId, table.runId, table.seq),
  check('ai_workflow_run_events_sequence_check', sql`${table.seq} > 0`),
])

export const aiPlugins = pgTable('ai_plugins', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  slug: varchar('slug', { length: 140 }).notNull(),
  name: varchar('name', { length: 220 }).notNull(),
  description: text('description').notNull().default(''),
  publisher: varchar('publisher', { length: 180 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  trustLevel: varchar('trust_level', { length: 24 }).notNull().default('INTERNAL'),
  currentVersion: integer('current_version').notNull().default(0),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_plugins_school_slug_unique').on(table.schoolId, table.slug)])

export const aiPluginVersions = pgTable('ai_plugin_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  pluginId: uuid('plugin_id').notNull().references(() => aiPlugins.id, { onDelete: 'cascade' }),
  versionNo: integer('version_no').notNull(),
  manifest: jsonb('manifest').notNull(),
  checksum: varchar('checksum', { length: 64 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  publishedBy: varchar('published_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  createdAt: time('created_at').notNull().defaultNow(),
  publishedAt: time('published_at'),
}, (table) => [
  unique('ai_plugin_versions_number_unique').on(table.pluginId, table.versionNo),
  unique('ai_plugin_versions_checksum_unique').on(table.pluginId, table.checksum),
  index('ai_plugin_versions_lookup_idx').on(table.schoolId, table.pluginId, table.versionNo),
])

export const aiMcpServers = pgTable('ai_mcp_servers', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  slug: varchar('slug', { length: 140 }).notNull(),
  name: varchar('name', { length: 220 }).notNull(),
  description: text('description').notNull().default(''),
  endpoint: text('endpoint').notNull(),
  transport: varchar('transport', { length: 32 }).notNull().default('STREAMABLE_HTTP'),
  authMode: varchar('auth_mode', { length: 24 }).notNull().default('NONE'),
  credentialRef: varchar('credential_ref', { length: 120 }),
  status: varchar('status', { length: 24 }).notNull().default('DRAFT'),
  trustLevel: varchar('trust_level', { length: 24 }).notNull().default('INTERNAL'),
  protocolVersion: varchar('protocol_version', { length: 32 }),
  serverInfo: jsonb('server_info').notNull().default({}),
  configHash: varchar('config_hash', { length: 64 }).notNull(),
  lastProbeAt: time('last_probe_at'),
  lastLatencyMs: integer('last_latency_ms'),
  lastErrorCode: varchar('last_error_code', { length: 80 }),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_mcp_servers_school_slug_unique').on(table.schoolId, table.slug)])

export const aiMcpTools = pgTable('ai_mcp_tools', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  serverId: uuid('server_id').notNull().references(() => aiMcpServers.id, { onDelete: 'cascade' }),
  toolName: varchar('tool_name', { length: 180 }).notNull(),
  title: varchar('title', { length: 220 }).notNull(),
  description: text('description').notNull().default(''),
  inputSchema: jsonb('input_schema').notNull().default({}),
  riskLevel: varchar('risk_level', { length: 16 }).notNull().default('medium'),
  status: varchar('status', { length: 24 }).notNull().default('AVAILABLE'),
  discoveredAt: time('discovered_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_mcp_tools_server_name_unique').on(table.serverId, table.toolName),
  index('ai_mcp_tools_server_idx').on(table.schoolId, table.serverId, table.status, table.toolName),
])

export const aiMcpProbeRuns = pgTable('ai_mcp_probe_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  serverId: uuid('server_id').notNull().references(() => aiMcpServers.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 24 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  toolCount: integer('tool_count').notNull().default(0),
  responseHash: varchar('response_hash', { length: 64 }),
  errorCode: varchar('error_code', { length: 80 }),
  probedBy: varchar('probed_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_mcp_probe_runs_server_idx').on(table.schoolId, table.serverId, table.createdAt)])

export const aiMcpInvocations = pgTable('ai_mcp_invocations', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  serverId: uuid('server_id').notNull().references(() => aiMcpServers.id, { onDelete: 'restrict' }),
  toolId: uuid('tool_id').notNull().references(() => aiMcpTools.id, { onDelete: 'restrict' }),
  invokedBy: varchar('invoked_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  status: varchar('status', { length: 24 }).notNull(),
  argumentsHash: varchar('arguments_hash', { length: 64 }).notNull(),
  resultHash: varchar('result_hash', { length: 64 }),
  latencyMs: integer('latency_ms').notNull(),
  errorCode: varchar('error_code', { length: 80 }),
  summary: jsonb('summary').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_mcp_invocations_school_created_idx').on(table.schoolId, table.createdAt)])

export const aiCollaborationRooms = pgTable('ai_collaboration_rooms', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 220 }).notNull(),
  objective: text('objective').notNull(),
  status: varchar('status', { length: 24 }).notNull().default('ACTIVE'),
  ownerUserId: varchar('owner_user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_collaboration_rooms_school_task_unique').on(table.schoolId, table.taskId),
  index('ai_collaboration_rooms_school_updated_idx').on(table.schoolId, table.updatedAt),
])

export const aiCollaborationNotes = pgTable('ai_collaboration_notes', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id').notNull().references(() => aiCollaborationRooms.id, { onDelete: 'cascade' }),
  authorUserId: varchar('author_user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  authorName: varchar('author_name', { length: 128 }).notNull(),
  noteType: varchar('note_type', { length: 24 }).notNull().default('NOTE'),
  content: text('content').notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  nodeId: varchar('node_id', { length: 128 }),
  createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_collaboration_notes_room_idx').on(table.schoolId, table.roomId, table.createdAt)])

export const aiCollaborationDeliverables = pgTable('ai_collaboration_deliverables', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  roomId: uuid('room_id').notNull().references(() => aiCollaborationRooms.id, { onDelete: 'cascade' }),
  taskId: uuid('task_id').notNull().references(() => aiTaskRuns.id, { onDelete: 'cascade' }),
  nodeId: varchar('node_id', { length: 128 }).notNull(),
  title: varchar('title', { length: 220 }).notNull(),
  ownerAgentId: varchar('owner_agent_id', { length: 160 }).notNull(),
  ownerAgentName: varchar('owner_agent_name', { length: 160 }).notNull(),
  status: varchar('status', { length: 24 }).notNull().default('PENDING'),
  summary: text('summary').notNull().default(''),
  evidenceRefs: jsonb('evidence_refs').notNull().default([]),
  acceptedBy: varchar('accepted_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  acceptedAt: time('accepted_at'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [
  unique('ai_collaboration_deliverables_room_node_unique').on(table.roomId, table.nodeId),
  index('ai_collaboration_deliverables_room_idx').on(table.schoolId, table.roomId, table.status, table.updatedAt),
])

export const aiEvolutionSignals = pgTable('ai_evolution_signals', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  sourceType: varchar('source_type', { length: 40 }).notNull(), sourceId: varchar('source_id', { length: 180 }).notNull(), signalType: varchar('signal_type', { length: 48 }).notNull(),
  severity: varchar('severity', { length: 16 }).notNull(), status: varchar('status', { length: 24 }).notNull().default('OPEN'), summary: text('summary').notNull(), evidenceHash: varchar('evidence_hash', { length: 64 }).notNull(),
  metadata: jsonb('metadata').notNull().default({}), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_evolution_signals_source_unique').on(table.schoolId, table.sourceType, table.sourceId, table.signalType), index('ai_evolution_signals_school_status_idx').on(table.schoolId, table.status, table.severity, table.createdAt)])

export const aiEvolutionDatasets = pgTable('ai_evolution_datasets', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), slug: varchar('slug', { length: 140 }).notNull(), name: varchar('name', { length: 220 }).notNull(),
  description: text('description').notNull().default(''), targetType: varchar('target_type', { length: 32 }).notNull(), version: integer('version').notNull().default(1), status: varchar('status', { length: 24 }).notNull().default('ACTIVE'),
  createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), metadata: jsonb('metadata').notNull().default({}), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_evolution_datasets_version_unique').on(table.schoolId, table.slug, table.version)])

export const aiEvolutionEvalCases = pgTable('ai_evolution_eval_cases', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), datasetId: uuid('dataset_id').notNull().references(() => aiEvolutionDatasets.id, { onDelete: 'cascade' }),
  caseKey: varchar('case_key', { length: 140 }).notNull(), title: varchar('title', { length: 220 }).notNull(), input: jsonb('input').notNull(), expected: jsonb('expected').notNull(), riskLevel: varchar('risk_level', { length: 16 }).notNull().default('low'), active: boolean('active').notNull().default(true), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [unique('ai_evolution_eval_cases_key_unique').on(table.datasetId, table.caseKey), index('ai_evolution_eval_cases_dataset_idx').on(table.schoolId, table.datasetId, table.active)])

export const aiEvolutionExperiments = pgTable('ai_evolution_experiments', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), signalId: uuid('signal_id').references(() => aiEvolutionSignals.id, { onDelete: 'set null' }), datasetId: uuid('dataset_id').notNull().references(() => aiEvolutionDatasets.id, { onDelete: 'restrict' }),
  targetType: varchar('target_type', { length: 32 }).notNull(), targetId: varchar('target_id', { length: 180 }).notNull(), baselineVersion: varchar('baseline_version', { length: 80 }).notNull(), candidateVersion: varchar('candidate_version', { length: 80 }).notNull(),
  hypothesis: text('hypothesis').notNull(), changeSummary: text('change_summary').notNull(), baselineConfig: jsonb('baseline_config').notNull(), candidateConfig: jsonb('candidate_config').notNull(), status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
  createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), reviewedBy: varchar('reviewed_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), reviewedAt: time('reviewed_at'), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_evolution_experiments_candidate_unique').on(table.schoolId, table.targetId, table.candidateVersion), index('ai_evolution_experiments_school_status_idx').on(table.schoolId, table.status, table.createdAt)])

export const aiEvolutionEvalRuns = pgTable('ai_evolution_eval_runs', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), experimentId: uuid('experiment_id').notNull().references(() => aiEvolutionExperiments.id, { onDelete: 'cascade' }), datasetId: uuid('dataset_id').notNull().references(() => aiEvolutionDatasets.id, { onDelete: 'restrict' }), status: varchar('status', { length: 24 }).notNull(),
  caseCount: integer('case_count').notNull().default(0), passedCases: integer('passed_cases').notNull().default(0), baselineScore: numeric('baseline_score', { precision: 8, scale: 5 }), candidateScore: numeric('candidate_score', { precision: 8, scale: 5 }), safetyScore: numeric('safety_score', { precision: 8, scale: 5 }), latencyDeltaMs: integer('latency_delta_ms'), costDeltaRatio: numeric('cost_delta_ratio', { precision: 8, scale: 5 }), metrics: jsonb('metrics').notNull().default({}), evidenceHash: varchar('evidence_hash', { length: 64 }), executedBy: varchar('executed_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), startedAt: time('started_at').notNull().defaultNow(), completedAt: time('completed_at'),
}, (table) => [index('ai_evolution_eval_runs_experiment_idx').on(table.schoolId, table.experimentId, table.startedAt)])

export const aiEvolutionReleases = pgTable('ai_evolution_releases', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), experimentId: uuid('experiment_id').notNull().references(() => aiEvolutionExperiments.id, { onDelete: 'restrict' }), targetType: varchar('target_type', { length: 32 }).notNull(), targetId: varchar('target_id', { length: 180 }).notNull(), version: varchar('version', { length: 80 }).notNull(), status: varchar('status', { length: 24 }).notNull().default('ACTIVE'), releaseNotes: text('release_notes').notNull(), config: jsonb('config').notNull(), activatedBy: varchar('activated_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), activatedAt: time('activated_at').notNull().defaultNow(), rolledBackBy: varchar('rolled_back_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), rolledBackAt: time('rolled_back_at'),
}, (table) => [
  unique('ai_evolution_releases_version_unique').on(table.schoolId, table.targetId, table.version),
  uniqueIndex('ai_evolution_releases_active_target_idx').on(table.schoolId, table.targetId).where(sql`${table.status} = 'ACTIVE'`),
])


export const aiTwinModels = pgTable('ai_twin_models', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), slug: varchar('slug', { length: 140 }).notNull(), name: varchar('name', { length: 220 }).notNull(), description: text('description').notNull().default(''), scopeType: varchar('scope_type', { length: 32 }).notNull().default('CAMPUS'), scopeId: varchar('scope_id', { length: 180 }), status: varchar('status', { length: 24 }).notNull().default('ACTIVE'), modelVersion: varchar('model_version', { length: 80 }).notNull(), topology: jsonb('topology').notNull().default({}), createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_twin_models_school_slug_unique').on(table.schoolId, table.slug)])

export const aiTwinSnapshots = pgTable('ai_twin_snapshots', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), modelId: uuid('model_id').notNull().references(() => aiTwinModels.id, { onDelete: 'cascade' }), observedAt: time('observed_at').notNull(), sourceWatermark: time('source_watermark').notNull(), metrics: jsonb('metrics').notNull(), topology: jsonb('topology').notNull(), dataQualityScore: numeric('data_quality_score', { precision: 8, scale: 5 }).notNull(), evidenceHash: varchar('evidence_hash', { length: 64 }).notNull(), sourceCounts: jsonb('source_counts').notNull().default({}), createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_twin_snapshots_model_idx').on(table.schoolId, table.modelId, table.observedAt)])

export const aiTwinScenarios = pgTable('ai_twin_scenarios', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), modelId: uuid('model_id').notNull().references(() => aiTwinModels.id, { onDelete: 'cascade' }), baseSnapshotId: uuid('base_snapshot_id').notNull().references(() => aiTwinSnapshots.id, { onDelete: 'restrict' }), name: varchar('name', { length: 220 }).notNull(), hypothesis: text('hypothesis').notNull(), interventions: jsonb('interventions').notNull(), status: varchar('status', { length: 24 }).notNull().default('DRAFT'), createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [index('ai_twin_scenarios_model_idx').on(table.schoolId, table.modelId, table.updatedAt)])

export const aiTwinSimulationRuns = pgTable('ai_twin_simulation_runs', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), scenarioId: uuid('scenario_id').notNull().references(() => aiTwinScenarios.id, { onDelete: 'cascade' }), status: varchar('status', { length: 24 }).notNull(), engineVersion: varchar('engine_version', { length: 80 }).notNull(), baselineMetrics: jsonb('baseline_metrics').notNull(), projectedMetrics: jsonb('projected_metrics').notNull(), deltas: jsonb('deltas').notNull(), assumptions: jsonb('assumptions').notNull(), confidence: numeric('confidence', { precision: 8, scale: 5 }).notNull(), evidenceHash: varchar('evidence_hash', { length: 64 }), executedBy: varchar('executed_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), startedAt: time('started_at').notNull().defaultNow(), completedAt: time('completed_at'),
}, (table) => [index('ai_twin_runs_scenario_idx').on(table.schoolId, table.scenarioId, table.startedAt)])

export const aiTwinRecommendations = pgTable('ai_twin_recommendations', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), runId: uuid('run_id').notNull().references(() => aiTwinSimulationRuns.id, { onDelete: 'cascade' }), recommendationType: varchar('recommendation_type', { length: 48 }).notNull(), title: varchar('title', { length: 220 }).notNull(), summary: text('summary').notNull(), expectedImpact: jsonb('expected_impact').notNull(), status: varchar('status', { length: 24 }).notNull().default('PROPOSED'), taskId: uuid('task_id').references(() => aiTaskRuns.id, { onDelete: 'set null' }), decidedBy: varchar('decided_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), decidedAt: time('decided_at'), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_twin_recommendations_run_idx').on(table.schoolId, table.runId, table.status)])

export const aiMultimodalAssets = pgTable('ai_multimodal_assets', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), objectKey: text('object_key').notNull(), originalName: varchar('original_name', { length: 260 }).notNull(), modality: varchar('modality', { length: 24 }).notNull(), contentType: varchar('content_type', { length: 160 }).notNull(), byteSize: bigint('byte_size', { mode: 'number' }).notNull(), sha256: varchar('sha256', { length: 64 }).notNull(), sensitivity: varchar('sensitivity', { length: 24 }).notNull().default('INTERNAL'), consentBasis: varchar('consent_basis', { length: 80 }).notNull(), status: varchar('status', { length: 24 }).notNull().default('UPLOADED'), technicalMetadata: jsonb('technical_metadata').notNull().default({}), createdBy: varchar('created_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_multimodal_assets_school_object_unique').on(table.schoolId, table.objectKey), unique('ai_multimodal_assets_school_sha_unique').on(table.schoolId, table.sha256), index('ai_multimodal_assets_school_idx').on(table.schoolId, table.status, table.createdAt)])

export const aiMultimodalObservations = pgTable('ai_multimodal_observations', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), assetId: uuid('asset_id').notNull().references(() => aiMultimodalAssets.id, { onDelete: 'cascade' }), observationType: varchar('observation_type', { length: 48 }).notNull(), label: varchar('label', { length: 220 }).notNull(), summary: text('summary').notNull(), details: jsonb('details').notNull().default({}), confidence: numeric('confidence', { precision: 8, scale: 5 }).notNull(), extractionMode: varchar('extraction_mode', { length: 48 }).notNull(), evidenceHash: varchar('evidence_hash', { length: 64 }).notNull(), status: varchar('status', { length: 24 }).notNull().default('CANDIDATE'), reviewedBy: varchar('reviewed_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), reviewedAt: time('reviewed_at'), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_multimodal_observations_asset_idx').on(table.schoolId, table.assetId, table.status)])

export const aiFederationNodes = pgTable('ai_federation_nodes', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), slug: varchar('slug', { length: 140 }).notNull(), name: varchar('name', { length: 220 }).notNull(), nodeKind: varchar('node_kind', { length: 24 }).notNull(), transport: varchar('transport', { length: 32 }).notNull(), endpoint: text('endpoint'), publicKey: text('public_key').notNull(), publicKeyFingerprint: varchar('public_key_fingerprint', { length: 64 }).notNull(), capabilities: jsonb('capabilities').notNull().default([]), privacyPolicy: jsonb('privacy_policy').notNull(), status: varchar('status', { length: 24 }).notNull().default('ACTIVE'), lastHeartbeatAt: time('last_heartbeat_at'), createdBy: varchar('created_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }), createdAt: time('created_at').notNull().defaultNow(), updatedAt: time('updated_at').notNull().defaultNow(),
}, (table) => [unique('ai_federation_nodes_school_slug_unique').on(table.schoolId, table.slug)])

export const aiFederationSandboxRecords = pgTable('ai_federation_sandbox_records', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), nodeId: uuid('node_id').notNull().references(() => aiFederationNodes.id, { onDelete: 'cascade' }), modality: varchar('modality', { length: 24 }).notNull(), metric: varchar('metric', { length: 100 }).notNull(), value: numeric('value', { precision: 14, scale: 4 }).notNull(), quality: varchar('quality', { length: 16 }).notNull().default('valid'), observedAt: time('observed_at').notNull(), synthetic: boolean('synthetic').notNull().default(true), metadata: jsonb('metadata').notNull().default({}),
}, (table) => [index('ai_federation_sandbox_records_node_idx').on(table.schoolId, table.nodeId, table.metric, table.observedAt)])

export const aiFederationJobs = pgTable('ai_federation_jobs', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), name: varchar('name', { length: 220 }).notNull(), jobType: varchar('job_type', { length: 48 }).notNull(), queryHash: varchar('query_hash', { length: 64 }).notNull(), requestedModalities: text('requested_modalities').array().notNull().default(sql`ARRAY[]::text[]`), minimumGroupSize: integer('minimum_group_size').notNull().default(5), epsilonBudget: numeric('epsilon_budget', { precision: 8, scale: 4 }).notNull(), status: varchar('status', { length: 24 }).notNull().default('QUEUED'), aggregateResult: jsonb('aggregate_result').notNull().default({}), resultHash: varchar('result_hash', { length: 64 }), initiatedBy: varchar('initiated_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), startedAt: time('started_at'), completedAt: time('completed_at'), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [index('ai_federation_jobs_school_idx').on(table.schoolId, table.createdAt)])

export const aiFederationContributions = pgTable('ai_federation_contributions', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), jobId: uuid('job_id').notNull().references(() => aiFederationJobs.id, { onDelete: 'cascade' }), nodeId: uuid('node_id').notNull().references(() => aiFederationNodes.id, { onDelete: 'restrict' }), status: varchar('status', { length: 24 }).notNull(), recordCount: integer('record_count').notNull().default(0), aggregatePayload: jsonb('aggregate_payload').notNull().default({}), payloadHash: varchar('payload_hash', { length: 64 }).notNull(), signature: text('signature'), signatureVerified: boolean('signature_verified').notNull().default(false), epsilonSpent: numeric('epsilon_spent', { precision: 8, scale: 4 }).notNull().default('0'), latencyMs: integer('latency_ms').notNull().default(0), errorCode: varchar('error_code', { length: 80 }), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [unique('ai_federation_contributions_job_node_unique').on(table.jobId, table.nodeId)])

export const aiFederationPrivacyLedger = pgTable('ai_federation_privacy_ledger', {
  id: uuid('id').defaultRandom().primaryKey(), schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }), nodeId: uuid('node_id').notNull().references(() => aiFederationNodes.id, { onDelete: 'restrict' }), jobId: uuid('job_id').notNull().references(() => aiFederationJobs.id, { onDelete: 'cascade' }), purpose: varchar('purpose', { length: 220 }).notNull(), epsilonSpent: numeric('epsilon_spent', { precision: 8, scale: 4 }).notNull(), approvedBy: varchar('approved_by', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }), createdAt: time('created_at').notNull().defaultNow(),
}, (table) => [unique('ai_federation_privacy_node_job_unique').on(table.nodeId, table.jobId), index('ai_federation_privacy_node_idx').on(table.schoolId, table.nodeId, table.createdAt)])

export const AI_TWIN_TABLES = [aiTwinModels, aiTwinSnapshots, aiTwinScenarios, aiTwinSimulationRuns, aiTwinRecommendations] as const
export const AI_MULTIMODAL_FEDERATION_TABLES = [aiMultimodalAssets, aiMultimodalObservations, aiFederationNodes, aiFederationSandboxRecords, aiFederationJobs, aiFederationContributions, aiFederationPrivacyLedger] as const

export const AI_WORKFLOW_TABLES = [aiWorkflows, aiWorkflowVersions, aiWorkflowRuns, aiWorkflowRunEvents] as const
export const AI_EVOLUTION_TABLES = [aiEvolutionSignals, aiEvolutionDatasets, aiEvolutionEvalCases, aiEvolutionExperiments, aiEvolutionEvalRuns, aiEvolutionReleases] as const
export const AI_COLLABORATION_TABLES = [aiCollaborationRooms, aiCollaborationNotes, aiCollaborationDeliverables] as const
export const AI_EXTENSION_TABLES = [aiPlugins, aiPluginVersions, aiMcpServers, aiMcpTools, aiMcpProbeRuns, aiMcpInvocations] as const
export const AI_WORKFLOW_REJECTS_ARBITRARY_CODE = true
export const AI_WORKFLOW_LINKS_GOVERNED_TASKS = true
