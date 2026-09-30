import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'
import { AiPlanningError } from '@/lib/ai/runtime/planner'
import { AiRuntimeError, createAndPlanAiTask } from '@/lib/ai/runtime/orchestrator'
import { toAiProductTask } from '@/lib/ai/product-view'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

const requestSchema = z.object({ scenario: z.enum(['forum_assurance', 'repair_sla', 'energy_guard', 'hygiene_closure']) })

const SCENARIOS = [
  {
    key: 'forum_assurance',
    title: '大型活动联合保障',
    subtitle: '场地、嘉宾、消息三线并行',
    painPoint: '活动负责人需要跨教学空间、宿舍访客和消息平台反复沟通，任何一环遗漏都会影响现场。',
    outcome: '一次裁决形成场地预约、短效访客凭证和可追踪通知三项业务成果。',
    spirits: ['青鸾·空间分灵', '獬豸·合规分灵', '灵鹊·消息分灵'],
    requiredPermissions: ['classroom:book', 'visitor:check', 'notification:create'],
    risk: '关键风险', steps: 3,
  },
  {
    key: 'repair_sla',
    title: '高优报修 SLA 压降',
    subtitle: '合规、派单、触达三线联动',
    painPoint: '高优工单积压时，人工逐单匹配工程师和发送进度通知，响应慢且无法形成统一证据。',
    outcome: '先由獬豸核验真实工单、租户与人员池，再由墨龟派单、灵鹊创建可追踪通知；三项结果均形成回读证据。',
    spirits: ['獬豸·合规分灵', '墨龟·后勤分灵', '灵鹊·消息分灵'],
    requiredPermissions: ['repair:dispatch', 'notification:create'],
    risk: '高风险', steps: 3,
  },
  {
    key: 'energy_guard',
    title: '设备预测性维护',
    subtitle: '读数质量、趋势与建议闭环',
    painPoint: '设备维护常依赖经验，趋势异常难以及时转化为有来源、有时限的维护建议。',
    outcome: '只读取质量合格的正式计量记录，生成可追溯、可人工裁决的维护建议。',
    spirits: ['烛照·洞察分灵'],
    requiredPermissions: ['energy:manage'],
    risk: '高风险', steps: 1,
  },
  {
    key: 'hygiene_closure',
    title: '卫生问题整改闭环',
    subtitle: '检查证据直达责任任务',
    painPoint: '检查结果停留在表格中，责任人、截止时间和复核证据容易脱节。',
    outcome: '从真实检查记录生成确定性整改任务，AI 评分仅作建议，不代替规则分数。',
    spirits: ['墨龟·整改分灵'],
    requiredPermissions: ['duty:check'],
    risk: '高风险', steps: 1,
  },
] as const

type ScenarioKey = typeof SCENARIOS[number]['key']

function future(days: number, hour: number): Date {
  const value = new Date()
  value.setDate(value.getDate() + days)
  value.setHours(hour, 0, 0, 0)
  return value
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof AiPlanningError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: error.code === 'PERMISSION_DENIED' ? 403 : 400 })
  if (error instanceof AiRuntimeError) return NextResponse.json({ success: false, error: error.message, code: error.code }, { status: 409 })
  return NextResponse.json({ success: false, error: error instanceof Error ? error.message : '场景任务创建失败', code: 'SCENARIO_FAILED' }, { status: 500 })
}

