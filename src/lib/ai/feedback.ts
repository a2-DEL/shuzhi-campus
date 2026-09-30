import { randomUUID } from 'node:crypto'
import { getAccessibleAiTask } from '@/lib/ai/runtime/orchestrator'
import { isAiOperationsAdmin } from '@/lib/ai/operations/access'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import type { User } from '@/types'

export type AiFeedbackOutcome = 'helpful' | 'needs_follow_up' | 'unsafe' | 'incorrect'
export type AiFeedbackStatus = 'new' | 'reviewed' | 'applied' | 'dismissed'

export interface AiFeedbackRecord {
  id: string
  taskId: string
  taskTitle: string
  userId: string
  userName: string
  rating: number
  outcome: AiFeedbackOutcome
  comment?: string
  status: AiFeedbackStatus
  reviewedByName?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface AiFeedbackReport {
  persistent: boolean
  records: AiFeedbackRecord[]
  summary: {
    total: number
    averageRating: number
    helpful: number
    needsFollowUp: number
    unsafe: number
    incorrect: number
    newItems: number
  }
}

export class AiFeedbackError extends Error {
  constructor(readonly code: 'TENANT_REQUIRED' | 'TASK_NOT_READY' | 'NOT_FOUND' | 'FORBIDDEN' | 'FEEDBACK_UNAVAILABLE', message: string) {
    super(message)
    this.name = 'AiFeedbackError'
  }
}

type MemoryState = Map<string, AiFeedbackRecord>
type FeedbackGlobal = typeof globalThis & { __SHUZHI_AI_FEEDBACK__?: MemoryState }

function memoryState(): MemoryState {
  const runtime = globalThis as FeedbackGlobal
  runtime.__SHUZHI_AI_FEEDBACK__ ??= new Map()
  return runtime.__SHUZHI_AI_FEEDBACK__
}

function memoryKey(schoolId: string, taskId: string, userId: string): string {
  return `${schoolId}:${taskId}:${userId}`
}

function timestamp(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : new Date(0).toISOString()
}

function summarize(records: AiFeedbackRecord[]): AiFeedbackReport['summary'] {
  const total = records.length
  return {
    total,
    averageRating: total > 0 ? Number((records.reduce((sum, item) => sum + item.rating, 0) / total).toFixed(1)) : 0,
    helpful: records.filter((item) => item.outcome === 'helpful').length,
    needsFollowUp: records.filter((item) => item.outcome === 'needs_follow_up').length,
    unsafe: records.filter((item) => item.outcome === 'unsafe').length,
    incorrect: records.filter((item) => item.outcome === 'incorrect').length,
    newItems: records.filter((item) => item.status === 'new').length,
  }
}

export async function listAiFeedback(user: User): Promise<AiFeedbackReport> {
  if (!user.school_id) throw new AiFeedbackError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  if (!hasPostgresDatabaseUrl()) {
    const records = [...memoryState().values()]
      .filter((item) => isAiOperationsAdmin(user) || item.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { persistent: false, records, summary: summarize(records) }
  }
  try {
    const values: unknown[] = [user.school_id]
    const ownerClause = isAiOperationsAdmin(user) ? '' : ' AND f.user_id=$2'
    if (!isAiOperationsAdmin(user)) values.push(user.id)
    const result = await getPostgresPool().query<{
      id: string
      task_id: string
      task_title: string
      user_id: string
      user_name: string
      rating: number
      outcome: AiFeedbackOutcome
      comment: string | null
      status: AiFeedbackStatus
      reviewed_by_name: string | null
      reviewed_at: Date | string | null
      created_at: Date | string
      updated_at: Date | string
    }>(
      `SELECT f.id,f.task_id,t.title AS task_title,f.user_id,u.name AS user_name,f.rating,f.outcome,f.comment,f.status,
        reviewer.name AS reviewed_by_name,f.reviewed_at,f.created_at,f.updated_at
       FROM ai_feedback_events f
       JOIN ai_task_runs t ON t.id=f.task_id AND t.school_id=f.school_id
       JOIN users u ON u.id=f.user_id
       LEFT JOIN users reviewer ON reviewer.id=f.reviewed_by
       WHERE f.school_id=$1::uuid${ownerClause}
       ORDER BY f.created_at DESC LIMIT 500`,
      values,
    )
    const records = result.rows.map((row): AiFeedbackRecord => ({
      id: row.id,
      taskId: row.task_id,
      taskTitle: row.task_title,
      userId: row.user_id,
      userName: row.user_name,
      rating: Number(row.rating),
      outcome: row.outcome,
      comment: row.comment ?? undefined,
      status: row.status,
      reviewedByName: row.reviewed_by_name ?? undefined,
      reviewedAt: row.reviewed_at ? timestamp(row.reviewed_at) : undefined,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    }))
    return { persistent: true, records, summary: summarize(records) }
  } catch (error) {
    throw new AiFeedbackError('FEEDBACK_UNAVAILABLE', error instanceof Error ? error.message : '反馈记录读取失败')
  }
}

export async function submitAiFeedback(
  user: User,
  input: { taskId: string; rating: number; outcome: AiFeedbackOutcome; comment?: string },
): Promise<AiFeedbackRecord> {
  if (!user.school_id) throw new AiFeedbackError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  const task = await getAccessibleAiTask(user, input.taskId)
  if (!['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED', 'COMPENSATED'].includes(task.state)) {
    throw new AiFeedbackError('TASK_NOT_READY', '任务尚未形成最终结果，请在白泽归整汇报后再提交反馈')
  }
  const now = new Date().toISOString()
  if (!hasPostgresDatabaseUrl()) {
    const key = memoryKey(user.school_id, task.id, user.id)
    const existing = memoryState().get(key)
    const record: AiFeedbackRecord = {
      id: existing?.id ?? randomUUID(),
      taskId: task.id,
      taskTitle: task.title,
      userId: user.id,
      userName: user.name,
      rating: input.rating,
      outcome: input.outcome,
      comment: input.comment,
      status: 'new',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    memoryState().set(key, record)
    return record
  }
  try {
    const result = await getPostgresPool().query<{
      id: string
      rating: number
      outcome: AiFeedbackOutcome
      comment: string | null
      status: AiFeedbackStatus
      created_at: Date | string
      updated_at: Date | string
    }>(
      `INSERT INTO ai_feedback_events(school_id,task_id,user_id,rating,outcome,comment,status)
       VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,'new')
       ON CONFLICT(school_id,task_id,user_id) DO UPDATE SET rating=EXCLUDED.rating,outcome=EXCLUDED.outcome,
         comment=EXCLUDED.comment,status='new',reviewed_by=NULL,reviewed_at=NULL,updated_at=now()
       RETURNING id,rating,outcome,comment,status,created_at,updated_at`,
      [user.school_id, task.id, user.id, input.rating, input.outcome, input.comment ?? null],
    )
    const row = result.rows[0]
    return {
      id: row.id,
      taskId: task.id,
      taskTitle: task.title,
      userId: user.id,
      userName: user.name,
      rating: Number(row.rating),
      outcome: row.outcome,
      comment: row.comment ?? undefined,
      status: row.status,
      createdAt: timestamp(row.created_at),
      updatedAt: timestamp(row.updated_at),
    }
  } catch (error) {
    throw new AiFeedbackError('FEEDBACK_UNAVAILABLE', error instanceof Error ? error.message : '反馈写入失败')
  }
}

export async function reviewAiFeedback(user: User, feedbackId: string, status: AiFeedbackStatus): Promise<AiFeedbackRecord> {
  if (!user.school_id) throw new AiFeedbackError('TENANT_REQUIRED', '当前身份没有绑定学校租户')
  if (!isAiOperationsAdmin(user)) throw new AiFeedbackError('FORBIDDEN', '只有 AI 系统运维管理员可以审核反馈样本')
  if (!hasPostgresDatabaseUrl()) {
    const found = [...memoryState().entries()].find(([, item]) => item.id === feedbackId)
    if (!found) throw new AiFeedbackError('NOT_FOUND', '反馈记录不存在')
    const [key, record] = found
    const updated = { ...record, status, reviewedByName: user.name, reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
    memoryState().set(key, updated)
    return updated
  }
  try {
    const result = await getPostgresPool().query<{ id: string }>(
      `UPDATE ai_feedback_events SET status=$1,reviewed_by=$2,reviewed_at=now(),updated_at=now()
       WHERE id=$3::uuid AND school_id=$4::uuid RETURNING id`,
      [status, user.id, feedbackId, user.school_id],
    )
    if (!result.rows[0]) throw new AiFeedbackError('NOT_FOUND', '反馈记录不存在')
    const report = await listAiFeedback(user)
    const record = report.records.find((item) => item.id === feedbackId)
    if (!record) throw new AiFeedbackError('NOT_FOUND', '反馈记录不存在')
    return record
  } catch (error) {
    if (error instanceof AiFeedbackError) throw error
    throw new AiFeedbackError('FEEDBACK_UNAVAILABLE', error instanceof Error ? error.message : '反馈审核失败')
  }
}
