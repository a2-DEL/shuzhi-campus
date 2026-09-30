import { randomUUID } from 'node:crypto'
import { getPostgresPool } from '@/storage/database/postgres'
import type { User } from '@/types'
import type { BaizeConversationTurn } from './conversation'

export interface BaizeConversation {
  id: string
  title: string
  createdAt: string
  lastActiveAt: string
  summary?: string
}

export interface BaizeMessage extends BaizeConversationTurn {
  id: string
  createdAt: string
  inputTokens: number
  outputTokens: number
  modelVersion?: string
  toolSnapshot: Record<string, unknown>
}

export interface BaizeMemoryEntity {
  type: 'repair' | 'dormitory' | 'classroom' | 'lost_found' | 'duty' | 'visitor' | 'energy'
  key: string
  status?: string
}

export class BaizeMemoryError extends Error {
  constructor(readonly code: 'NOT_FOUND' | 'UNAVAILABLE', message: string) {
    super(message)
    this.name = 'BaizeMemoryError'
  }
}

function owner(user: User): [string, string] {
  if (!user.school_id) throw new BaizeMemoryError('NOT_FOUND', '当前身份未绑定学校')
  return [user.school_id, user.id]
}

interface ConversationRow { id: string; title: string; summary: string | null; created_at: Date; last_active_at: Date }
interface MessageRow { id: string; role: 'user' | 'assistant'; content: string; created_at: Date; input_tokens: number; output_tokens: number; model_version: string | null; tool_snapshot: Record<string, unknown> }

function conversation(row: ConversationRow): BaizeConversation {
  return { id: row.id, title: row.title, summary: row.summary ?? undefined, createdAt: row.created_at.toISOString(), lastActiveAt: row.last_active_at.toISOString() }
}

function message(row: MessageRow): BaizeMessage {
  return {
    id: row.id, role: row.role, content: row.content, createdAt: row.created_at.toISOString(),
    inputTokens: row.input_tokens, outputTokens: row.output_tokens,
    modelVersion: row.model_version ?? undefined, toolSnapshot: row.tool_snapshot,
  }
}

export async function createBaizeConversation(user: User): Promise<BaizeConversation> {
  const [schoolId, userId] = owner(user)
  const result = await getPostgresPool().query<ConversationRow>(
    `INSERT INTO baize_conversations(school_id,user_id) VALUES($1::uuid,$2) RETURNING id,title,summary,created_at,last_active_at`,
    [schoolId, userId],
  )
  return conversation(result.rows[0])
}

export async function listBaizeConversations(user: User): Promise<BaizeConversation[]> {
  const [schoolId, userId] = owner(user)
  const result = await getPostgresPool().query<ConversationRow>(
    `SELECT id,title,summary,created_at,last_active_at FROM baize_conversations
     WHERE school_id=$1::uuid AND user_id=$2 ORDER BY last_active_at DESC LIMIT 50`,
    [schoolId, userId],
  )
  return result.rows.map(conversation)
}

export async function getBaizeConversation(user: User, id: string): Promise<BaizeConversation> {
  const [schoolId, userId] = owner(user)
  const result = await getPostgresPool().query<ConversationRow>(
    `SELECT id,title,summary,created_at,last_active_at FROM baize_conversations WHERE id=$1::uuid AND school_id=$2::uuid AND user_id=$3`,
    [id, schoolId, userId],
  )
  if (!result.rows[0]) throw new BaizeMemoryError('NOT_FOUND', '会话不存在或无权访问')
  return conversation(result.rows[0])
}

export async function renameBaizeConversation(user: User, id: string, title: string): Promise<BaizeConversation> {
  const [schoolId, userId] = owner(user)
  const result = await getPostgresPool().query<ConversationRow>(
    `UPDATE baize_conversations SET title=$4,updated_at=now() WHERE id=$1::uuid AND school_id=$2::uuid AND user_id=$3
     RETURNING id,title,summary,created_at,last_active_at`,
    [id, schoolId, userId, title],
  )
  if (!result.rows[0]) throw new BaizeMemoryError('NOT_FOUND', '会话不存在或无权访问')
  return conversation(result.rows[0])
}

