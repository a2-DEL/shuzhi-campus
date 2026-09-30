import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPostgresPool, hasPostgresDatabaseUrl } from '@/storage/database/postgres'
import { AI_KNOWLEDGE_TABLES } from '@/storage/database/schema/knowledge'

async function main(): Promise<void> {
  const migration = await readFile(path.resolve(process.cwd(), 'drizzle/0008_enterprise_knowledge_rag.sql'), 'utf8')
  const schema = await readFile(path.resolve(process.cwd(), 'src/storage/database/schema/knowledge.ts'), 'utf8')
  let assertions = 0
  const expect = (value: unknown, message: string) => { assert.ok(value, message); assertions += 1 }

  expect(AI_KNOWLEDGE_TABLES.length === 12, 'knowledge table registry is incomplete')
  for (const table of AI_KNOWLEDGE_TABLES) {
    expect(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`).test(migration), `missing SQL table ${table}`)
    expect(new RegExp(`pgTable\\('${table}'`).test(schema), `missing Drizzle table ${table}`)
  }
  expect(migration.includes('CREATE EXTENSION IF NOT EXISTS pg_trgm'), 'trigram extension is not declared')
  expect(migration.includes('CREATE OR REPLACE FUNCTION ai_cosine_similarity'), 'cosine function is not declared')
  expect(migration.includes('feature_vector real[]'), 'real feature vector storage is not declared')
  expect(migration.includes('search_vector tsvector'), 'full-text vector storage is not declared')
  expect(migration.includes('source_text text NOT NULL'), 'versioned source text is not persisted')
  expect(migration.includes('query_hash varchar(64)'), 'retrieval query hash is not persisted')
  expect(migration.includes('evidence_quote text NOT NULL'), 'graph evidence is not persisted')
  expect(!/USING\\s*\\(\\s*true\\s*\\)/i.test(migration), 'knowledge RLS must not be permissive')
  expect(migration.match(/ENABLE ROW LEVEL SECURITY/g)?.length === 1, 'knowledge RLS block is missing')
  expect(migration.includes('REVOKE ALL ON TABLE public.%I FROM authenticated'), 'direct knowledge access is not revoked')

  expect(hasPostgresDatabaseUrl(), 'PostgreSQL is unavailable for live migration verification')
  const pool = getPostgresPool()
  const tables = await pool.query<{ table_name: string; row_security: boolean }>(
    `SELECT c.relname AS table_name, c.relrowsecurity AS row_security
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname = ANY($1::text[])
      ORDER BY c.relname`,
    [AI_KNOWLEDGE_TABLES],
  )
  expect(tables.rows.length === AI_KNOWLEDGE_TABLES.length, 'live database is missing knowledge tables')
  expect(tables.rows.every((row) => row.row_security), 'live knowledge tables do not all have RLS enabled')
  const extension = await pool.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname='pg_trgm'")
  expect(extension.rows.length === 1, 'pg_trgm is not installed in the local database')
  const functionResult = await pool.query<{ count: string }>("SELECT count(*)::int AS count FROM pg_proc WHERE proname='ai_cosine_similarity'")
  expect(Number(functionResult.rows[0]?.count ?? 0) === 1, 'cosine function is not installed in the local database')
  console.log(`PASS AI-5 knowledge migration: tables=${tables.rows.length} RLS=${tables.rows.every((row) => row.row_security)} pg_trgm=1 cosine=1 assertions=${assertions}`)
}

main().catch((error) => { console.error(error); process.exitCode = 1 })