async function availability(schoolId: string): Promise<Record<ScenarioKey, number>> {
  const result = await getPostgresPool().query<{
    forum: number; repairs: number; energy: number; hygiene: number
  }>(
    `SELECT
      least((SELECT count(*) FROM classrooms WHERE school_id=$1::uuid AND status='available'),
            (SELECT count(*) FROM visitors WHERE school_id=$1::uuid AND upper(status)='PENDING'))::int AS forum,
      (SELECT count(*) FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND upper(status)='PENDING')::int AS repairs,
      (SELECT count(DISTINCT a.id) FROM energy_assets a JOIN energy_readings r ON r.asset_id=a.id AND r.school_id=a.school_id
        WHERE a.school_id=$1::uuid AND a.status='active' AND r.quality='valid' GROUP BY a.school_id HAVING count(r.id)>=3)::int AS energy,
      (SELECT count(*) FROM hygiene_inspections i WHERE i.school_id=$1::uuid AND i.status IN('COMPLETED','REVIEWED'))::int AS hygiene`,
    [schoolId],
  )
  const row = result.rows[0]
  return { forum_assurance: Number(row?.forum ?? 0), repair_sla: Number(row?.repairs ?? 0), energy_guard: Number(row?.energy ?? 0), hygiene_closure: Number(row?.hygiene ?? 0) }
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: '真实业务数据库未就绪', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  try {
    const counts = await availability(user.school_id)
    return NextResponse.json({ success: true, data: { generatedAt: new Date().toISOString(), scenarios: SCENARIOS.map((scenario) => ({
      ...scenario,
      availableRecords: counts[scenario.key],
      availableToCurrentRole: scenario.requiredPermissions.every((permission) => authorize(user, { permission }).allowed),
    })) } })
  } catch (error) {
    return errorResponse(error)
  }
}

