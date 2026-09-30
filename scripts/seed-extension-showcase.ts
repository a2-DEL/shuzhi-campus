import './assert-isolated-test-environment.mjs'
import { createHash } from 'node:crypto'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import { DEVELOPMENT_SCHOOL_ID } from '@/lib/development-users'

const PLUGIN_ID = '71000000-0000-4000-8000-000000000001'
const MCP_ID = '72000000-0000-4000-8000-000000000001'
const manifest = {
  summary: '面向校园后勤与消息触达的声明式白泽插件；只绑定已发布 Skill，不携带可执行脚本。',
  capabilities: [
    { id: 'repair-dispatch', name: '报修智能派单', description: '从真实待派工单和维修人员负载中形成受控派单预览。', skillId: 'repair_dispatch' },
    { id: 'campus-notify', name: '校园消息触达', description: '由服务端解析受众并创建可追踪通知与回执任务。', skillId: 'notification_publish' },
  ],
  allowedRoles: ['super_admin', 'logistics_manager', 'logistics_admin'],
}
function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex') }
async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true }); loadDotEnv({ quiet: true })
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`INSERT INTO ai_plugins(id,school_id,slug,name,description,publisher,status,trust_level,current_version,created_by,metadata) VALUES($1::uuid,$2::uuid,'campus-operations-declarative','校园保障协同插件','把派单与消息触达封装为受治理业务能力，不执行任意脚本。','数智星图 Agent 平台组','PUBLISHED','VERIFIED',1,'dev-admin','{"showcaseVersion":"2026.08-platform-v1"}'::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='PUBLISHED',trust_level='VERIFIED',current_version=1,metadata=EXCLUDED.metadata,updated_at=now()`, [PLUGIN_ID, DEVELOPMENT_SCHOOL_ID])
    await client.query(`INSERT INTO ai_plugin_versions(school_id,plugin_id,version_no,manifest,checksum,status,created_by,published_by,published_at) VALUES($1::uuid,$2::uuid,1,$3::jsonb,$4,'PUBLISHED','dev-admin','dev-admin',now()) ON CONFLICT(plugin_id,version_no) DO UPDATE SET manifest=EXCLUDED.manifest,checksum=EXCLUDED.checksum,status='PUBLISHED',published_at=now()`, [DEVELOPMENT_SCHOOL_ID, PLUGIN_ID, JSON.stringify(manifest), digest(manifest)])
    const endpoint = new URL('/api/ai/mcp/internal', process.env.TEST_BASE_URL ?? 'http://localhost:5000').toString()
    await client.query(`INSERT INTO ai_mcp_servers(id,school_id,slug,name,description,endpoint,transport,auth_mode,status,trust_level,config_hash,created_by,metadata) VALUES($1::uuid,$2::uuid,'shuzhi-campus-control-plane','数智星图校园业务 MCP','以标准 JSON-RPC 暴露租户隔离的校园态势、知识资产与工作流摘要。',$3,'STREAMABLE_HTTP','NONE','DRAFT','VERIFIED',$4,'dev-ai_ops','{"showcaseVersion":"2026.08-platform-v1","internal":true}'::jsonb) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,endpoint=EXCLUDED.endpoint,transport=EXCLUDED.transport,auth_mode=EXCLUDED.auth_mode,trust_level='VERIFIED',config_hash=EXCLUDED.config_hash,metadata=EXCLUDED.metadata,updated_at=now()`, [MCP_ID, DEVELOPMENT_SCHOOL_ID, endpoint, digest({ endpoint, transport: 'STREAMABLE_HTTP', authMode: 'NONE' })])
    await client.query('COMMIT')
    console.log('PASS extension showcase seed: plugins=1 mcpServers=1')
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { await client.end() }
}
main().catch((error) => { console.error(error); process.exit(1) })
