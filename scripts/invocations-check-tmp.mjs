import './assert-isolated-test-environment.mjs'
import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: '127.0.0.1', port: 55432, user: 'agent_admin', password: '80e0e3be17bd49b78b57c3c013d9a028701dadb76ea94211', database: 'shuzhi_agent' });
await c.connect();
const r = await c.query("SELECT status, purpose, error_code, created_at::text FROM ai_model_invocations ORDER BY created_at DESC LIMIT 8");
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
