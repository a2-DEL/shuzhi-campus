import './assert-isolated-test-environment.mjs'
import pg from 'pg';
const { Client } = pg;
const c = new Client({ host: '127.0.0.1', port: 55432, user: 'agent_admin', password: '80e0e3be17bd49b78b57c3c013d9a028701dadb76ea94211', database: 'shuzhi_agent', connectionTimeoutMillis: 5000 });
try {
  await c.connect();
  const r = await c.query('SELECT count(*)::int cnt FROM users');
  console.log('users count:', r.rows[0].cnt);
  const s = await c.query("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user");
  console.log('role flags:', JSON.stringify(s.rows[0]));
  const rl = await c.query("SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('users','user_role_assignments','role_delegations')");
  console.log('RLS:', JSON.stringify(rl.rows));
  await c.end();
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
