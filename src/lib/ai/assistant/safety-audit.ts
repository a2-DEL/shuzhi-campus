import { createHash } from 'node:crypto'
import type { User } from '@/types'
import { getPostgresPool } from '@/storage/database/postgres'

export type BaizeSafetyDirection = 'INPUT' | 'OUTPUT' | 'TOOL'
export interface BaizeSafetyEvent {
  id: string
  direction: BaizeSafetyDirection
  reason: string
  summary: string
  createdAt: string
}

/** Do not store raw prompts, sensitive output, phone numbers or secrets in the event ledger. */
export async function recordBaizeSafetyEvent(
  user: User, direction: BaizeSafetyDirection, reason: string, content: string, conversationId?: string,
): Promise<void> {
  if (!user.school_id) throw new Error('Tenant binding required for safety audit')
  await getPostgresPool().query(
    `INSERT INTO baize_safety_events(school_id,user_id,conversation_id,reason,direction,content_hash,summary)
     VALUES($1::uuid,$2,$3::uuid,$4,$5,$6,$7)`, [user.school_id, user.id, conversationId ?? null,
      reason.slice(0, 48), direction, createHash('sha256').update(content).digest('hex'),
      `白泽${direction === 'INPUT' ? '输入拦截' : direction === 'OUTPUT' ? '输出脱敏' : '工具拒绝'}：${reason}`.slice(0, 160)],
  )
}

export async function listBaizeSafetyEvents(user: User, since?: string): Promise<BaizeSafetyEvent[]> {
  if (!user.school_id) return []
  const records = await getPostgresPool().query<{ id: string; direction: BaizeSafetyDirection; reason: string; summary: string; created_at: Date }>(
    `SELECT id,direction,reason,summary,created_at FROM baize_safety_events
     WHERE school_id=$1::uuid AND user_id=$2 AND ($3::timestamptz IS NULL OR created_at >= $3::timestamptz)
     ORDER BY created_at DESC LIMIT 100`, [user.school_id, user.id, since ?? null],
  )
  return records.rows.map((row) => ({ id: row.id, direction: row.direction, reason: row.reason,
    summary: row.summary, createdAt: row.created_at.toISOString() }))
}
