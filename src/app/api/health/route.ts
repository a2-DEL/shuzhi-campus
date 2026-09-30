import { NextResponse } from 'next/server'
import { assertAuthConfiguration, AuthConfigurationError } from '@/lib/auth-session'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { isGovernedDeepSeekConfigured, getGovernedModelReadiness } from '@/lib/ai/model-gateway/service'

export async function GET(): Promise<NextResponse> {
  try {
    assertAuthConfiguration()
    if (!hasPostgresDatabaseUrl()) throw new Error('PostgreSQL unavailable')
    const pool = getPostgresPool()
    const state = await pool.query<{ knowledge_ready: boolean; tenant_id: string | null }>(
      `WITH tenant AS (SELECT school_id FROM ai_runtime_settings WHERE primary_provider='deepseek'
         AND route_mode IN ('external_preferred','hybrid_fail_closed') ORDER BY school_id LIMIT 1)
       SELECT EXISTS(SELECT 1 FROM ai_knowledge_documents d JOIN ai_knowledge_bases b ON b.id=d.knowledge_base_id
         WHERE d.status='PUBLISHED' AND b.status='ACTIVE' AND d.school_id=(SELECT school_id FROM tenant)) AS knowledge_ready,
         (SELECT school_id FROM tenant) AS tenant_id`,
    )
    const configured = isGovernedDeepSeekConfigured()
    const model = configured && state.rows[0]?.tenant_id
      ? await getGovernedModelReadiness(state.rows[0].tenant_id) : { ready: false, configured, circuitOpen: false }
    const modules = { executionReady: true, modelReady: model.ready, knowledgeReady: Boolean(state.rows[0]?.knowledge_ready) }
    return NextResponse.json({ status: modules.modelReady && modules.knowledgeReady ? 'ready' : 'partial', modules },
      { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AuthConfigurationError) console.error('[readiness] AUTH_SECRET validation failed:', error.message)
    return NextResponse.json({ status: 'not_ready', modules: { executionReady: false, modelReady: false, knowledgeReady: false }, code: error instanceof AuthConfigurationError ? 'AUTH_CONFIGURATION_ERROR' : 'DATABASE_UNAVAILABLE' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
