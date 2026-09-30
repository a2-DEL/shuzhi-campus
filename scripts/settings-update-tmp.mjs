import './assert-isolated-test-environment.mjs'
import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: '127.0.0.1', port: 55432, user: 'agent_admin', password: '80e0e3be17bd49b78b57c3c013d9a028701dadb76ea94211', database: 'shuzhi_agent' });
await c.connect();
const r = await c.query(
  `UPDATE ai_runtime_settings
   SET route_mode='external_preferred', primary_provider='deepseek', updated_at=now()
   WHERE school_id='00000000-0000-4000-8000-000000000001'
   RETURNING school_id, route_mode, primary_provider, max_model_calls, daily_budget_cents`
);
console.log('updated:', JSON.stringify(r.rows[0]));
await c.end();
