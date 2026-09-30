import './assert-isolated-test-environment.mjs'
﻿import assert from 'node:assert/strict'
import { config as loadDotEnv } from 'dotenv'
import { Client } from 'pg'
import { DEVELOPMENT_SCHOOL_ID } from '@/lib/development-users'

async function verify(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true })
  loadDotEnv({ quiet: true })
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  let assertions = 0
  const expect = (condition: unknown, message: string) => { assertions += 1; assert.ok(condition, message) }
  try {
    const result = await client.query(
      `SELECT
        (SELECT settings->'showcase'->>'kind' FROM schools WHERE id=$1::uuid) AS dataset_kind,
        (SELECT count(*) FROM users WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS people,
        (SELECT count(*) FROM buildings WHERE school_id=$1::uuid AND code LIKE 'SHOWCASE-%')::int AS buildings,
        (SELECT count(*) FROM repair_orders WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS repairs,
        (SELECT count(DISTINCT status) FROM repair_orders WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS repair_states,
        (SELECT count(*) FROM classrooms WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS classrooms,
        (SELECT count(DISTINCT status) FROM classrooms WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS classroom_states,
        (SELECT count(*) FROM notifications WHERE school_id=$1::uuid)::int AS notifications,
        (SELECT count(*) FROM notification_deliveries WHERE school_id=$1::uuid)::int AS deliveries,
        (SELECT count(*) FROM lost_found WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS lost_items,
        (SELECT count(*) FROM dormitories WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS dormitories,
        (SELECT count(*) FROM dorm_safety_events WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS safety_events,
        (SELECT count(*) FROM hygiene_inspections WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS inspections,
        (SELECT count(*) FROM hygiene_rectifications WHERE school_id=$1::uuid)::int AS rectifications,
        (SELECT count(*) FROM visitors WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS visitors,
        (SELECT count(*) FROM energy_assets WHERE school_id=$1::uuid AND id LIKE 'showcase-%')::int AS assets,
        (SELECT count(*) FROM energy_readings WHERE school_id=$1::uuid AND source='showcase_meter')::int AS readings,
        (SELECT count(*) FROM materials WHERE id LIKE 'showcase-%')::int AS materials,
        (SELECT count(*) FROM duty_schedules WHERE id LIKE 'showcase-%')::int AS duties,
        (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid)::int AS tasks,
        (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid AND state='COMPLETED')::int AS completed_tasks,
        (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid AND state='AWAITING_APPROVAL')::int AS awaiting_tasks,
        (SELECT count(*) FROM ai_task_runs WHERE school_id=$1::uuid AND state='CANCELLED')::int AS cancelled_tasks,
        (SELECT count(*) FROM ai_business_effects WHERE school_id=$1::uuid AND status='VERIFIED')::int AS verified_effects,
        (SELECT count(*) FROM ai_feedback_events WHERE school_id=$1::uuid)::int AS feedback,
        (SELECT count(*) FROM ai_audit_events WHERE school_id=$1::uuid)::int AS audits,
        (SELECT count(*) FROM ai_outbox_events WHERE school_id=$1::uuid)::int AS outbox,
        (SELECT count(*) FROM ai_task_nodes n JOIN ai_task_runs t ON t.id=n.task_id
          WHERE t.school_id=$1::uuid AND t.idempotency_key='showcase.enterprise.flagship-forum.v1')::int AS flagship_nodes`,
      [DEVELOPMENT_SCHOOL_ID],
    )
    const c = result.rows[0]
    expect(c.dataset_kind === 'simulated', 'showcase provenance must explicitly identify simulated data')
    expect(c.people >= 56, 'showcase people are incomplete')
    expect(c.buildings >= 5, 'showcase buildings are incomplete')
    expect(c.repairs >= 18 && c.repair_states >= 4, 'repair volume or state diversity is incomplete')
    expect(c.classrooms >= 10 && c.classroom_states >= 3, 'classroom volume or state diversity is incomplete')
    expect(c.notifications >= 10, 'notifications should include seeded and Agent-created records')
    expect(c.deliveries >= 150, 'notification delivery evidence is incomplete')
    expect(c.lost_items >= 12, 'lost-and-found records are incomplete')
    expect(c.dormitories >= 4, 'dormitory records are incomplete')
    expect(c.safety_events >= 8, 'dorm safety events are incomplete')
    expect(c.inspections >= 10 && c.rectifications >= 7, 'hygiene evidence or rectifications are incomplete')
    expect(c.visitors >= 12, 'visitor records are incomplete')
    expect(c.assets >= 5 && c.readings >= 60, 'energy assets or readings are incomplete')
    expect(c.materials >= 12 && c.duties >= 14, 'supporting business records are incomplete')
    expect(c.tasks >= 4, 'governed Agent task history is incomplete')
    expect(c.completed_tasks >= 2, 'completed Agent outcomes are incomplete')
    expect(c.awaiting_tasks >= 1, 'human approval queue is not represented')
    expect(c.cancelled_tasks >= 1, 'safe human rejection is not represented')
    expect(c.verified_effects >= 5, 'real business readback effects are incomplete')
    expect(c.feedback >= 3, 'human feedback loop is incomplete')
    expect(c.audits > 0 && c.outbox > 0, 'audit or outbox evidence is incomplete')
    expect(c.flagship_nodes === 3, 'flagship scenario must contain three real Agent nodes')
    console.log(`PASS enterprise showcase: people=${c.people} repairs=${c.repairs} deliveries=${c.deliveries} readings=${c.readings} tasks=${c.tasks} verifiedEffects=${c.verified_effects} flagshipNodes=${c.flagship_nodes} assertions=${assertions}`)
  } finally {
    await client.end()
  }
}

verify().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
