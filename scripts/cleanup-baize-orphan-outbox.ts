import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { Pool } from 'pg'

/** QA-only cleanup: never touch a live task's delivery event or any non-PENDING state. */
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const orphaned = await client.query<{ id: string }>(
      `SELECT e.id FROM ai_outbox_events e
       WHERE e.aggregate_type='ai_task_run' AND e.status='PENDING'
         AND NOT EXISTS (SELECT 1 FROM ai_task_runs t WHERE t.school_id=e.school_id AND t.id::text=e.aggregate_id)
       FOR UPDATE OF e`,
    )
    if (orphaned.rows.length === 0) {
      await client.query('COMMIT')
      console.log('PASS isolated QA outbox: no orphan PENDING task events remain')
      return
    }
    assert.equal(orphaned.rows.length, 7, 'expected exactly seven orphan QA task events; no cleanup performed')
    const deleted = await client.query(
      `DELETE FROM ai_outbox_events e WHERE e.id=ANY($1::uuid[]) AND e.status='PENDING'
         AND NOT EXISTS (SELECT 1 FROM ai_task_runs t WHERE t.school_id=e.school_id AND t.id::text=e.aggregate_id)`,
      [orphaned.rows.map((row) => row.id)],
    )
    assert.equal(deleted.rowCount, 7, 'orphan cleanup count changed; transaction rolled back')
    await client.query('COMMIT')
    console.log('PASS isolated QA outbox: removed exactly 7 orphan PENDING events; live task events untouched')
  } catch (error) { await client.query('ROLLBACK'); throw error }
  finally { client.release(); await pool.end() }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
