import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { authorize } from '@/lib/authorization'
import { isAiOperationsAdmin } from '@/lib/ai/operations/access'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'

type Health = 'healthy' | 'attention' | 'critical'
type MetricRow = Record<string, number | string | null>

interface DomainDefinition {
  key: string
  title: string
  href: string
  permission: string
  agent: string
  painPoint: string
  query: string
  present: (row: MetricRow) => {
    primaryValue: number
    primaryLabel: string
    health: Health
    healthLabel: string
    metrics: Array<{ label: string; value: number; unit?: string }>
  }
}

const n = (value: unknown): number => Number(value ?? 0)

const DOMAINS: DomainDefinition[] = [
  {
    key: 'repair', title: '报修与 SLA 作战', href: '/repairs', permission: 'repair:view', agent: '墨龟·后勤分灵',
    painPoint: '压缩待派时长，避免高优工单跨越 SLA 边界。',
    query: `SELECT count(*)::int total,
      count(*) FILTER(WHERE upper(status)='PENDING')::int pending,
      count(*) FILTER(WHERE upper(status) IN('DISPATCHED','PROCESSING'))::int active,
      count(*) FILTER(WHERE upper(status)='COMPLETED')::int completed,
      count(*) FILTER(WHERE upper(status) IN('PENDING','DISPATCHED','PROCESSING') AND sla_due_at<now())::int overdue,
      count(*) FILTER(WHERE lower(priority) IN('urgent','high') AND upper(status)<>'COMPLETED')::int priority
      FROM repair_orders WHERE school_id=$1::uuid AND NOT is_deleted`,
    present: (r) => ({
      primaryValue: n(r.pending), primaryLabel: '待调度工单', health: n(r.overdue) > 0 ? 'critical' : n(r.pending) > 3 ? 'attention' : 'healthy',
      healthLabel: n(r.overdue) > 0 ? `${n(r.overdue)} 项已越过 SLA` : 'SLA 队列受控',
      metrics: [{ label: '处理中', value: n(r.active) }, { label: '已完成', value: n(r.completed) }, { label: '高优事项', value: n(r.priority) }],
    }),
  },
  {
    key: 'classroom', title: '教学空间运营', href: '/classrooms', permission: 'classroom:view', agent: '青鸾·空间分灵',
    painPoint: '在容量、设施、课表和预约冲突之间形成一次决策。',
    query: `SELECT count(*)::int total,count(*) FILTER(WHERE status='available')::int available,
      count(*) FILTER(WHERE status='occupied')::int occupied,count(*) FILTER(WHERE status='maintenance')::int maintenance,
      coalesce(sum(capacity),0)::int capacity FROM classrooms WHERE school_id=$1::uuid`,
    present: (r) => ({
      primaryValue: n(r.available), primaryLabel: '当前可用空间', health: n(r.maintenance) > 1 ? 'attention' : 'healthy',
      healthLabel: n(r.maintenance) > 0 ? `${n(r.maintenance)} 间维护中` : '空间资源正常',
      metrics: [{ label: '总空间', value: n(r.total) }, { label: '使用中', value: n(r.occupied) }, { label: '总承载', value: n(r.capacity), unit: '人' }],
    }),
  },
  {
    key: 'notification', title: '消息触达中心', href: '/notifications', permission: 'notification:view', agent: '灵鹊·消息分灵',
    painPoint: '不只“发出”，还要看得到达、阅读、确认与失败重试。',
    query: `SELECT
      (SELECT count(*) FROM notifications WHERE school_id=$1::uuid)::int total,
      (SELECT count(*) FROM notifications WHERE school_id=$1::uuid AND upper(status)='PUBLISHED')::int published,
      (SELECT count(*) FROM notification_deliveries WHERE school_id=$1::uuid)::int deliveries,
      (SELECT count(*) FROM notification_deliveries WHERE school_id=$1::uuid AND status='ACKNOWLEDGED')::int acknowledged,
      (SELECT count(*) FROM notification_deliveries WHERE school_id=$1::uuid AND status='FAILED')::int failed`,
    present: (r) => ({
      primaryValue: n(r.deliveries), primaryLabel: '可追踪投递', health: n(r.failed) > 20 ? 'critical' : n(r.failed) > 0 ? 'attention' : 'healthy',
      healthLabel: n(r.failed) > 0 ? `${n(r.failed)} 条进入重试` : '触达链路正常',
      metrics: [{ label: '已发布', value: n(r.published) }, { label: '已确认', value: n(r.acknowledged) }, { label: '失败重试', value: n(r.failed) }],
    }),
  },
  {
    key: 'dormitory', title: '宿舍与安全事件', href: '/dormitories', permission: 'dorm:view', agent: '墨龟·安全分灵',
    painPoint: '将 IoT 预警和人工现场复核分开，避免算法直接作出处罚。',
    query: `SELECT
      (SELECT count(*) FROM dormitories WHERE school_id=$1::uuid)::int dormitories,
      (SELECT coalesce(sum(total_rooms),0) FROM dormitories WHERE school_id=$1::uuid)::int rooms,
      (SELECT coalesce(sum(occupied_rooms),0) FROM dormitories WHERE school_id=$1::uuid)::int occupied,
      (SELECT count(*) FROM dorm_safety_events WHERE school_id=$1::uuid AND status IN('PENDING_CONFIRMATION','RECTIFICATION_REQUIRED','ESCALATED'))::int open_events,
      (SELECT count(*) FROM dorm_safety_events WHERE school_id=$1::uuid AND severity='critical' AND status<>'RESOLVED')::int critical_events`,
    present: (r) => ({
      primaryValue: n(r.open_events), primaryLabel: '待处置安全事件', health: n(r.critical_events) > 0 ? 'critical' : n(r.open_events) > 0 ? 'attention' : 'healthy',
      healthLabel: n(r.critical_events) > 0 ? `${n(r.critical_events)} 项关键事件` : '人工复核链正常',
      metrics: [{ label: '宿舍楼', value: n(r.dormitories) }, { label: '房间', value: n(r.rooms) }, { label: '入住', value: n(r.occupied) }],
    }),
  },
  {
    key: 'hygiene', title: '卫生整改闭环', href: '/duties', permission: 'duty:view', agent: '墨龟·整改分灵',
    painPoint: '让每个问题都有证据、责任人、截止时间和复核结果。',
    query: `SELECT
      (SELECT count(*) FROM hygiene_inspections WHERE school_id=$1::uuid)::int inspections,
      (SELECT count(*) FROM hygiene_rectifications WHERE school_id=$1::uuid)::int total,
      (SELECT count(*) FROM hygiene_rectifications WHERE school_id=$1::uuid AND status IN('OPEN','IN_PROGRESS','SUBMITTED'))::int open,
      (SELECT count(*) FROM hygiene_rectifications WHERE school_id=$1::uuid AND status='VERIFIED')::int verified,
      (SELECT count(*) FROM hygiene_rectifications WHERE school_id=$1::uuid AND status='ESCALATED')::int escalated`,
    present: (r) => ({
      primaryValue: n(r.open), primaryLabel: '在途整改', health: n(r.escalated) > 0 ? 'critical' : n(r.open) > 3 ? 'attention' : 'healthy',
      healthLabel: n(r.escalated) > 0 ? `${n(r.escalated)} 项升级处置` : '整改链路受控',
      metrics: [{ label: '检查证据', value: n(r.inspections) }, { label: '整改任务', value: n(r.total) }, { label: '复核通过', value: n(r.verified) }],
    }),
  },
  {
    key: 'visitor', title: '访客准入治理', href: '/visitors', permission: 'visitor:check', agent: '獬豸·合规分灵',
    painPoint: '身份核验归人，Agent 只负责边界、凭证时效与全程留痕。',
    query: `SELECT count(*)::int total,count(*) FILTER(WHERE upper(status)='PENDING')::int pending,
      count(*) FILTER(WHERE upper(status)='APPROVED')::int approved,
      count(*) FILTER(WHERE upper(status)='REJECTED')::int rejected,
      count(*) FILTER(WHERE upper(status) IN('ADMITTED','COMPLETED'))::int admitted
      FROM visitors WHERE school_id=$1::uuid`,
    present: (r) => ({
      primaryValue: n(r.pending), primaryLabel: '待人工核验', health: n(r.pending) > 5 ? 'attention' : 'healthy',
      healthLabel: n(r.pending) > 0 ? '等待人工裁决' : '准入队列清洁',
      metrics: [{ label: '已批准', value: n(r.approved) }, { label: '已入校', value: n(r.admitted) }, { label: '已拒绝', value: n(r.rejected) }],
    }),
  },
  {
    key: 'energy', title: '能耗与设备健康', href: '/energy', permission: 'energy:view', agent: '烛照·洞察分灵',
    painPoint: '仅基于质量合格的真实计量读数提出可追溯维护建议。',
    query: `SELECT
      (SELECT count(*) FROM energy_assets WHERE school_id=$1::uuid)::int assets,
      (SELECT count(*) FROM energy_assets WHERE school_id=$1::uuid AND status='maintenance')::int maintenance,
      (SELECT count(*) FROM energy_readings WHERE school_id=$1::uuid AND observed_at>now()-interval '24 hours')::int readings,
      (SELECT count(*) FROM energy_readings WHERE school_id=$1::uuid AND quality<>'valid')::int suspect,
      (SELECT count(*) FROM maintenance_recommendations WHERE school_id=$1::uuid)::int recommendations`,
    present: (r) => ({
      primaryValue: n(r.assets), primaryLabel: '受管设备资产', health: n(r.suspect) > 5 ? 'critical' : n(r.maintenance) > 0 || n(r.suspect) > 0 ? 'attention' : 'healthy',
      healthLabel: n(r.suspect) > 0 ? `${n(r.suspect)} 条质量待复核` : '计量质量正常',
      metrics: [{ label: '24h 读数', value: n(r.readings) }, { label: '维护中', value: n(r.maintenance) }, { label: '维护建议', value: n(r.recommendations) }],
    }),
  },
  {
    key: 'lost_found', title: '失物服务闭环', href: '/lost-found', permission: 'lost:view', agent: '獬豸·隐私分灵',
    painPoint: '匹配可以智能，所有权确认必须由人完成且隐私最小化。',
    query: `SELECT count(*)::int total,count(*) FILTER(WHERE status='open')::int open,
      count(*) FILTER(WHERE status='matched')::int matched,count(*) FILTER(WHERE status IN('claimed','returned'))::int resolved
      FROM lost_found WHERE school_id=$1::uuid`,
    present: (r) => ({
      primaryValue: n(r.open), primaryLabel: '待匹配物品', health: n(r.open) > 10 ? 'attention' : 'healthy',
      healthLabel: n(r.matched) > 0 ? `${n(r.matched)} 项待人工确认` : '认领链路正常',
      metrics: [{ label: '全部记录', value: n(r.total) }, { label: '已匹配', value: n(r.matched) }, { label: '已解决', value: n(r.resolved) }],
    }),
  },
  {
    key: 'material', title: '物资保障中心', href: '/materials', permission: 'material:view', agent: '墨龟·物资分灵',
    painPoint: '把库存阈值、申领和维修任务放在同一保障链上。',
    query: `SELECT
      (SELECT count(*) FROM materials WHERE school_id=$1::uuid AND NOT is_deleted)::int total,
      (SELECT count(*) FROM materials WHERE school_id=$1::uuid AND NOT is_deleted AND status='warning')::int warning,
      (SELECT count(*) FROM materials WHERE school_id=$1::uuid AND NOT is_deleted AND status='out_of_stock')::int out_of_stock,
      (SELECT count(*) FROM material_requests WHERE school_id=$1::uuid AND status='pending')::int pending_requests`,
    present: (r) => ({
      primaryValue: n(r.warning) + n(r.out_of_stock), primaryLabel: '库存风险项', health: n(r.out_of_stock) > 0 ? 'critical' : n(r.warning) > 0 ? 'attention' : 'healthy',
      healthLabel: n(r.out_of_stock) > 0 ? `${n(r.out_of_stock)} 类已缺货` : '库存保障正常',
      metrics: [{ label: '物资品类', value: n(r.total) }, { label: '低库存', value: n(r.warning) }, { label: '待审批申领', value: n(r.pending_requests) }],
    }),
  },
  {
    key: 'duty', title: '值日协同', href: '/duties', permission: 'duty:view', agent: '墨龟·协同分灵',
    painPoint: '把排班、完成、检查与整改证据串成可追踪链路。',
    query: `SELECT count(*)::int total,count(*) FILTER(WHERE status='PENDING')::int pending,
      count(*) FILTER(WHERE status='IN_PROGRESS')::int active,count(*) FILTER(WHERE status='CHECKED')::int checked
      FROM duty_schedules WHERE school_id=$1::uuid`,
    present: (r) => ({
      primaryValue: n(r.pending), primaryLabel: '待执行安排', health: n(r.pending) > 8 ? 'attention' : 'healthy',
      healthLabel: '班级协同链可追踪',
      metrics: [{ label: '全部安排', value: n(r.total) }, { label: '执行中', value: n(r.active) }, { label: '已检查', value: n(r.checked) }],
    }),
  },
]

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  if (!user.school_id) return NextResponse.json({ success: false, error: 'Tenant binding is required', code: 'TENANT_REQUIRED' }, { status: 409 })
  if (!hasPostgresDatabaseUrl()) return NextResponse.json({ success: false, error: 'PostgreSQL business backend is unavailable', code: 'BUSINESS_BACKEND_UNAVAILABLE' }, { status: 503 })

  try {
    const pool = getPostgresPool()
    const visibleDefinitions = DOMAINS.filter((domain) => authorize(user, { permission: domain.permission }).allowed)
    const domainRows = await Promise.all(visibleDefinitions.map(async (domain) => {
      const result = await pool.query<MetricRow>(domain.query, [user.school_id])
      return { ...domain, ...domain.present(result.rows[0] ?? {}) }
    }))
    const operationsAdmin = isAiOperationsAdmin(user)
    const taskValues = operationsAdmin ? [user.school_id] : [user.school_id, user.id]
    const ownerClause = operationsAdmin ? '' : ' AND owner_user_id=$2'
    const [governanceResult, recentResult, schoolResult] = await Promise.all([
      pool.query<MetricRow>(
        `SELECT
          (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid${ownerClause})::int tasks,
          (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid${ownerClause} AND state='AWAITING_APPROVAL')::int awaiting,
          (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid${ownerClause} AND state IN('QUEUED','RUNNING','OBSERVING','VERIFYING'))::int active,
          (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid${ownerClause} AND state='COMPLETED')::int completed,
          (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid${ownerClause} AND state='FAILED')::int failed,
          (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid${ownerClause} AND state='CANCELLED')::int cancelled,
          (SELECT count(*) FROM ai_business_effects e JOIN ai_task_runs t ON t.id=e.task_id WHERE e.school_id=$1::uuid${operationsAdmin ? '' : ' AND t.owner_user_id=$2'} AND e.status='VERIFIED')::int verified_effects,
          (SELECT count(DISTINCT e.effect_type) FROM ai_business_effects e JOIN ai_task_runs t ON t.id=e.task_id WHERE e.school_id=$1::uuid${operationsAdmin ? '' : ' AND t.owner_user_id=$2'} AND e.status='VERIFIED')::int effect_types,
          (SELECT count(*) FROM ai_audit_events a JOIN ai_task_runs t ON t.id=a.task_id WHERE a.school_id=$1::uuid${operationsAdmin ? '' : ' AND t.owner_user_id=$2'})::int audits,
          (SELECT count(*) FROM ai_outbox_events o WHERE o.school_id=$1::uuid${operationsAdmin ? '' : " AND (o.aggregate_id IN (SELECT id::text FROM ai_task_runs WHERE school_id=$1::uuid AND owner_user_id=$2) OR o.payload->>'taskId' IN (SELECT id::text FROM ai_task_runs WHERE school_id=$1::uuid AND owner_user_id=$2))"})::int outbox,
          (SELECT count(*) FROM ai_tool_invocations i JOIN ai_task_runs t ON t.id=i.task_id WHERE i.school_id=$1::uuid${operationsAdmin ? '' : ' AND t.owner_user_id=$2'} AND i.status='SUCCEEDED')::int successful_tools`,
        taskValues,
      ),
      pool.query(
        `SELECT t.id,t.title,t.command,t.state,t.risk_level,t.updated_at,t.completed_at,
          count(DISTINCT n.id)::int AS nodes,
          count(DISTINCT e.id) FILTER(WHERE e.status='VERIFIED')::int AS verified_effects,
          string_agg(DISTINCT n.agent_name,'、') AS agents
         FROM ai_task_runs t
         LEFT JOIN ai_task_nodes n ON n.task_id=t.id
         LEFT JOIN ai_business_effects e ON e.task_id=t.id
         WHERE t.school_id=$1::uuid${operationsAdmin ? '' : ' AND t.owner_user_id=$2'}
         GROUP BY t.id ORDER BY t.updated_at DESC LIMIT 6`,
        taskValues,
      ),
      pool.query<{ settings: Record<string, unknown>; active_users: number }>(
        `SELECT s.settings,(SELECT count(*) FROM users WHERE school_id=s.id AND status='active' AND NOT is_deleted)::int active_users
         FROM schools s WHERE s.id=$1::uuid`,
        [user.school_id],
      ),
    ])
    const governance = governanceResult.rows[0] ?? {}
    const showcase = (schoolResult.rows[0]?.settings?.showcase ?? {}) as Record<string, unknown>
    const recordCount = domainRows.reduce((total, domain) => total + domain.metrics.reduce((sum, metric) => sum + (metric.label.includes('全部') || metric.label.includes('总') ? metric.value : 0), domain.primaryValue), 0)

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        dataset: {
          kind: showcase.kind === 'simulated' ? 'simulated' : 'live',
          label: typeof showcase.label === 'string' ? showcase.label : '企业租户数据',
          version: typeof showcase.version === 'string' ? showcase.version : undefined,
          executionMode: 'real_governed_runtime',
          activeUsers: n(schoolResult.rows[0]?.active_users),
          visibleRecordCount: recordCount,
        },
        governance: {
          tasks: n(governance.tasks), awaiting: n(governance.awaiting), active: n(governance.active), completed: n(governance.completed),
          failed: n(governance.failed), cancelled: n(governance.cancelled), verifiedEffects: n(governance.verified_effects),
          effectTypes: n(governance.effect_types), audits: n(governance.audits), outbox: n(governance.outbox), successfulTools: n(governance.successful_tools),
        },
        domains: domainRows.map(({ query, permission, present, ...domain }) => domain),
        recentTasks: recentResult.rows,
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Enterprise overview unavailable', code: 'OVERVIEW_FAILED' }, { status: 503 })
  }
}
