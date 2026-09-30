import './assert-isolated-test-environment.mjs'
import { createHash } from 'node:crypto'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import { DEVELOPMENT_SCHOOL_ID } from '@/lib/development-users'

const WORKFLOWS = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    slug: 'campus-event-assurance',
    name: '大型活动场地与通知联合保障',
    description: '把场地冲突校验、人工裁决、通知触达和白泽汇总连接成受控业务闭环。',
    tags: ['活动保障', '跨部门', '人工审批'],
    definition: {
      nodes: [
        { id: 'event-trigger', kind: 'trigger', label: '活动申请进入', description: '读取活动时间、人数和主办单位', position: { x: 40, y: 210 } },
        { id: 'policy-guard', kind: 'knowledge', label: '獬豸核验场地规则', description: '检索活动、安保与场地政策', position: { x: 280, y: 80 } },
        { id: 'classroom-agent', kind: 'agent', label: '灵鹊锁定可用场地', agentLabel: '灵鹊·教学空间分灵', skillId: 'classroom_book', params: { classroomId: 'showcase-classroom-01', startsAt: '2026-08-22T06:00:00.000Z', endsAt: '2026-08-22T10:00:00.000Z', purpose: '数智星图校园创新音乐节', attendeeCount: 180 }, position: { x: 520, y: 80 } },
        { id: 'human-approval', kind: 'approval', label: '主管人工裁决', description: '确认场地与触达范围后才允许写入', position: { x: 760, y: 210 } },
        { id: 'notify-agent', kind: 'skill', label: '灵鹊发布活动通知', agentLabel: '灵鹊·消息触达分灵', skillId: 'notification_publish', params: { title: '校园创新音乐节场地通知', content: '活动场地经人工审批后发布，请相关师生按通知到场。', type: 'ACTIVITY', audience: { roles: ['student', 'teacher'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: true }, position: { x: 1000, y: 80 } },
        { id: 'baize-aggregate', kind: 'aggregate', label: '白泽归整成果', description: '回读场地预约与真实触达任务', position: { x: 1240, y: 210 } },
      ],
      edges: [
        { id: 'e1', source: 'event-trigger', target: 'policy-guard', label: '形成上下文' },
        { id: 'e2', source: 'policy-guard', target: 'classroom-agent', label: '规则通过' },
        { id: 'e3', source: 'classroom-agent', target: 'human-approval', label: '提交预览' },
        { id: 'e4', source: 'human-approval', target: 'notify-agent', label: '批准后继续' },
        { id: 'e5', source: 'notify-agent', target: 'baize-aggregate', label: '回传结果' },
      ],
    },
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    slug: 'repair-sla-joint-response',
    name: '报修 SLA 与学生通知联合响应',
    description: '从待派工单中形成真实派单预览，审批后写回工单并生成可追踪通知任务。',
    tags: ['报修SLA', '后勤', '触达回执'],
    definition: {
      nodes: [
        { id: 'sla-trigger', kind: 'trigger', label: 'SLA 风险触发', description: '监听待派工与超时风险', position: { x: 40, y: 210 } },
        { id: 'repair-agent', kind: 'agent', label: '玄龟生成派单预览', agentLabel: '玄龟·后勤调度分灵', skillId: 'repair_dispatch', params: { count: 2, reason: '白泽工作流依据待派工状态与维修人员负载形成预览' }, position: { x: 320, y: 80 } },
        { id: 'risk-approval', kind: 'approval', label: '后勤负责人裁决', description: '派单和通知均为真实业务写入', position: { x: 600, y: 210 } },
        { id: 'repair-notify', kind: 'skill', label: '灵鹊通知报修人', agentLabel: '灵鹊·消息触达分灵', skillId: 'notification_publish', params: { title: '报修工单已进入处理', content: '您的报修工单已经完成受控派单，维修人员将按 SLA 到场。', type: 'REPAIR', audience: { roles: ['student'], userIds: [], organizationIds: [] }, channels: ['platform'], requireAcknowledgement: false }, position: { x: 880, y: 80 } },
        { id: 'repair-aggregate', kind: 'aggregate', label: '白泽核验并汇报', description: '核对工单状态、触达任务和审计证据', position: { x: 1160, y: 210 } },
      ],
      edges: [
        { id: 'r1', source: 'sla-trigger', target: 'repair-agent', label: '派发调度' },
        { id: 'r2', source: 'repair-agent', target: 'risk-approval', label: '提交预览' },
        { id: 'r3', source: 'risk-approval', target: 'repair-notify', label: '批准后通知' },
        { id: 'r4', source: 'repair-notify', target: 'repair-aggregate', label: '回读核验' },
      ],
    },
  },
] as const

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')
}

async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true }); loadDotEnv({ quiet: true })
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect()
  try {
    await client.query('BEGIN')
    for (const workflow of WORKFLOWS) {
      await client.query(
        `INSERT INTO ai_workflows(id,school_id,slug,name,description,status,trigger_kind,current_version,visibility_roles,tags,owner_user_id,metadata,created_at,updated_at)
         VALUES($1::uuid,$2::uuid,$3,$4,$5,'PUBLISHED','MANUAL',1,ARRAY[]::text[],$6::text[],'dev-admin','{"showcaseVersion":"2026.08-platform-v1"}'::jsonb,now(),now())
         ON CONFLICT(id) DO UPDATE SET school_id=EXCLUDED.school_id,slug=EXCLUDED.slug,name=EXCLUDED.name,description=EXCLUDED.description,status='PUBLISHED',current_version=1,tags=EXCLUDED.tags,metadata=EXCLUDED.metadata,updated_at=now()`,
        [workflow.id, DEVELOPMENT_SCHOOL_ID, workflow.slug, workflow.name, workflow.description, workflow.tags],
      )
      await client.query(
        `INSERT INTO ai_workflow_versions(school_id,workflow_id,version_no,definition,checksum,status,created_by,published_by,published_at)
         VALUES($1::uuid,$2::uuid,1,$3::jsonb,$4,'PUBLISHED','dev-admin','dev-admin',now())
         ON CONFLICT(workflow_id,version_no) DO UPDATE SET definition=EXCLUDED.definition,checksum=EXCLUDED.checksum,status='PUBLISHED',published_by='dev-admin',published_at=now()`,
        [DEVELOPMENT_SCHOOL_ID, workflow.id, JSON.stringify(workflow.definition), checksum(workflow.definition)],
      )
    }
    await client.query('COMMIT')
    console.log(`PASS workflow showcase seed: workflows=${WORKFLOWS.length}`)
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { await client.end() }
}

main().catch((error) => { console.error(error); process.exit(1) })
