import './assert-isolated-test-environment.mjs'
﻿import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPostgresPool } from '@/storage/database/postgres'
import { AI_EVOLUTION_TABLES } from '@/storage/database/schema/platform'
import { EVOLUTION_NEVER_AUTO_PUBLISHES } from '@/lib/ai/platform/evolution'

const TABLES = ['ai_evolution_signals','ai_evolution_datasets','ai_evolution_eval_cases','ai_evolution_experiments','ai_evolution_eval_runs','ai_evolution_releases']
async function main() {
  const migration = await readFile(path.resolve('drizzle/0012_governed_self_evolution.sql'), 'utf8')
  const schema = await readFile(path.resolve('src/storage/database/schema/platform.ts'), 'utf8')
  let assertions = 0
  const expect = (value: unknown, message: string) => { assert.ok(value, message); assertions += 1 }
  expect(AI_EVOLUTION_TABLES.length === 6, 'evolution table registry incomplete')
  for (const table of TABLES) {
    expect(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), `migration missing ${table}`)
    expect(schema.includes(`pgTable('${table}'`), `schema missing ${table}`)
  }
  expect(migration.includes("status IN ('DRAFT','EVALUATING','READY_FOR_REVIEW','APPROVED','REJECTED','ROLLED_BACK')"), 'experiment lifecycle is incomplete')
  expect(migration.includes('safety_score numeric(8,5)'), 'evaluation safety score is missing')
  expect(migration.includes("WHERE status='ACTIVE'"), 'single active release guard is missing')
  expect(migration.includes('activated_by varchar(36) NOT NULL REFERENCES users(id)'), 'human release identity is missing')
  expect(migration.includes('rolled_back_by varchar(36)'), 'human rollback identity is missing')
  expect(migration.includes('evidence_hash varchar(64)'), 'evaluation evidence hash is missing')
  expect(migration.includes('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated'), 'direct table access is not revoked')
  expect(EVOLUTION_NEVER_AUTO_PUBLISHES, 'service does not explicitly prohibit auto-publishing')
  const pool = getPostgresPool()
  const live = await pool.query<{ table_name: string; row_security: boolean }>(`SELECT c.relname table_name,c.relrowsecurity row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [TABLES])
  expect(live.rows.length === 6, 'live evolution tables missing')
  expect(live.rows.every((row) => row.row_security), 'evolution RLS missing')
  const applied = await pool.query("SELECT name FROM schema_migrations WHERE name='0012_governed_self_evolution.sql'")
  expect(applied.rows.length === 1, 'evolution migration not recorded')
  console.log(`PASS governed self-evolution migration: tables=6 RLS=true humanGate=true autoPublish=false assertions=${assertions}`)
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
