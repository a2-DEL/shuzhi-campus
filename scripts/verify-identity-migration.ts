import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { ROLE_CODES } from '@/storage/database/schema/identity'

async function main(): Promise<void> {
const identityMigration = await readFile(path.resolve(process.cwd(), 'drizzle/0001_identity_tenancy.sql'), 'utf8')
const operationsMigration = await readFile(path.resolve(process.cwd(), 'drizzle/0005_ai_operations_feedback.sql'), 'utf8')
const roleMigrations = `${identityMigration}\n${operationsMigration}`
const schema = await readFile(path.resolve(process.cwd(), 'src/storage/database/schema/identity.ts'), 'utf8')
const requiredTables = [
  'schools', 'campuses', 'organizations', 'organization_closure', 'academic_classes',
  'buildings', 'users', 'external_identities', 'user_role_assignments',
  'role_delegations', 'auth_sessions',
]
const requiredFunctions = [
  'create_identity_user', 'update_identity_user', 'deactivate_identity_user',
  'app_request_claim', 'app_has_role',
]
for (const table of requiredTables) {
  assert.match(identityMigration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), `missing table ${table}`)
}
for (const fn of requiredFunctions) {
  assert.match(identityMigration, new RegExp(`FUNCTION ${fn}`), `missing function ${fn}`)
}
assert.match(identityMigration, /ALTER TABLE users ENABLE ROW LEVEL SECURITY|ENABLE ROW LEVEL SECURITY/)
assert.match(identityMigration, /REVOKE ALL ON TABLE/)
assert.doesNotMatch(identityMigration, /USING\s*\(\s*true\s*\)/i)
assert.doesNotMatch(identityMigration, /TO\s*\[?['"]public['"]\]?/i)
for (const role of ROLE_CODES) assert.match(roleMigrations, new RegExp(`['"]${role}['"]`), `missing role ${role}`)
assert.match(schema, /uniqueIndex\('user_role_assignments_primary_active_idx'/)
assert.match(schema, /externalIdentities/)
assert.match(schema, /authSessions/)
console.log(`PASS identity migration contract: tables=${requiredTables.length} functions=${requiredFunctions.length} roles=${ROLE_CODES.length} fail-closed RLS=1`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
