import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getPostgresPool } from '@/storage/database/postgres'
import { AI_EXTENSION_TABLES } from '@/storage/database/schema/platform'
const TABLES=['ai_plugins','ai_plugin_versions','ai_mcp_servers','ai_mcp_tools','ai_mcp_probe_runs','ai_mcp_invocations']
async function main(){
 const migration=await readFile(path.resolve('drizzle/0010_plugins_mcp_control_plane.sql'),'utf8');const schema=await readFile(path.resolve('src/storage/database/schema/platform.ts'),'utf8');let assertions=0;const expect=(v:unknown,m:string)=>{assert.ok(v,m);assertions++}
 expect(AI_EXTENSION_TABLES.length===6,'extension table registry incomplete')
 for(const table of TABLES){expect(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`),`migration missing ${table}`);expect(schema.includes(`pgTable('${table}'`),`schema missing ${table}`)}
 expect(migration.includes('credential_ref varchar(120)'),'credential references are not modeled')
 expect(!migration.includes('credential_value'),'raw MCP credentials must not be persisted')
 expect(migration.includes("CHECK (status IN ('AVAILABLE','REVIEW_REQUIRED','DISABLED'))"),'MCP tool review lifecycle missing')
 expect(migration.includes('arguments_hash varchar(64) NOT NULL'),'MCP invocation argument hashing missing')
 expect(migration.includes('REVOKE ALL ON TABLE %I FROM PUBLIC, anon, authenticated'),'direct extension access is not revoked')
 const pool=getPostgresPool();const live=await pool.query<{table_name:string;row_security:boolean}>(`SELECT c.relname table_name,c.relrowsecurity row_security FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[TABLES])
 expect(live.rows.length===TABLES.length,'live extension tables missing');expect(live.rows.every(r=>r.row_security),'extension RLS not enabled')
 const applied=await pool.query("SELECT name FROM schema_migrations WHERE name='0010_plugins_mcp_control_plane.sql'");expect(applied.rows.length===1,'extension migration not recorded')
 console.log(`PASS extension control plane migration: tables=${live.rows.length} RLS=true credentials=reference-only assertions=${assertions}`)
}
main().catch(e=>{console.error(e);process.exitCode=1})
