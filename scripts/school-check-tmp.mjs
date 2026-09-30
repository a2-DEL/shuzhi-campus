import './assert-isolated-test-environment.mjs'
import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: '127.0.0.1', port: 55432, user: 'agent_admin', password: '80e0e3be17bd49b78b57c3c013d9a028701dadb76ea94211', database: 'shuzhi_agent' });
await c.connect();
const r = await c.query(`SELECT id, name, settings FROM schools WHERE id='00000000-0000-4000-8000-000000000001'`);
console.log(JSON.stringify(r.rows[0]?.settings, null, 2));
await c.end();
