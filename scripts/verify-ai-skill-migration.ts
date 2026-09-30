import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ENTERPRISE_SKILL_KEYS } from '@/lib/ai/skills/contracts'
import {
  SKILL_GATEWAY_CONTROL_TABLES,
  SKILL_GATEWAY_DOMAIN_TABLES,
  SKILL_GATEWAY_HAS_NINE_EXPLICIT_ADAPTERS,
  SKILL_GATEWAY_REJECTS_ARBITRARY_SQL_AND_URLS,
} from '@/storage/database/schema/skill-gateway'

async function main(): Promise<void> {
  const migration = await readFile(path.resolve(process.cwd(), 'drizzle/0003_skill_gateway_domains.sql'), 'utf8')
  const extension = await readFile(path.resolve(process.cwd(), 'drizzle/0014_repair_policy_guard.sql'), 'utf8')
  const schema = await readFile(path.resolve(process.cwd(), 'src/storage/database/schema/skill-gateway.ts'), 'utf8')
  const controlTables = ['skill_definitions', 'skill_versions', 'skill_bindings', 'skill_eval_results', 'skill_operation_previews', 'ai_skill_rate_limit_counters']
  const domainTables = ['ai_repair_policy_decisions', 'notification_deliveries', 'class_schedules', 'hygiene_inspections', 'hygiene_rectifications', 'dorm_safety_events', 'iot_readings', 'energy_assets', 'energy_readings', 'maintenance_recommendations']
  const functions = ['prevent_published_skill_version_mutation', 'ai_assert_skill_binding', 'ai_prepare_skill_operation', 'ai_commit_skill_operation', 'ai_verify_skill_effect']

  for (const table of controlTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `missing migration table ${table}`)
    assert.match(schema, new RegExp(`pgTable\\('${table}'`), `missing Drizzle table ${table}`)
  }
  for (const table of domainTables) {
    const source = table === 'ai_repair_policy_decisions' ? extension : migration
    assert.match(source, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `missing migration table ${table}`)
    assert.match(schema, new RegExp(`pgTable\\('${table}'`), `missing Drizzle table ${table}`)
  }
  for (const functionName of functions) assert.match(migration, new RegExp(`FUNCTION ${functionName}\\b`), `missing function ${functionName}`)
  assert.equal(SKILL_GATEWAY_CONTROL_TABLES.length, 6)
  assert.equal(SKILL_GATEWAY_DOMAIN_TABLES.length, 10)
  assert.equal(SKILL_GATEWAY_HAS_NINE_EXPLICIT_ADAPTERS, true)
  assert.equal(SKILL_GATEWAY_REJECTS_ARBITRARY_SQL_AND_URLS, true)

  const prepareStart = migration.indexOf('CREATE OR REPLACE FUNCTION ai_prepare_skill_operation')
  const commitStart = migration.indexOf('CREATE OR REPLACE FUNCTION ai_commit_skill_operation')
  const verifyStart = migration.indexOf('CREATE OR REPLACE FUNCTION ai_verify_skill_effect')
  const prepare = migration.slice(prepareStart, commitStart)
  const commit = migration.slice(commitStart, verifyStart)
  const verify = migration.slice(verifyStart)
  for (const key of ENTERPRISE_SKILL_KEYS.filter((item) => item !== 'repair.policy.guard.v1')) {
    const escaped = key.replaceAll('.', '\\.')
    assert.match(prepare, new RegExp(`WHEN '${escaped}'`), `prepare adapter missing ${key}`)
    assert.match(commit, new RegExp(`WHEN '${escaped}'`), `commit adapter missing ${key}`)
    assert.match(verify, new RegExp(`WHEN '${escaped}'`), `verify adapter missing ${key}`)
  }
  assert.match(extension, /CREATE OR REPLACE FUNCTION ai_prepare_repair_policy_guard/)
  assert.match(extension, /CREATE OR REPLACE FUNCTION ai_commit_repair_policy_guard/)
  assert.match(extension, /CREATE OR REPLACE FUNCTION ai_verify_repair_policy_guard/)
  assert.match(extension, /repair\.policy\.guard\.v1/)
  assert.match(extension, /business_write_occurred boolean NOT NULL DEFAULT false CHECK \(business_write_occurred = false\)/)
  assert.match(extension, /ai_repair_policy_decisions/)

  assert.match(migration, /published_skill_version_is_immutable/)
  assert.match(migration, /skill_binding_or_scope_denied/)
  assert.match(migration, /skill_rate_limit_exceeded/)
  assert.match(migration, /skill_approval_not_satisfied/)
  assert.match(migration, /skill_target_version_or_state_changed/)
  assert.match(migration, /UNIQUE\(school_id,task_id,node_id,snapshot_hash\)/)
  assert.match(migration, /ai_business_effects/)
  assert.match(migration, /ai_outbox_events/)
  assert.match(migration, /notification_deliveries/)
  assert.match(migration, /deliveryClaimed',false/)
  assert.match(migration, /claim_evidence_hash=encode\(digest/)
  assert.match(migration, /qr_token_hash=encode\(digest/)
  assert.match(migration, /result_data-'qrToken'/)
  assert.match(migration, /real_energy_readings/)
  assert.match(migration, /no_random_or_synthetic_curve/)
  assert.match(migration, /no_punitive_ai_conclusion/)
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/)
  assert.match(migration, /REVOKE ALL ON FUNCTION ai_prepare_skill_operation/)
  assert.match(migration, /TO service_role/)
  assert.match(extension, /REVOKE ALL ON ai_repair_policy_decisions/)
  assert.match(extension, /TO service_role/)
  assert.doesNotMatch(migration, /EXECUTE\s+format\s*\(/i)
  assert.doesNotMatch(extension, /EXECUTE\s+format\s*\(/i)
  assert.doesNotMatch(`${migration}\n${extension}`, /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+.*(sql_executor|url_fetch|http_request)/i)
  assert.doesNotMatch(`${migration}\n${extension}`, /GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+(anon|authenticated)/i)
  console.log(`PASS Skill Gateway migration: control=${controlTables.length} domain=${domainTables.length} adapters=${ENTERPRISE_SKILL_KEYS.length} lifecycle=atomic policyGuard=prewrite`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
