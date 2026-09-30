import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { AI_RUNTIME_TABLES } from '@/storage/database/schema/ai-runtime'

async function main(): Promise<void> {
  const migration = await readFile(path.resolve(process.cwd(), 'drizzle/0002_ai_runtime.sql'), 'utf8')
  const schema = await readFile(path.resolve(process.cwd(), 'src/storage/database/schema/ai-runtime.ts'), 'utf8')
  const tables = [
    'ai_task_runs', 'ai_task_nodes', 'ai_task_dependencies', 'ai_task_observations',
    'ai_agent_messages', 'ai_approval_requests', 'ai_approval_decisions',
    'ai_tool_invocations', 'ai_business_effects', 'ai_trace_links',
    'ai_audit_events', 'ai_outbox_events',
  ]
  const functions = [
    'ai_sync_task_projections', 'ai_create_task_run', 'ai_update_task_run',
    'ai_claim_recoverable_task', 'ai_renew_task_lease',
    'ai_claim_outbox_events', 'ai_complete_outbox_event',
  ]
  for (const table of tables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `missing table ${table}`)
    assert.match(schema, new RegExp(`pgTable\\('${table}'`), `missing Drizzle table ${table}`)
  }
  for (const fn of functions) assert.match(migration, new RegExp(`FUNCTION ${fn}`), `missing function ${fn}`)
  assert.equal(AI_RUNTIME_TABLES.length, tables.length)
  assert.match(migration, /UNIQUE \(school_id, owner_user_id, idempotency_key\)/)
  assert.match(migration, /version = p_expected_version/)
  assert.match(migration, /ai_task_version_conflict/)
  assert.match(migration, /FOR UPDATE SKIP LOCKED/)
  assert.match(migration, /ON CONFLICT \(task_id, id\) DO UPDATE SET/)
  assert.doesNotMatch(migration, /DELETE FROM ai_task_nodes/)
  assert.match(migration, /lease_token uuid/)
  assert.match(migration, /dead_lettered_at timestamptz/)
  assert.match(migration, /retry_eligible boolean NOT NULL DEFAULT false/)
  assert.match(migration, /state <> 'FAILED' OR retry_eligible/)
  assert.match(migration, /task\.dead_lettered/)
  assert.match(migration, /ai_outbox_events/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON TABLE/)
  assert.match(migration, /TO service_role/)
  assert.doesNotMatch(migration, /USING\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(migration, /GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL).*TO\s+(anon|authenticated)/i)
  assert.match(schema, /AI_RUNTIME_HAS_TRANSACTIONAL_OUTBOX = true/)
  assert.match(schema, /AI_RUNTIME_USES_OPTIMISTIC_VERSIONING = true/)
  assert.match(schema, /AI_RUNTIME_USES_RECOVERY_LEASES = true/)
  console.log(`PASS AI runtime migration contract: tables=${tables.length} functions=${functions.length} RLS=fail-closed outbox=transactional`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
