import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import type { AiSystemReadiness } from '@/lib/ai/product-types'
import { hasSupabaseAdminCredentials, loadEnv } from '@/storage/database/supabase-client'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { getGovernedModelReadiness } from '@/lib/ai/model-gateway/service'

const REQUIRED_MIGRATIONS = [
  '0001_identity_tenancy.sql',
  '0002_ai_runtime.sql',
  '0003_skill_gateway_domains.sql',
  '0004_ai_skill_postgres_fixes.sql',
  '0005_ai_operations_feedback.sql',
  '0006_enterprise_operations.sql',
  '0007_deepseek_model_gateway.sql',
  '0008_enterprise_knowledge_rag.sql',
  '0009_visual_workflows.sql',
  '0010_plugins_mcp_control_plane.sql',
  '0011_multi_agent_collaboration.sql',
  '0012_governed_self_evolution.sql',
  '0013_digital_twin_multimodal_federation.sql',
  '0014_repair_policy_guard.sql',
  '0015_baize_conversations.sql',
  '0016_baize_tool_invocations.sql',
  '0017_baize_memory_safety.sql',
  '0018_baize_query_audit.sql',
]

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ success: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }, { status: 401 })
  loadEnv()
  const postgres = hasPostgresDatabaseUrl()
  // The legacy Supabase readiness branch remains development-only; production business is PG-only.
  const supabase = process.env.NODE_ENV !== 'production' && !postgres && hasSupabaseAdminCredentials()

  let executionReady = false
  let message = '未配置真实业务数据库；仅允许规划，业务执行失败关闭且不会伪造成功。'
  if (postgres && user.school_id) {
    try {
      const result = await getPostgresPool().query<{
        migrations: string[]
        users: number
        bindings: number
        skills: number
      }>(
        `SELECT
          ARRAY(SELECT name FROM schema_migrations WHERE name=ANY($1::text[]) ORDER BY name) AS migrations,
          (SELECT count(*)::int FROM users WHERE school_id=$2::uuid AND status='active' AND NOT is_deleted) AS users,
          (SELECT count(*)::int FROM skill_bindings WHERE school_id=$2::uuid AND enabled) AS bindings,
          (SELECT count(*)::int FROM skill_versions WHERE status='published') AS skills`,
        [REQUIRED_MIGRATIONS, user.school_id]
      )
      const state = result.rows[0]
      const missing = REQUIRED_MIGRATIONS.filter((migration) => !state.migrations.includes(migration))
      executionReady = missing.length === 0 && state.users > 0 && state.bindings > 0 && state.skills === 9
      message = executionReady
        ? `PostgreSQL \u5df2\u5c31\u7eea\uff1a${state.migrations.length} \u4e2a\u8fc1\u79fb\u3001${state.users} \u4e2a\u79df\u6237\u7528\u6237\u3001${state.bindings} \u4e2a Skill \u7ed1\u5b9a\u3001${state.skills} \u4e2a\u5df2\u53d1\u5e03\u6b63\u5f0f Skill\u3002`
        : `PostgreSQL \u5df2\u8fde\u63a5\u4f46\u9a8c\u6536\u672a\u901a\u8fc7\uff1a\u7f3a\u5931\u8fc1\u79fb ${missing.join('\u3001') || '\u65e0'}\uff0c\u79df\u6237\u7528\u6237 ${state.users}\uff0cSkill \u7ed1\u5b9a ${state.bindings}\uff0c\u5df2\u53d1\u5e03 Skill ${state.skills}\u3002`
    } catch (error) {
      message = `PostgreSQL \u5df2\u914d\u7f6e\u4f46\u5065\u5eb7\u68c0\u67e5\u5931\u8d25\uff1a${error instanceof Error ? error.message : 'unknown error'}`
    }
  } else if (supabase) {
    executionReady = true
    message = 'Supabase service-role 已配置；业务执行将使用租户隔离的持久化 Skill Gateway。'
  }

  const model = user.school_id ? await getGovernedModelReadiness(user.school_id) : { configured: false, ready: false, circuitOpen: false }
  let publishedKnowledgeDocuments = 0
  if (postgres && user.school_id) {
    try {
      const documents = await getPostgresPool().query<{ count: number }>(
        "SELECT count(*)::int AS count FROM ai_knowledge_documents d JOIN ai_knowledge_bases b ON b.id=d.knowledge_base_id AND b.school_id=d.school_id AND b.status='ACTIVE' WHERE d.school_id=$1::uuid AND d.status='PUBLISHED'",
        [user.school_id],
      )
      publishedKnowledgeDocuments = documents.rows[0]?.count ?? 0
    } catch { /* Missing knowledge migration is not readiness. */ }
  }
  const readiness: AiSystemReadiness = {
    runtimeRepository: postgres ? 'postgres' : supabase ? 'supabase' : 'development_memory',
    businessPort: postgres ? 'postgres' : supabase ? 'supabase' : 'unconfigured',
    databaseConfigured: supabase || postgres,
    migrationsRequired: REQUIRED_MIGRATIONS,
    executionReady,
    modelConfigured: model.configured,
    modelReady: model.ready,
    modelCircuitOpen: model.circuitOpen,
    modelProbeAt: model.lastProbeAt,
    knowledgeReady: publishedKnowledgeDocuments > 0,
    publishedKnowledgeDocuments,
    failClosed: true,
    message,
  }
  return NextResponse.json({ success: true, data: readiness })
}
