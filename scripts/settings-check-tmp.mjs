import './assert-isolated-test-environment.mjs'
import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: '127.0.0.1', port: 55432, user: 'agent_admin', password: '80e0e3be17bd49b78b57c3c013d9a028701dadb76ea94211', database: 'shuzhi_agent' });
await c.connect();
const r = await c.query("SELECT school_id, route_mode, primary_provider, max_model_calls, daily_budget_cents FROM ai_runtime_settings");
console.log('runtime settings:', JSON.stringify(r.rows, null, 2));
const inv = await c.query("SELECT status, count(*)::int cnt, max(created_at)::text last_at FROM ai_model_invocations GROUP BY status ORDER BY cnt DESC");
console.log('model invocations:', JSON.stringify(inv.rows));
await c.end();