export async function deleteBaizeConversation(user: User, id: string): Promise<void> {
  const [schoolId, userId] = owner(user)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `DELETE FROM baize_conversations WHERE id=$1::uuid AND school_id=$2::uuid AND user_id=$3`,
      [id, schoolId, userId],
    )
    if (!result.rowCount) throw new BaizeMemoryError('NOT_FOUND', '会话不存在或无权访问')
    // A deleted conversation must not leave orphaned cross-session entity memories behind.
    await client.query(
      `DELETE FROM baize_user_entity_index idx WHERE idx.school_id=$1::uuid AND idx.user_id=$2
       AND NOT EXISTS (SELECT 1 FROM baize_memory_entities e WHERE e.school_id=idx.school_id
         AND e.user_id=idx.user_id AND e.entity_type=idx.entity_type AND e.entity_key=idx.entity_key)`,
      [schoolId, userId],
    )
    await client.query(
      `UPDATE baize_user_entity_index idx SET mention_count=linked.count,last_seen_at=linked.last_seen
       FROM (SELECT entity_type,entity_key,count(*)::int AS count,max(last_seen_at) AS last_seen
             FROM baize_memory_entities WHERE school_id=$1::uuid AND user_id=$2
             GROUP BY entity_type,entity_key) linked
       WHERE idx.school_id=$1::uuid AND idx.user_id=$2
         AND idx.entity_type=linked.entity_type AND idx.entity_key=linked.entity_key`,
      [schoolId, userId],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

export async function listBaizeMessages(user: User, id: string, limit = 100): Promise<BaizeMessage[]> {
  const [schoolId, userId] = owner(user)
  await getBaizeConversation(user, id)
  const result = await getPostgresPool().query<MessageRow>(
    `SELECT id,role,content,created_at,input_tokens,output_tokens,model_version,tool_snapshot FROM (
       SELECT id,role,content,created_at,input_tokens,output_tokens,model_version,tool_snapshot
       FROM baize_messages WHERE school_id=$1::uuid AND user_id=$2 AND conversation_id=$3::uuid
       ORDER BY created_at DESC,id DESC LIMIT $4
     ) recent ORDER BY created_at,id`,
    [schoolId, userId, id, Math.min(Math.max(limit, 1), 200)],
  )
  return result.rows.map(message)
}

export async function appendBaizeMessage(
  user: User, conversationId: string, turn: BaizeConversationTurn,
  details: { id?: string; inputTokens?: number; outputTokens?: number; modelVersion?: string; toolSnapshot?: Record<string, unknown> } = {},
): Promise<BaizeMessage> {
  const [schoolId, userId] = owner(user)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query(
      `UPDATE baize_conversations SET updated_at=now(),last_active_at=now()
       WHERE id=$1::uuid AND school_id=$2::uuid AND user_id=$3 RETURNING id`,
      [conversationId, schoolId, userId],
    )
    if (!updated.rowCount) throw new BaizeMemoryError('NOT_FOUND', '会话不存在或无权访问')
    const inserted = await client.query<MessageRow>(
      `INSERT INTO baize_messages(id,conversation_id,school_id,user_id,role,content,input_tokens,output_tokens,model_version,tool_snapshot)
       VALUES($10::uuid,$1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8,$9::jsonb)
       RETURNING id,role,content,created_at,input_tokens,output_tokens,model_version,tool_snapshot`,
      [conversationId, schoolId, userId, turn.role, turn.content,
        details.inputTokens ?? 0, details.outputTokens ?? 0, details.modelVersion ?? null,
        JSON.stringify(details.toolSnapshot ?? {}), details.id ?? randomUUID()],
    )
    await client.query('COMMIT')
    return message(inserted.rows[0])
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function loadBaizeEntities(user: User, limit = 12): Promise<BaizeMemoryEntity[]> {
  const [schoolId, userId] = owner(user)
  const result = await getPostgresPool().query<{ entity_type: BaizeMemoryEntity['type']; entity_key: string; entity_status: string | null }>(
    `SELECT entity_type,entity_key,entity_status FROM baize_user_entity_index
     WHERE school_id=$1::uuid AND user_id=$2 ORDER BY last_seen_at DESC LIMIT $3`,
    [schoolId, userId, Math.min(Math.max(limit, 1), 20)],
  )
  return result.rows.map((row) => ({ type: row.entity_type, key: row.entity_key, status: row.entity_status ?? undefined }))
}

/** Stable, non-sensitive summary; never treat historical model text as verified business facts. */
export async function summarizeBaizeConversation(user: User, id: string): Promise<string | undefined> {
  const [schoolId, userId] = owner(user)
  await getBaizeConversation(user, id)
  const stats = await getPostgresPool().query<{ count: number; characters: number }>(
    `SELECT count(*)::int AS count,coalesce(sum(char_length(content)),0)::int AS characters
     FROM baize_messages WHERE school_id=$1::uuid AND user_id=$2 AND conversation_id=$3::uuid`,
    [schoolId, userId, id],
  )
  const { count, characters } = stats.rows[0]
  // 70% of the governed gateway's 48k character context; 20 messages wins first for normal chat.
  if (count < 20 && characters < 33_600) return undefined
  const entities = await getPostgresPool().query<{ entity_type: string; entity_key: string }>(
    `SELECT entity_type,entity_key FROM baize_memory_entities
     WHERE school_id=$1::uuid AND user_id=$2 AND conversation_id=$3::uuid
     ORDER BY last_seen_at DESC LIMIT 4`, [schoolId, userId, id],
  )
  const indexes = entities.rows.map((item) => `${item.entity_type}:${item.entity_key.slice(0, 24)}`).join('、')
  const summary = `本会话交流${count}条；${indexes ? `已核验资源索引${indexes}；` : ''}业务状态需重新鉴权查询。`.slice(0, 100)
  await getPostgresPool().query(
    `UPDATE baize_conversations SET summary=$4,updated_at=now()
     WHERE id=$1::uuid AND school_id=$2::uuid AND user_id=$3`, [id, schoolId, userId, summary],
  )
  return summary
}

export async function rememberVerifiedEntity(user: User, conversationId: string, entity: BaizeMemoryEntity): Promise<void> {
  const [schoolId, userId] = owner(user)
  const client = await getPostgresPool().connect()
  try {
    await client.query('BEGIN')
    const linked = await client.query(
      `INSERT INTO baize_memory_entities(school_id,user_id,conversation_id,entity_type,entity_key,entity_status)
       SELECT $1::uuid,$2::varchar(36),id,$4::varchar(40),$5::varchar(120),$6::varchar(40) FROM baize_conversations
       WHERE id=$3::uuid AND school_id=$1::uuid AND user_id=$2::varchar(36)
       ON CONFLICT (school_id,user_id,conversation_id,entity_type,entity_key)
       DO UPDATE SET entity_status=EXCLUDED.entity_status,last_seen_at=now() RETURNING id`,
      [schoolId, userId, conversationId, entity.type, entity.key, entity.status ?? null],
    )
    if (!linked.rowCount) throw new BaizeMemoryError('NOT_FOUND', '会话不存在或无权访问')
    await client.query(
      `INSERT INTO baize_user_entity_index(school_id,user_id,entity_type,entity_key,entity_status)
       VALUES($1::uuid,$2,$3,$4,$5)
       ON CONFLICT (school_id,user_id,entity_type,entity_key) DO UPDATE SET
       entity_status=EXCLUDED.entity_status,mention_count=baize_user_entity_index.mention_count+1,last_seen_at=now()`,
      [schoolId, userId, entity.type, entity.key, entity.status ?? null],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}
