import { createHash, randomUUID } from 'node:crypto'
import { isAiOperationsAdmin } from '@/lib/ai/operations/access'
import { createAndPlanAiTask, decideAiTask, getAccessibleAiTask, listAccessibleAiTasks } from '@/lib/ai/runtime/orchestrator'
import type { AiTaskRecord, AiWorkflowStep } from '@/lib/ai/runtime/types'
import { toAiProductTask } from '@/lib/ai/product-view'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import type { User } from '@/types'
import type { CollaborationDeliverable, CollaborationOverview, CollaborationRoomDetail, CollaborationRoomSummary, CollaborationTimelineItem } from './collaboration-types'

export class CollaborationError extends Error {
  constructor(readonly code: 'TENANT_REQUIRED' | 'FORBIDDEN' | 'BACKEND_UNAVAILABLE' | 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT', message: string) { super(message); this.name = 'CollaborationError' }
}
function context(user: User): { schoolId: string; manager: boolean } {
  if (!user.school_id) throw new CollaborationError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  if (!hasPostgresDatabaseUrl()) throw new CollaborationError('BACKEND_UNAVAILABLE', '多 Agent 协同办公需要 PostgreSQL 持久化')
  return { schoolId: user.school_id, manager: isAiOperationsAdmin(user) }
}
function hash(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex') }
function iso(value: unknown): string | undefined { return value instanceof Date ? value.toISOString() : typeof value === 'string' ? value : undefined }
function roomStatus(task: AiTaskRecord): CollaborationRoomSummary['status'] {
  if (task.state === 'COMPLETED') return 'COMPLETED'
  if (task.state === 'AWAITING_APPROVAL') return 'AWAITING_DECISION'
  if (['FAILED', 'CANCELLED', 'COMPENSATION_REQUIRED'].includes(task.state)) return 'BLOCKED'
  return 'ACTIVE'
}
function deliverableStatus(node: AiTaskRecord['nodes'][number]): CollaborationDeliverable['status'] {
  if (node.state === 'COMPLETED') return 'READY_FOR_REVIEW'
  if (node.state === 'RUNNING') return 'IN_PROGRESS'
  if (node.state === 'FAILED') return 'FAILED'
  if (['BLOCKED', 'CANCELLED'].includes(node.state)) return 'BLOCKED'
  return 'PENDING'
}
function evidenceRefs(node: AiTaskRecord['nodes'][number]): Array<Record<string, unknown>> {
  const output = node.output ?? {}
  const refs: Array<Record<string, unknown>> = []
  if (typeof output.effectId === 'string') refs.push({ kind: 'business_effect', id: output.effectId })
  if (typeof output.targetType === 'string') refs.push({ kind: 'business_target', type: output.targetType, id: typeof output.targetId === 'string' ? output.targetId : undefined })
  const verification = output.verification && typeof output.verification === 'object' && !Array.isArray(output.verification) ? output.verification as Record<string, unknown> : {}
  if (verification.verified === true) refs.push({ kind: 'readback', verified: true })
  return refs
}
function deliverableSummary(node: AiTaskRecord['nodes'][number]): string {
  if (node.state === 'COMPLETED') return `${node.agentName} 已回传成果，正式业务效果和回读证据已经关联，等待办公区验收。`
  if (node.state === 'RUNNING') return `${node.agentName} 正在执行「${node.title}」，进度以持久化运行事件为准。`
  if (node.state === 'FAILED') return `${node.agentName} 执行未完成：${node.error ?? '运行通道返回异常'}。`
  if (['BLOCKED', 'CANCELLED'].includes(node.state)) return `该交付项已安全收束，没有继续触发业务写入。`
  return `${node.agentName} 已接令，当前等待前置条件或人工裁决。`
}

async function syncRoom(task: AiTaskRecord, roomId: string): Promise<void> {
  const schoolId = task.schoolId!
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    await client.query(`UPDATE ai_collaboration_rooms SET status=$3,updated_at=$4::timestamptz WHERE id=$1::uuid AND school_id=$2::uuid`, [roomId, schoolId, roomStatus(task), task.updatedAt])
    for (const node of task.nodes) {
      await client.query(
        `INSERT INTO ai_collaboration_deliverables(school_id,room_id,task_id,node_id,title,owner_agent_id,owner_agent_name,status,summary,evidence_refs)
         VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10::jsonb)
         ON CONFLICT(room_id,node_id) DO UPDATE SET title=EXCLUDED.title,owner_agent_id=EXCLUDED.owner_agent_id,owner_agent_name=EXCLUDED.owner_agent_name,
           status=CASE WHEN ai_collaboration_deliverables.status='ACCEPTED' THEN 'ACCEPTED' ELSE EXCLUDED.status END,
           summary=CASE WHEN ai_collaboration_deliverables.status='ACCEPTED' THEN ai_collaboration_deliverables.summary ELSE EXCLUDED.summary END,
           evidence_refs=EXCLUDED.evidence_refs,updated_at=now()`,
        [schoolId, roomId, task.id, node.id, node.title, node.agentId, node.agentName, deliverableStatus(node), deliverableSummary(node), JSON.stringify(evidenceRefs(node))],
      )
    }
    await client.query('COMMIT')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
}

async function roomRow(user: User, roomId: string): Promise<Record<string, unknown>> {
  const { schoolId, manager } = context(user)
  const result = await getPostgresPool().query(`SELECT r.*,u.name owner_name,t.state task_state,t.command,t.risk_level FROM ai_collaboration_rooms r JOIN users u ON u.id=r.owner_user_id JOIN ai_task_runs t ON t.id=r.task_id WHERE r.id=$1::uuid AND r.school_id=$2::uuid AND ($3::boolean OR r.owner_user_id=$4)`, [roomId, schoolId, manager, user.id])
  if (!result.rows[0]) throw new CollaborationError('NOT_FOUND', '协同办公区不存在或当前身份无权访问')
  return result.rows[0]
}

async function listRooms(user: User): Promise<CollaborationRoomSummary[]> {
  const { schoolId, manager } = context(user)
  const result = await getPostgresPool().query(
    `SELECT r.id,r.task_id,r.title,r.objective,r.status,r.updated_at,u.name owner_name,t.state task_state,
      (SELECT count(*)::int FROM ai_task_nodes n WHERE n.task_id=r.task_id) node_count,
      (SELECT count(*)::int FROM ai_agent_messages m WHERE m.task_id=r.task_id) + (SELECT count(*)::int FROM ai_collaboration_notes x WHERE x.room_id=r.id) message_count,
      (SELECT count(*)::int FROM ai_collaboration_deliverables d WHERE d.room_id=r.id) deliverable_count,
      (SELECT count(*)::int FROM ai_collaboration_deliverables d WHERE d.room_id=r.id AND d.status='ACCEPTED') accepted_count
     FROM ai_collaboration_rooms r JOIN users u ON u.id=r.owner_user_id JOIN ai_task_runs t ON t.id=r.task_id
     WHERE r.school_id=$1::uuid AND ($2::boolean OR r.owner_user_id=$3) ORDER BY r.updated_at DESC LIMIT 40`, [schoolId, manager, user.id],
  )
  return result.rows.map((row) => ({ id: String(row.id), taskId: String(row.task_id), title: String(row.title), objective: String(row.objective), status: row.status as CollaborationRoomSummary['status'], ownerName: String(row.owner_name), taskState: String(row.task_state), nodeCount: Number(row.node_count), messageCount: Number(row.message_count), acceptedDeliverables: Number(row.accepted_count), totalDeliverables: Number(row.deliverable_count), updatedAt: iso(row.updated_at) ?? new Date(0).toISOString() }))
}

export async function getCollaborationOverview(user: User): Promise<CollaborationOverview> {
  const { schoolId, manager } = context(user)
  const [rooms, tasks, agentCount] = await Promise.all([
    listRooms(user), listAccessibleAiTasks(user),
    getPostgresPool().query(`SELECT count(DISTINCT n.agent_id)::int agents FROM ai_collaboration_rooms r JOIN ai_task_nodes n ON n.task_id=r.task_id WHERE r.school_id=$1::uuid AND ($2::boolean OR r.owner_user_id=$3)`, [schoolId, manager, user.id]),
  ])
  const existing = new Set(rooms.map((room) => room.taskId))
  const attachableTasks = tasks.filter((task) => !existing.has(task.id)).slice(0, 20).map((task) => ({ id: task.id, title: task.title, command: task.command, state: task.state, nodeCount: task.nodes.length, updatedAt: task.updatedAt }))
  return {
    manager,
    metrics: { rooms: rooms.length, active: rooms.filter((room) => room.status === 'ACTIVE').length, awaitingDecision: rooms.filter((room) => room.status === 'AWAITING_DECISION').length, completed: rooms.filter((room) => room.status === 'COMPLETED').length, agents: Number(agentCount.rows[0]?.agents ?? 0), deliverables: rooms.reduce((sum, room) => sum + room.totalDeliverables, 0) },
    rooms, attachableTasks,
  }
}

export async function createCollaborationRoom(user: User, input: { taskId?: string; title?: string; objective?: string; command?: string; skillId?: string; params?: Record<string, unknown>; workflow?: AiWorkflowStep[] }): Promise<CollaborationRoomDetail> {
  const { schoolId } = context(user)
  let task: AiTaskRecord
  if (input.taskId) task = await getAccessibleAiTask(user, input.taskId)
  else {
    const command = input.command?.trim(); if (!command) throw new CollaborationError('INVALID_REQUEST', '创建协同办公区需要业务指令或已有任务')
    task = await createAndPlanAiTask(user, { command, skillId: input.skillId, params: input.params, workflow: input.workflow, idempotencyKey: `collaboration:${user.id}:${randomUUID()}` })
  }
  const roomId = randomUUID(); const title = input.title?.trim().slice(0, 220) || `${task.title} · 多 Agent 合议室`; const objective = input.objective?.trim().slice(0, 2_000) || task.command
  const result = await getPostgresPool().query(
    `INSERT INTO ai_collaboration_rooms(id,school_id,task_id,title,objective,status,owner_user_id,created_by,metadata)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT(school_id,task_id) DO UPDATE SET updated_at=now() RETURNING id`,
    [roomId, schoolId, task.id, title, objective, roomStatus(task), task.ownerUserId, user.id, JSON.stringify({ source: input.taskId ? 'attached_task' : 'collaboration_dispatch', governedRuntime: true })],
  )
  const storedRoomId = String(result.rows[0].id)
  await syncRoom(task, storedRoomId)
  return getCollaborationRoom(user, storedRoomId)
}

export async function getCollaborationRoom(user: User, roomId: string): Promise<CollaborationRoomDetail> {
  const row = await roomRow(user, roomId)
  const task = await getAccessibleAiTask(user, String(row.task_id)); await syncRoom(task, roomId)
  const product = toAiProductTask(task)
  const [notes, deliverables] = await Promise.all([
    getPostgresPool().query(`SELECT * FROM ai_collaboration_notes WHERE room_id=$1::uuid AND school_id=$2::uuid ORDER BY created_at`, [roomId, task.schoolId]),
    getPostgresPool().query(`SELECT * FROM ai_collaboration_deliverables WHERE room_id=$1::uuid AND school_id=$2::uuid ORDER BY created_at`, [roomId, task.schoolId]),
  ])
  const timeline: CollaborationTimelineItem[] = [
    ...product.messages.map((message) => ({ id: message.id, source: message.agentId === user.id || message.agentId === 'human' ? 'human' as const : 'agent' as const, senderId: message.agentId, senderName: message.agentName, avatar: message.agentAvatar, type: message.type, content: message.content, nodeId: typeof message.data?.nodeId === 'string' ? message.data.nodeId : undefined, createdAt: message.createdAt })),
    ...notes.rows.map((note) => ({ id: String(note.id), source: 'human' as const, senderId: String(note.author_user_id), senderName: String(note.author_name), avatar: '人', type: String(note.note_type), content: String(note.content), nodeId: note.node_id ? String(note.node_id) : undefined, createdAt: iso(note.created_at) ?? new Date(0).toISOString() })),
  ].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  const membersById = new Map(product.nodes.map((node) => [`${node.agent.id}:${node.agent.name}`, { id: `${node.agent.id}:${node.id}`, name: node.agent.name, avatar: node.agent.avatar, role: node.skillId, state: node.state, currentWork: node.title }]))
  const summary: CollaborationRoomSummary = { id: roomId, taskId: task.id, title: String(row.title), objective: String(row.objective), status: roomStatus(task), ownerName: String(row.owner_name), taskState: task.state, nodeCount: product.nodes.length, messageCount: timeline.length, acceptedDeliverables: deliverables.rows.filter((item) => item.status === 'ACCEPTED').length, totalDeliverables: deliverables.rows.length, updatedAt: task.updatedAt }
  return {
    ...summary, command: task.command, riskLevel: task.riskLevel, approval: { status: product.approval.status, policy: product.approval.policy, requiredCount: product.approval.requiredCount, approvedCount: product.approval.approvedCount }, summary: task.summary,
    members: [...membersById.values()], timeline,
    deliverables: deliverables.rows.map((item) => ({ id: String(item.id), nodeId: String(item.node_id), title: String(item.title), ownerAgentId: String(item.owner_agent_id), ownerAgentName: String(item.owner_agent_name), status: item.status as CollaborationDeliverable['status'], summary: String(item.summary), evidenceCount: Array.isArray(item.evidence_refs) ? item.evidence_refs.length : 0, acceptedAt: iso(item.accepted_at) })),
  }
}

export async function addCollaborationNote(user: User, roomId: string, content: string, noteType: 'NOTE' | 'CLARIFICATION' | 'DECISION_CONTEXT' | 'ACCEPTANCE' = 'NOTE', nodeId?: string): Promise<CollaborationRoomDetail> {
  const row = await roomRow(user, roomId); const value = content.trim()
  if (value.length < 2 || value.length > 2_000) throw new CollaborationError('INVALID_REQUEST', '协作内容必须为 2-2000 个字符')
  await getPostgresPool().query(`INSERT INTO ai_collaboration_notes(school_id,room_id,author_user_id,author_name,note_type,content,content_hash,node_id) VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8)`, [row.school_id, roomId, user.id, user.name, noteType, value, hash(value), nodeId ?? null])
  return getCollaborationRoom(user, roomId)
}

export async function decideCollaborationRoom(user: User, roomId: string, decision: 'approve' | 'reject', reason?: string): Promise<CollaborationRoomDetail> {
  const row = await roomRow(user, roomId); const task = await decideAiTask(user, String(row.task_id), decision, reason)
  await syncRoom(task, roomId)
  return getCollaborationRoom(user, roomId)
}

export async function acceptCollaborationDeliverable(user: User, roomId: string, deliverableId: string): Promise<CollaborationRoomDetail> {
  const row = await roomRow(user, roomId); const task = await getAccessibleAiTask(user, String(row.task_id))
  const selected = await getPostgresPool().query(`SELECT * FROM ai_collaboration_deliverables WHERE id=$1::uuid AND room_id=$2::uuid AND school_id=$3::uuid`, [deliverableId, roomId, row.school_id])
  if (!selected.rows[0]) throw new CollaborationError('NOT_FOUND', '交付物不存在')
  const node = task.nodes.find((item) => item.id === selected.rows[0].node_id)
  const verification = node?.output?.verification
  if (!node || node.state !== 'COMPLETED' || !verification || typeof verification !== 'object' || Array.isArray(verification) || (verification as Record<string, unknown>).verified !== true) throw new CollaborationError('CONFLICT', '只有完成业务回读验证的成果才可验收')
  await getPostgresPool().query(`UPDATE ai_collaboration_deliverables SET status='ACCEPTED',accepted_by=$3,accepted_at=now(),updated_at=now() WHERE id=$1::uuid AND room_id=$2::uuid`, [deliverableId, roomId, user.id])
  return getCollaborationRoom(user, roomId)
}
