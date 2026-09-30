import './assert-isolated-test-environment.mjs'
import { createHash } from 'node:crypto'
import { config as loadDotEnv } from 'dotenv'
import { createCollaborationRoom } from '@/lib/ai/platform/collaboration'
import { getDevelopmentUser } from '@/lib/development-users'
import { getPostgresPool } from '@/storage/database/postgres'

async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true }); loadDotEnv({ quiet: true })
  const user = getDevelopmentUser('admin'); if (!user) throw new Error('development admin is unavailable')
  const selected = await getPostgresPool().query(`SELECT t.id FROM ai_task_runs t WHERE t.school_id=$1::uuid AND t.state='COMPLETED' AND (SELECT count(*) FROM ai_task_nodes n WHERE n.task_id=t.id)>=3 ORDER BY t.updated_at DESC LIMIT 1`, [user.school_id])
  if (!selected.rows[0]) throw new Error('completed multi-Agent showcase task is unavailable')
  const room = await createCollaborationRoom(user, { taskId: selected.rows[0].id, title: '数智校园创新论坛 · 白泽联合办公区', objective: '跨教学空间、访客准入与消息触达三个 Agent 团队，核验活动保障成果并完成联合验收。' })
  const note = '项目负责人补充：所有嘉宾准入与师生通知必须保留回读证据，场地变更需要同步备用方案。'
  await getPostgresPool().query(`INSERT INTO ai_collaboration_notes(id,school_id,room_id,author_user_id,author_name,note_type,content,content_hash) VALUES('73000000-0000-4000-8000-000000000001'::uuid,$1::uuid,$2::uuid,$3,$4,'ACCEPTANCE',$5,$6) ON CONFLICT(id) DO UPDATE SET room_id=EXCLUDED.room_id,content=EXCLUDED.content,content_hash=EXCLUDED.content_hash`, [user.school_id, room.id, user.id, user.name, note, createHash('sha256').update(note,'utf8').digest('hex')])
  await getPostgresPool().query(`UPDATE ai_collaboration_deliverables SET status='ACCEPTED',accepted_by=$2,accepted_at=COALESCE(accepted_at,now()),updated_at=now() WHERE room_id=$1::uuid AND node_id IN ('node-1','node-2') AND status IN ('READY_FOR_REVIEW','ACCEPTED')`, [room.id, user.id])
  console.log(`PASS collaboration showcase seed: rooms=1 agents=${room.members.length} deliverables=${room.deliverables.length}`)
}
main().catch((error)=>{console.error(error);process.exit(1)})