async function buildScenario(user: NonNullable<Awaited<ReturnType<typeof getAuthUser>>>, scenario: ScenarioKey) {
  if (!user.school_id) throw new Error('Tenant binding is required')
  const pool = getPostgresPool()
  if (scenario === 'repair_sla') {
    const countResult = await pool.query<{ count: number }>(`SELECT least(count(*),3)::int count FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted AND upper(status)='PENDING'`, [user.school_id])
    const count = Number(countResult.rows[0]?.count ?? 0)
    if (count < 1) throw new AiRuntimeError('EXECUTION_BLOCKED', '当前没有可派发的真实待处理工单')
    return createAndPlanAiTask(user, {
      command: `白泽，启动高优报修 SLA 压降行动：先由獬豸锁定合规边界，再调度 ${count} 项真实待处理工单，并通知相关师生。`,
      skillId: 'repair_policy_guard',
      params: { count, operation: 'sla_dispatch', reason: '高优报修 SLA 行动的执行前合规核验' },
      workflow: [
        { skillId: 'repair_dispatch', title: '墨龟执行受控派单', params: { count, reason: '由业务场景编排台发起的高优工单 SLA 压降行动' } },
        { skillId: 'notification_publish', title: '灵鹊同步处置进度', params: {
          title: '高优报修已进入联合处置', content: '人工裁决已通过，高优报修已进入工程师受控处置，后续进度将在平台持续回传。',
          type: 'REPAIR', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: false,
        } },
      ],
      idempotencyKey: `scenario.repair-sla.${user.id}.${randomUUID()}`,
    })
  }

  if (scenario === 'forum_assurance') {
    const start = future(6, 14)
    const end = new Date(start.getTime() + 3 * 3_600_000)
    const resource = await pool.query<{ classroom_id: string; classroom_name: string; capacity: number; visitor_id: string; visitor_name: string }>(
      `SELECT c.id classroom_id,c.full_name classroom_name,c.capacity,v.id visitor_id,v.visitor_name
       FROM classrooms c CROSS JOIN LATERAL (
         SELECT id,visitor_name FROM visitors WHERE school_id=$1::uuid AND upper(status)='PENDING' ORDER BY created_at LIMIT 1
       ) v
       WHERE c.school_id=$1::uuid AND c.status='available'
       AND NOT EXISTS(SELECT 1 FROM classroom_bookings b WHERE b.school_id=$1::uuid AND b.classroom_id=c.id
         AND upper(b.status) IN('PENDING','APPROVED') AND b.starts_at<$3::timestamptz AND b.ends_at>$2::timestamptz)
       ORDER BY c.capacity DESC LIMIT 1`,
      [user.school_id, start.toISOString(), end.toISOString()],
    )
    const row = resource.rows[0]
    if (!row) throw new AiRuntimeError('EXECUTION_BLOCKED', '当前没有同时满足条件的真实场地与待审访客申请')
    return createAndPlanAiTask(user, {
      command: `白泽，为大型创新活动联合保障：锁定${row.classroom_name}、核验嘉宾${row.visitor_name}，并向师生发布会务通知。`,
      skillId: 'classroom_book',
      params: { classroomId: row.classroom_id, startsAt: start.toISOString(), endsAt: end.toISOString(), purpose: '大型数智校园创新活动联合保障', attendeeCount: Math.min(Number(row.capacity), 160) },
      workflow: [
        { skillId: 'visitor_approve', title: '獬豸核验嘉宾准入', params: {
          visitorApplicationId: row.visitor_id, decision: 'approve', rationale: '场景发起人已核对活动名单；仍需在执行预览中完成人工裁决',
          validFrom: new Date(start.getTime() - 30 * 60_000).toISOString(), validUntil: new Date(end.getTime() + 30 * 60_000).toISOString(),
        } },
        { skillId: 'notification_publish', title: '灵鹊发布会务通知', params: {
          title: '大型创新活动会务通知', content: '场地与嘉宾准入方案已形成，人工裁决后将发布最终时段、入口与签到安排。',
          type: 'ACTIVITY', audience: { roles: ['student','teacher'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: true,
        } },
      ],
      idempotencyKey: `scenario.forum.${user.id}.${randomUUID()}`,
    })
  }

  if (scenario === 'energy_guard') {
    const result = await pool.query<{ asset_id: string; asset_name: string; reading_ids: string[] }>(
      `SELECT a.id asset_id,a.name asset_name,(array_agg(r.id::text ORDER BY r.observed_at DESC))[1:8] reading_ids
       FROM energy_assets a JOIN energy_readings r ON r.asset_id=a.id AND r.school_id=a.school_id
       WHERE a.school_id=$1::uuid AND a.status='active' AND r.quality='valid'
       GROUP BY a.id HAVING count(r.id)>=3 ORDER BY max(r.observed_at) DESC LIMIT 1`,
      [user.school_id],
    )
    const row = result.rows[0]
    if (!row) throw new AiRuntimeError('EXECUTION_BLOCKED', '没有满足质量要求的真实设备读数')
    return createAndPlanAiTask(user, {
      command: `白泽，基于质量合格的计量数据研判${row.asset_name}，形成预测性维护建议并交由人工裁决。`,
      skillId: 'maintenance_recommendation_create',
      params: { assetId: row.asset_id, readingIds: row.reading_ids, recommendedAction: '检查设备效率、关键轴承及控制参数，并安排低峰维护窗口', rationale: '连续质量合格读数已满足研判样本要求，需结合现场工况完成人工确认', confidence: 0.84, dueAt: future(5, 18).toISOString(), estimatedSavingsKwh: 180 },
      idempotencyKey: `scenario.energy.${user.id}.${randomUUID()}`,
    })
  }

  const result = await pool.query<{ inspection_id: string; location: string }>(
    `SELECT i.id inspection_id,i.location FROM hygiene_inspections i
     WHERE i.school_id=$1::uuid AND i.status IN('COMPLETED','REVIEWED')
     ORDER BY i.deterministic_score ASC NULLS LAST,i.inspected_at DESC LIMIT 1`,
    [user.school_id],
  )
  const row = result.rows[0]
  if (!row) throw new AiRuntimeError('EXECUTION_BLOCKED', '当前没有可生成整改任务的真实检查记录')
  return createAndPlanAiTask(user, {
    command: `白泽，根据${row.location}的真实检查证据创建卫生整改任务，并保留责任与复核链路。`,
    skillId: 'hygiene_rectification_create',
    params: { inspectionId: row.inspection_id, assigneeId: 'dev-hygiene', dueAt: future(2, 18).toISOString(), requirements: ['完成现场清理与隐患整改', '上传整改后现场证据', '由检查人员复核确认'], severity: 'high' },
    idempotencyKey: `scenario.hygiene.${user.id}.${randomUUID()}`,
  })
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id || !hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: '真实业务数据库未就绪', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })
  try {
    const parsed = requestSchema.safeParse(await request.json())
    if (!parsed.success) return NextResponse.json({ success: false, error: '不支持的业务场景', code: 'INVALID_SCENARIO' }, { status: 400 })
    const task = await buildScenario(user, parsed.data.scenario)
    return NextResponse.json({ success: true, data: toAiProductTask(task) }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
