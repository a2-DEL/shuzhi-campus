import { createHash, randomUUID } from 'node:crypto'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { UserRole, type User } from '@/types'
import { createAndPlanAiTask } from '@/lib/ai/runtime/orchestrator'
import { AiPlanningError } from '@/lib/ai/runtime/planner'
import type { TwinInterventions, TwinMetrics, TwinOverview, TwinRecommendationView, TwinSimulationView, TwinSnapshotView, TwinTopologyNode } from './twin-types'

const ENGINE_VERSION = 'campus-twin-deterministic-v1.0'
const MODEL_VERSION = 'campus-operations-topology-v1'
const MODEL_SLUG = 'campus-operations-twin'

export class TwinError extends Error {
  constructor(readonly code: 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT', message: string) {
    super(message); this.name = 'TwinError'
  }
}

function requireTwinAccess(user: User): { schoolId: string } {
  if (!user.school_id) throw new TwinError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  const allowed = [UserRole.SUPER_ADMIN, UserRole.AI_OPS_ADMIN, UserRole.DEPT_ADMIN, UserRole.LOGISTICS_MANAGER, UserRole.DORM_MANAGER]
  if (!allowed.includes(user.role)) throw new TwinError('FORBIDDEN', '当前角色没有校园数字孪生治理权限')
  if (!hasPostgresDatabaseUrl()) throw new TwinError('BACKEND_UNAVAILABLE', '数字孪生需要真实业务库，当前系统保持失败关闭')
  return { schoolId: user.school_id }
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : new Date(0).toISOString()
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function hash(value: unknown): string { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex') }
function clamp(value: number, minimum: number, maximum: number): number { return Math.min(maximum, Math.max(minimum, value)) }
function number(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? parsed : 0 }

function calculateRisk(metrics: Omit<TwinMetrics, 'campusRiskScore'>): number {
  const failedRate = metrics.communications.deliveries > 0 ? metrics.communications.failed / metrics.communications.deliveries : 0
  return Math.round(clamp(
    metrics.repairs.overdue * 4 + metrics.repairs.urgent * 1.5 + metrics.safety.open * 2 + metrics.safety.critical * 5 +
    metrics.resources.lowStock + metrics.resources.outOfStock * 3 + metrics.visitors.pending * 0.7 + failedRate * 8 +
    (1 - metrics.communications.acknowledgementRate) * 12 + Math.max(0, metrics.energy.assets > 0 ? metrics.energy.loadKw / metrics.energy.assets - 140 : 0) * 0.08 + metrics.spaces.maintenance * 2 + metrics.agents.failed * 3,
    0, 100,
  ))
}

async function ensureTwinModel(user: User): Promise<{ id: string; name: string; description: string; model_version: string; status: string }> {
  const { schoolId } = requireTwinAccess(user)
  const result = await getPostgresPool().query(
    `INSERT INTO ai_twin_models(school_id,slug,name,description,scope_type,status,model_version,created_by)
     VALUES($1::uuid,$2,'数智星图校园运行数字孪生','汇聚工单、空间、能耗、访客、安全、通知、物资与 Agent 运行态势。','CAMPUS','ACTIVE',$3,$4)
     ON CONFLICT(school_id,slug) DO UPDATE SET status='ACTIVE',model_version=EXCLUDED.model_version,updated_at=now()
     RETURNING id,name,description,model_version,status`,
    [schoolId, MODEL_SLUG, MODEL_VERSION, user.id],
  )
  return result.rows[0]
}

export function validateTwinInterventions(value: unknown): TwinInterventions {
  const raw = object(value)
  const interventions: TwinInterventions = {
    repairCapacityDelta: Math.round(number(raw.repairCapacityDelta)),
    energyReductionPct: number(raw.energyReductionPct),
    notificationEscalation: Boolean(raw.notificationEscalation),
    visitorDeskDelta: Math.round(number(raw.visitorDeskDelta)),
    eventAttendees: Math.round(number(raw.eventAttendees)),
  }
  if (interventions.repairCapacityDelta < 0 || interventions.repairCapacityDelta > 20) throw new TwinError('INVALID_REQUEST', '增援工程师数量必须在 0-20 之间')
  if (interventions.energyReductionPct < 0 || interventions.energyReductionPct > 30) throw new TwinError('INVALID_REQUEST', '能耗削峰比例必须在 0%-30% 之间')
  if (interventions.visitorDeskDelta < 0 || interventions.visitorDeskDelta > 10) throw new TwinError('INVALID_REQUEST', '访客核验席位增量必须在 0-10 之间')
  if (interventions.eventAttendees < 0 || interventions.eventAttendees > 5_000) throw new TwinError('INVALID_REQUEST', '活动人数必须在 0-5000 之间')
  return interventions
}

export async function captureTwinSnapshot(user: User): Promise<TwinSnapshotView> {
  const { schoolId } = requireTwinAccess(user)
  const model = await ensureTwinModel(user)
  const pool = getPostgresPool()
  const [metricResult, topologyResult] = await Promise.all([
    pool.query(`SELECT
      (SELECT count(*)::int FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND status IN ('PENDING','DISPATCHED','PROCESSING')) repair_open,
      (SELECT count(*)::int FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND status IN ('PENDING','DISPATCHED','PROCESSING') AND sla_due_at<now()) repair_overdue,
      (SELECT count(*)::int FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND status IN ('PENDING','DISPATCHED','PROCESSING') AND priority IN ('urgent','high')) repair_urgent,
      (SELECT COALESCE(avg(extract(epoch from (completed_at-created_at))/3600),0)::double precision FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND status='COMPLETED' AND completed_at IS NOT NULL) repair_resolution_hours,
      (SELECT count(*)::int FROM classrooms WHERE school_id=$1::uuid) classrooms,
      (SELECT count(*)::int FROM classrooms WHERE school_id=$1::uuid AND status='available') classrooms_available,
      (SELECT count(*)::int FROM classrooms WHERE school_id=$1::uuid AND status='maintenance') classrooms_maintenance,
      (SELECT count(*)::int FROM classroom_bookings WHERE school_id=$1::uuid AND status IN ('pending','approved') AND COALESCE(starts_at,booking_date::timestamptz)>=now()) upcoming_bookings,
      (SELECT count(*)::int FROM energy_assets WHERE school_id=$1::uuid AND status<>'retired') energy_assets,
      (SELECT COALESCE(sum(value),0)::double precision FROM (SELECT DISTINCT ON(asset_id,metric) value FROM energy_readings WHERE school_id=$1::uuid AND quality='valid' ORDER BY asset_id,metric,observed_at DESC) latest) energy_load,
      (SELECT count(*)::int FROM energy_readings WHERE school_id=$1::uuid AND quality='valid' AND observed_at>=now()-interval '24 hours') energy_valid,
      (SELECT count(*)::int FROM energy_readings WHERE school_id=$1::uuid AND quality<>'valid' AND observed_at>=now()-interval '24 hours') energy_suspect,
      (SELECT count(*)::int FROM visitors WHERE school_id=$1::uuid AND status='PENDING') visitors_pending,
      (SELECT count(*)::int FROM visitors WHERE school_id=$1::uuid AND status='APPROVED') visitors_approved,
      (SELECT count(*)::int FROM visitors WHERE school_id=$1::uuid AND status='ADMITTED') visitors_on_campus,
      (SELECT count(*)::int FROM dorm_safety_events WHERE school_id=$1::uuid AND status IN ('PENDING_CONFIRMATION','RECTIFICATION_REQUIRED','ESCALATED')) safety_open,
      (SELECT count(*)::int FROM dorm_safety_events WHERE school_id=$1::uuid AND severity IN ('critical','high') AND status IN ('PENDING_CONFIRMATION','RECTIFICATION_REQUIRED','ESCALATED')) safety_critical,
      (SELECT count(*)::int FROM notification_deliveries WHERE school_id=$1::uuid) deliveries,
      (SELECT count(*)::int FROM notification_deliveries WHERE school_id=$1::uuid AND status='ACKNOWLEDGED') acknowledged,
      (SELECT count(*)::int FROM notification_deliveries WHERE school_id=$1::uuid AND status='FAILED') delivery_failed,
      (SELECT count(*)::int FROM materials WHERE school_id=$1::uuid AND NOT is_deleted AND status='warning') low_stock,
      (SELECT count(*)::int FROM materials WHERE school_id=$1::uuid AND NOT is_deleted AND status='out_of_stock') out_of_stock,
      (SELECT count(*)::int FROM ai_task_runs WHERE school_id=$1::uuid AND state IN ('QUEUED','RUNNING','OBSERVING','REPLANNING','VERIFYING','AWAITING_APPROVAL')) agent_active,
      (SELECT count(*)::int FROM ai_task_runs WHERE school_id=$1::uuid AND state IN ('FAILED','PARTIAL') AND updated_at>=now()-interval '24 hours') agent_failed,
      (SELECT count(*)::int FROM ai_task_runs WHERE school_id=$1::uuid AND state='COMPLETED' AND completed_at>=now()-interval '24 hours') agent_completed,
      (SELECT count(*)::int FROM buildings WHERE school_id=$1::uuid AND status='active') buildings`, [schoolId]),
    pool.query<{ id: string; name: string; type: string; status: string; repairs: number; classrooms: number; energy_assets: number; safety: number }>(
      `SELECT b.id,b.name,b.type,b.status,
        (SELECT count(*)::int FROM repair_orders r WHERE r.school_id=b.school_id AND r.building_id=b.id AND NOT r.is_deleted AND r.status<>'COMPLETED') repairs,
        (SELECT count(*)::int FROM classrooms c WHERE c.school_id=b.school_id AND c.building_id=b.id) classrooms,
        (SELECT count(*)::int FROM energy_assets e WHERE e.school_id=b.school_id AND e.building_id=b.id) energy_assets,
        (SELECT count(*)::int FROM dorm_safety_events s WHERE s.school_id=b.school_id AND s.building_id=b.id AND s.status IN ('PENDING_CONFIRMATION','RECTIFICATION_REQUIRED','ESCALATED')) safety
       FROM buildings b WHERE b.school_id=$1::uuid AND b.status='active' ORDER BY b.name`, [schoolId],
    ),
  ])
  const row = metricResult.rows[0]
  const communications = { deliveries: number(row.deliveries), acknowledged: number(row.acknowledged), failed: number(row.delivery_failed), acknowledgementRate: number(row.deliveries) > 0 ? number(row.acknowledged) / number(row.deliveries) : 0 }
  const partial = {
    repairs: { open: number(row.repair_open), overdue: number(row.repair_overdue), urgent: number(row.repair_urgent), averageResolutionHours: Number(number(row.repair_resolution_hours).toFixed(1)) },
    spaces: { classrooms: number(row.classrooms), available: number(row.classrooms_available), maintenance: number(row.classrooms_maintenance), upcomingBookings: number(row.upcoming_bookings) },
    energy: { assets: number(row.energy_assets), loadKw: Number(number(row.energy_load).toFixed(1)), validReadings: number(row.energy_valid), suspectReadings: number(row.energy_suspect) },
    visitors: { pending: number(row.visitors_pending), approved: number(row.visitors_approved), onCampus: number(row.visitors_on_campus) },
    safety: { open: number(row.safety_open), critical: number(row.safety_critical) }, communications,
    resources: { lowStock: number(row.low_stock), outOfStock: number(row.out_of_stock) },
    agents: { active: number(row.agent_active), failed: number(row.agent_failed), completed24h: number(row.agent_completed) },
  }
  const metrics: TwinMetrics = { ...partial, campusRiskScore: calculateRisk(partial) }
  const topology: TwinTopologyNode[] = topologyResult.rows.map((item) => ({ id: item.id, name: item.name, type: item.type, status: item.status, repairCount: number(item.repairs), classroomCount: number(item.classrooms), energyAssetCount: number(item.energy_assets), safetyCount: number(item.safety) }))
  const sourceCounts: Record<string, number> = { repairs: metrics.repairs.open, classrooms: metrics.spaces.classrooms, energyReadings: metrics.energy.validReadings + metrics.energy.suspectReadings, visitors: metrics.visitors.pending + metrics.visitors.approved + metrics.visitors.onCampus, safetyEvents: metrics.safety.open, deliveries: metrics.communications.deliveries, materials: metrics.resources.lowStock + metrics.resources.outOfStock, buildings: number(row.buildings) }
  const sourceAvailability = Object.values(sourceCounts).filter((count) => count > 0).length / Object.keys(sourceCounts).length
  const energyQuality = metrics.energy.validReadings + metrics.energy.suspectReadings > 0 ? metrics.energy.validReadings / (metrics.energy.validReadings + metrics.energy.suspectReadings) : 0
  const dataQualityScore = Number(clamp(sourceAvailability * 0.75 + energyQuality * 0.25, 0, 1).toFixed(5))
  const observedAt = new Date().toISOString()
  const evidenceHash = hash({ modelId: model.id, observedAt, metrics, topology, sourceCounts })
  const inserted = await pool.query<{ id: string; created_at: unknown }>(
    `INSERT INTO ai_twin_snapshots(school_id,model_id,observed_at,source_watermark,metrics,topology,data_quality_score,evidence_hash,source_counts,created_by)
     VALUES($1::uuid,$2::uuid,$3,$3,$4::jsonb,$5::jsonb,$6,$7,$8::jsonb,$9) RETURNING id,created_at`,
    [schoolId, model.id, observedAt, JSON.stringify(metrics), JSON.stringify(topology), dataQualityScore, evidenceHash, JSON.stringify(sourceCounts), user.id],
  )
  await pool.query('UPDATE ai_twin_models SET topology=$2::jsonb,updated_at=now() WHERE id=$1::uuid', [model.id, JSON.stringify(topology)])
  return { id: inserted.rows[0].id, modelId: model.id, observedAt, sourceWatermark: observedAt, metrics, topology, dataQualityScore, evidenceHash, sourceCounts }
}

function projectTwin(baseline: TwinMetrics, interventions: TwinInterventions): { projected: TwinMetrics; deltas: Record<string, number>; assumptions: string[]; confidence: number } {
  const projected: TwinMetrics = structuredClone(baseline)
  const eventRepairPressure = Math.ceil(interventions.eventAttendees / 800)
  projected.repairs.open = Math.max(0, baseline.repairs.open - Math.round(interventions.repairCapacityDelta * 0.7) + eventRepairPressure)
  projected.repairs.overdue = Math.max(0, baseline.repairs.overdue - Math.round(interventions.repairCapacityDelta * 0.85) + Math.floor(interventions.eventAttendees / 1_500))
  projected.repairs.averageResolutionHours = Number(Math.max(1, baseline.repairs.averageResolutionHours * (1 - Math.min(0.45, interventions.repairCapacityDelta * 0.035))).toFixed(1))
  projected.energy.loadKw = Number(Math.max(0, baseline.energy.loadKw * (1 - interventions.energyReductionPct / 100) + interventions.eventAttendees * 0.018).toFixed(1))
  projected.visitors.pending = Math.max(0, baseline.visitors.pending - interventions.visitorDeskDelta * 2 + Math.ceil(interventions.eventAttendees / 300))
  projected.visitors.approved = baseline.visitors.approved + Math.min(baseline.visitors.pending, interventions.visitorDeskDelta * 2)
  projected.communications.acknowledgementRate = Number(clamp(baseline.communications.acknowledgementRate + (interventions.notificationEscalation ? (1 - baseline.communications.acknowledgementRate) * 0.42 : 0), 0, 1).toFixed(4))
  projected.communications.acknowledged = Math.round(projected.communications.deliveries * projected.communications.acknowledgementRate)
  projected.campusRiskScore = calculateRisk({ ...projected, campusRiskScore: undefined } as unknown as Omit<TwinMetrics, 'campusRiskScore'>)
  const deltas = {
    overdueRepairs: projected.repairs.overdue - baseline.repairs.overdue,
    openRepairs: projected.repairs.open - baseline.repairs.open,
    resolutionHours: Number((projected.repairs.averageResolutionHours - baseline.repairs.averageResolutionHours).toFixed(1)),
    energyLoadKw: Number((projected.energy.loadKw - baseline.energy.loadKw).toFixed(1)),
    visitorQueue: projected.visitors.pending - baseline.visitors.pending,
    acknowledgementRate: Number((projected.communications.acknowledgementRate - baseline.communications.acknowledgementRate).toFixed(4)),
    campusRiskScore: projected.campusRiskScore - baseline.campusRiskScore,
  }
  const assumptions = [
    '每新增 1 名工程师可在当前时窗内消化约 0.7 项开放工单，并优先处理超时项。',
    '能耗削峰按最新有效计量负荷线性计算，不改写原始读数。',
    '高优先级通知升级预计覆盖当前未确认人群的 42%，最终结果仍以真实回执为准。',
    '每个新增访客核验席位在推演时窗内可处理 2 项待审申请。',
    '大型活动人数会增加空间、访客、能耗与报修压力，推演结果只作决策建议。',
  ]
  const intensity = interventions.repairCapacityDelta / 20 + interventions.energyReductionPct / 30 + interventions.visitorDeskDelta / 10 + interventions.eventAttendees / 5_000
  return { projected, deltas, assumptions, confidence: Number(clamp(0.94 - intensity * 0.045, 0.72, 0.94).toFixed(5)) }
}

export async function runTwinScenario(user: User, input: { name: string; hypothesis: string; interventions: TwinInterventions; snapshotId?: string }): Promise<TwinSimulationView> {
  const { schoolId } = requireTwinAccess(user)
  const name = input.name.trim(), hypothesis = input.hypothesis.trim()
  if (name.length < 3 || name.length > 220 || hypothesis.length < 8 || hypothesis.length > 1_500) throw new TwinError('INVALID_REQUEST', '场景名称或推演假设不符合长度要求')
  const interventions = validateTwinInterventions(input.interventions)
  const model = await ensureTwinModel(user)
  const pool = getPostgresPool()
  let snapshot: TwinSnapshotView | undefined
  if (input.snapshotId) {
    const row = await pool.query(`SELECT * FROM ai_twin_snapshots WHERE id=$1::uuid AND school_id=$2::uuid AND model_id=$3::uuid`, [input.snapshotId, schoolId, model.id])
    if (row.rows[0]) snapshot = mapSnapshot(row.rows[0])
  } else {
    const row = await pool.query(`SELECT * FROM ai_twin_snapshots WHERE school_id=$1::uuid AND model_id=$2::uuid ORDER BY observed_at DESC LIMIT 1`, [schoolId, model.id])
    if (row.rows[0]) snapshot = mapSnapshot(row.rows[0])
  }
  if (!snapshot) snapshot = await captureTwinSnapshot(user)
  const scenario = await pool.query<{ id: string }>(
    `INSERT INTO ai_twin_scenarios(school_id,model_id,base_snapshot_id,name,hypothesis,interventions,status,created_by) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::jsonb,'RUNNING',$7) RETURNING id`,
    [schoolId, model.id, snapshot.id, name, hypothesis, JSON.stringify(interventions), user.id],
  )
  const projection = projectTwin(snapshot.metrics, interventions)
  const confidence = Number(clamp(projection.confidence * snapshot.dataQualityScore, 0.55, 0.94).toFixed(5))
  const run = await pool.query<{ id: string; started_at: unknown; completed_at: unknown }>(
    `INSERT INTO ai_twin_simulation_runs(school_id,scenario_id,status,engine_version,baseline_metrics,projected_metrics,deltas,assumptions,confidence,evidence_hash,executed_by,completed_at)
     VALUES($1::uuid,$2::uuid,'COMPLETED',$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,now()) RETURNING id,started_at,completed_at`,
    [schoolId, scenario.rows[0].id, ENGINE_VERSION, JSON.stringify(snapshot.metrics), JSON.stringify(projection.projected), JSON.stringify(projection.deltas), JSON.stringify(projection.assumptions), confidence, hash({ snapshotEvidence: snapshot.evidenceHash, interventions, projection }), user.id],
  )
  await pool.query("UPDATE ai_twin_scenarios SET status='COMPLETED',updated_at=now() WHERE id=$1::uuid", [scenario.rows[0].id])
  const recommendationDrafts: Array<{ type: string; title: string; summary: string; impact: Record<string, number | string> }> = []
  if (interventions.repairCapacityDelta > 0) recommendationDrafts.push({ type: 'REPAIR_CAPACITY', title: '启动报修 SLA 增援编组', summary: `建议增加 ${interventions.repairCapacityDelta} 名工程师，优先处理超时与高优先级工单；实际派单前必须人工审批。`, impact: { overdueRepairs: projection.deltas.overdueRepairs, resolutionHours: projection.deltas.resolutionHours } })
  if (interventions.energyReductionPct > 0) recommendationDrafts.push({ type: 'ENERGY_PEAK', title: '执行重点设备削峰检查', summary: `建议以 ${interventions.energyReductionPct}% 为削峰目标核验重点资产，原始计量数据保持只读。`, impact: { energyLoadKw: projection.deltas.energyLoadKw } })
  if (interventions.notificationEscalation || interventions.visitorDeskDelta > 0) recommendationDrafts.push({ type: 'CAMPUS_COORDINATION', title: '启动通知与访客联合保障', summary: '建议由灵鹊跟进未确认通知，獬豸同步核验访客准入，所有业务写入继续经过人工裁决。', impact: { acknowledgementRate: projection.deltas.acknowledgementRate, visitorQueue: projection.deltas.visitorQueue } })
  if (recommendationDrafts.length === 0) recommendationDrafts.push({ type: 'OBSERVE_ONLY', title: '保持观察并刷新孪生快照', summary: '当前场景没有主动干预，建议继续采集真实业务状态并比较风险漂移。', impact: { campusRiskScore: projection.deltas.campusRiskScore } })
  const recommendations: TwinRecommendationView[] = []
  for (const item of recommendationDrafts) {
    const inserted = await pool.query<{ id: string }>(`INSERT INTO ai_twin_recommendations(school_id,run_id,recommendation_type,title,summary,expected_impact) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6::jsonb) RETURNING id`, [schoolId, run.rows[0].id, item.type, item.title, item.summary, JSON.stringify(item.impact)])
    recommendations.push({ id: inserted.rows[0].id, type: item.type, title: item.title, summary: item.summary, expectedImpact: item.impact, status: 'PROPOSED' })
  }
  return { id: run.rows[0].id, scenarioId: scenario.rows[0].id, scenarioName: name, hypothesis, interventions, status: 'COMPLETED', engineVersion: ENGINE_VERSION, baseline: snapshot.metrics, projected: projection.projected, deltas: projection.deltas, assumptions: projection.assumptions, confidence, evidenceHash: hash({ snapshotEvidence: snapshot.evidenceHash, interventions, projection }), recommendations, startedAt: iso(run.rows[0].started_at), completedAt: iso(run.rows[0].completed_at) }
}

export async function dispatchTwinRecommendation(user: User, recommendationId: string): Promise<{ recommendation: TwinRecommendationView; taskId: string; taskState: string }> {
  const { schoolId } = requireTwinAccess(user)
  const result = await getPostgresPool().query(`SELECT r.*,s.interventions,s.name scenario_name FROM ai_twin_recommendations r JOIN ai_twin_simulation_runs run ON run.id=r.run_id JOIN ai_twin_scenarios s ON s.id=run.scenario_id WHERE r.id=$1::uuid AND r.school_id=$2::uuid`, [recommendationId, schoolId])
  const row = result.rows[0]
  if (!row) throw new TwinError('NOT_FOUND', '孪生建议不存在')
  if (row.status === 'DISPATCHED' && row.task_id) return { recommendation: mapRecommendation(row), taskId: row.task_id, taskState: 'EXISTING' }
  if (row.status !== 'PROPOSED') throw new TwinError('CONFLICT', '当前建议不能下发')
  const interventions = validateTwinInterventions(row.interventions)
  const pendingRepairs = await getPostgresPool().query<{ count: number }>("SELECT count(*)::int count FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND status='PENDING'", [schoolId])
  const dispatchCount = Math.min(Math.max(0, number(pendingRepairs.rows[0]?.count)), Math.max(1, Math.min(10, interventions.repairCapacityDelta)))
  try {
    const task = row.recommendation_type === 'REPAIR_CAPACITY' && dispatchCount > 0
      ? await createAndPlanAiTask(user, {
        command: `根据数字孪生场景“${row.scenario_name}”，对白泽建议的报修 SLA 增援进行受控预览，并同步师生通知。`,
        skillId: 'repair_dispatch', params: { count: dispatchCount, reason: `数字孪生建议：${row.title}` },
        workflow: [{ skillId: 'notification_publish', title: '灵鹊同步保障进展', params: { title: '校园运行保障进展', content: '白泽已形成数字孪生调度建议，当前处于人工审批环节；审批通过后才会执行实际业务写入。', type: 'REPAIR', audience: { roles: ['student','teacher'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: false } }],
        idempotencyKey: `twin.recommendation.${recommendationId}`,
      })
      : await createAndPlanAiTask(user, {
        command: `根据数字孪生场景“${row.scenario_name}”，发布受控校园协同保障通知。`, skillId: 'notification_publish',
        params: { title: '校园数字孪生联合保障提示', content: '白泽基于当前真实业务快照形成联合保障建议。本消息仍需人工审批，实际安排以审批结果和业务回读为准。', type: 'SYSTEM', audience: { roles: ['student','teacher'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: true },
        idempotencyKey: `twin.recommendation.${recommendationId}`,
      })
    await getPostgresPool().query("UPDATE ai_twin_recommendations SET status='DISPATCHED',task_id=$2::uuid,decided_by=$3,decided_at=now() WHERE id=$1::uuid", [recommendationId, task.id, user.id])
    return { recommendation: { ...mapRecommendation({ ...row, status: 'DISPATCHED', task_id: task.id }), taskId: task.id }, taskId: task.id, taskState: task.state }
  } catch (error) {
    if (error instanceof AiPlanningError && error.code === 'PERMISSION_DENIED') throw new TwinError('FORBIDDEN', '当前运维身份可以推演，但没有对应业务写入权限；请交由业务负责人审批下发')
    throw error
  }
}

function mapSnapshot(row: Record<string, unknown>): TwinSnapshotView {
  return { id: String(row.id), modelId: String(row.model_id), observedAt: iso(row.observed_at), sourceWatermark: iso(row.source_watermark), metrics: row.metrics as TwinMetrics, topology: Array.isArray(row.topology) ? row.topology as TwinTopologyNode[] : [], dataQualityScore: number(row.data_quality_score), evidenceHash: String(row.evidence_hash), sourceCounts: Object.fromEntries(Object.entries(object(row.source_counts)).map(([key, value]) => [key, number(value)])) }
}
function mapRecommendation(row: Record<string, unknown>): TwinRecommendationView {
  return { id: String(row.id), type: String(row.recommendation_type), title: String(row.title), summary: String(row.summary), expectedImpact: object(row.expected_impact) as Record<string, number | string>, status: String(row.status) as TwinRecommendationView['status'], taskId: typeof row.task_id === 'string' ? row.task_id : undefined }
}
async function mapSimulation(row: Record<string, unknown>): Promise<TwinSimulationView> {
  const recommendations = await getPostgresPool().query(`SELECT * FROM ai_twin_recommendations WHERE run_id=$1::uuid ORDER BY created_at`, [row.id])
  return { id: String(row.id), scenarioId: String(row.scenario_id), scenarioName: String(row.scenario_name), hypothesis: String(row.hypothesis), interventions: validateTwinInterventions(row.interventions), status: String(row.status) as TwinSimulationView['status'], engineVersion: String(row.engine_version), baseline: row.baseline_metrics as TwinMetrics, projected: row.projected_metrics as TwinMetrics, deltas: Object.fromEntries(Object.entries(object(row.deltas)).map(([key, value]) => [key, number(value)])), assumptions: Array.isArray(row.assumptions) ? row.assumptions.map(String) : [], confidence: number(row.confidence), evidenceHash: typeof row.evidence_hash === 'string' ? row.evidence_hash : undefined, recommendations: recommendations.rows.map(mapRecommendation), startedAt: iso(row.started_at), completedAt: row.completed_at ? iso(row.completed_at) : undefined }
}

export async function getTwinOverview(user: User): Promise<TwinOverview> {
  const { schoolId } = requireTwinAccess(user)
  const model = await ensureTwinModel(user)
  const pool = getPostgresPool()
  const [snapshotResult, simulationsResult, countsResult] = await Promise.all([
    pool.query(`SELECT * FROM ai_twin_snapshots WHERE school_id=$1::uuid AND model_id=$2::uuid ORDER BY observed_at DESC LIMIT 1`, [schoolId, model.id]),
    pool.query(`SELECT run.*,s.name scenario_name,s.hypothesis,s.interventions FROM ai_twin_simulation_runs run JOIN ai_twin_scenarios s ON s.id=run.scenario_id WHERE run.school_id=$1::uuid AND s.model_id=$2::uuid ORDER BY run.started_at DESC LIMIT 12`, [schoolId, model.id]),
    pool.query(`SELECT (SELECT count(*)::int FROM ai_twin_snapshots WHERE school_id=$1::uuid AND model_id=$2::uuid) snapshots,(SELECT count(*)::int FROM ai_twin_scenarios WHERE school_id=$1::uuid AND model_id=$2::uuid) scenarios,(SELECT count(*)::int FROM ai_twin_simulation_runs r JOIN ai_twin_scenarios s ON s.id=r.scenario_id WHERE r.school_id=$1::uuid AND s.model_id=$2::uuid) simulations,(SELECT count(*)::int FROM ai_twin_recommendations r JOIN ai_twin_simulation_runs run ON run.id=r.run_id JOIN ai_twin_scenarios s ON s.id=run.scenario_id WHERE r.school_id=$1::uuid AND s.model_id=$2::uuid AND r.status='DISPATCHED') dispatched`, [schoolId, model.id]),
  ])
  const simulations: TwinSimulationView[] = []
  for (const row of simulationsResult.rows) simulations.push(await mapSimulation(row))
  const counts = countsResult.rows[0]
  return { persistent: true, model: { id: model.id, name: model.name, description: model.description, version: model.model_version, status: model.status }, snapshot: snapshotResult.rows[0] ? mapSnapshot(snapshotResult.rows[0]) : undefined, latestSimulation: simulations[0], recentSimulations: simulations, metrics: { snapshots: number(counts.snapshots), scenarios: number(counts.scenarios), simulations: number(counts.simulations), dispatchedRecommendations: number(counts.dispatched) }, engine: { version: ENGINE_VERSION, deterministic: true, writesBusinessData: false, note: '推演只读取业务快照；采纳建议后仍通过正式 Skill Gateway 和人工审批执行。' } }
}

export const TWIN_SIMULATION_NEVER_WRITES_BUSINESS_DATA = true
