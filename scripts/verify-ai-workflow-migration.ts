import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { AI_WORKFLOW_REJECTS_ARBITRARY_CODE, AI_WORKFLOW_LINKS_GOVERNED_TASKS, AI_WORKFLOW_TABLES } from '@/storage/database/schema/platform'

const TABLES = ['ai_workflows', 'ai_workflow_versions', 'ai_workflow_runs', 'ai_workflow_run_events']
async function main(): Promise<void> {
  const migration = await readFile(path.resolve('drizzle/0009_visual_workflows.sql'), 'utf8')
  const schema = await readFile(path.resolve('src/storage/database/schema/platform.ts'), 'utf8')
  let assertions = 0
  const expect = (value: unknown, message: string) => { assert.ok(value, message); assertions += 1 }
  expect(AI_WORKFLOW_TABLES.length === 4, 'workflow table registry is incomplete')
  expect(AI_WORKFLOW_REJECTS_ARBITRARY_CODE, 'workflow arbitrary-code rejection contract is missing')
  expect(AI_WORKFLOW_LINKS_GOVERNED_TASKS, 'workflow task linkage contract is missing')
  for (const table of TABLES) {
    expect(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `migration missing ${table}`)
    expect(schema.includes(`pgTable('${table}'`), `schema missing ${table}`)
  }
  expect(migration.includes("task_id uuid REFERENCES ai_task_runs(id)"), 'workflow runs do not link governed tasks')
  expect(migration.includes('definition jsonb NOT NULL'), 'immutable workflow definitions are missing')
  expect(migration.includes('payload_hash varchar(64) NOT NULL'), 'event payload lineage is missing')
  expect(!/USING\s*\(\s*true\s*\)/i.test(migration), 'workflow migration contains permissive RLS')
  expect(migration.includes('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated'), 'direct workflow table access is not revoked')
  expect(hasPostgresDatabaseUrl(), 'PostgreSQL is unavailable')
  const pool = getPostgresPool()
  const live = await pool.query<{ table_name: string; row_security: boolean }>(
    `SELECT c.relname table_name,c.relrowsecurity row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [TABLES],
  )
  expect(live.rows.length === TABLES.length, 'live database is missing workflow tables')
  expect(live.rows.every((row) => row.row_security), 'workflow tables do not all enforce RLS')
  const migrationRow = await pool.query("SELECT name FROM schema_migrations WHERE name='0009_visual_workflows.sql'")
  expect(migrationRow.rows.length === 1, 'workflow migration is not recorded')
  console.log(`PASS visual workflow migration: tables=${live.rows.length} RLS=true immutable=1 taskLink=1 assertions=${assertions}`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
