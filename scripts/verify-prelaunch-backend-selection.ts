import './assert-isolated-test-environment.mjs'
import assert from 'node:assert/strict'
import { getIdentityRepository, usesProductionIdentityRepository } from '../src/lib/identity/repository'
import { getAiTaskRuntimeRepository, usesProductionAiTaskRuntimeRepository } from '../src/lib/ai/runtime/repository'
import { getEnterpriseSkillPort, hasEnterpriseSkillPort } from '../src/lib/ai/skills/port'

// Test only backend selection: dummy Supabase credentials never trigger an HTTP request.
const original = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  AI_DATABASE_MODE: process.env.AI_DATABASE_MODE,
  COZE_SUPABASE_URL: process.env.COZE_SUPABASE_URL,
  COZE_SUPABASE_SERVICE_ROLE_KEY: process.env.COZE_SUPABASE_SERVICE_ROLE_KEY,
}
function restore(name: keyof typeof original): void {
  const value = original[name]
  if (value === undefined) Reflect.deleteProperty(process.env, name)
  else Reflect.set(process.env, name, value)
}
try {
  Reflect.set(process.env, 'NODE_ENV', 'production')
  delete process.env.AI_DATABASE_MODE
  process.env.COZE_SUPABASE_URL = 'https://legacy.invalid'
  process.env.COZE_SUPABASE_SERVICE_ROLE_KEY = 'qa-only-nonfunctional-placeholder'
  assert.ok(process.env.DATABASE_URL)
  assert.equal(getIdentityRepository().constructor.name, 'PostgresIdentityRepository')
  assert.equal(getAiTaskRuntimeRepository().constructor.name, 'PostgresAiTaskRuntimeRepository')
  assert.equal(getEnterpriseSkillPort().constructor.name, 'PostgresEnterpriseSkillPort')
  assert.equal(usesProductionIdentityRepository(), true)
  assert.equal(usesProductionAiTaskRuntimeRepository(), true)

  delete process.env.DATABASE_URL
  assert.equal(usesProductionIdentityRepository(), false)
  assert.equal(usesProductionAiTaskRuntimeRepository(), false)
  assert.equal(hasEnterpriseSkillPort(), false)
  assert.throws(() => getIdentityRepository(), /PostgreSQL DATABASE_URL/)
  assert.throws(() => getAiTaskRuntimeRepository(), /PostgreSQL DATABASE_URL/)
  assert.throws(() => getEnterpriseSkillPort(), /PostgreSQL enterprise Skill backend/)
  process.env.AI_DATABASE_MODE = 'memory'
  assert.throws(() => getIdentityRepository(), /PostgreSQL DATABASE_URL/)
  assert.throws(() => getAiTaskRuntimeRepository(), /PostgreSQL DATABASE_URL/)
  console.log('PASS production PG-only backend selection: identity, task, Skill (legacy credentials and memory mode cannot override)')
} finally {
  restore('NODE_ENV')
  restore('DATABASE_URL')
  restore('AI_DATABASE_MODE')
  restore('COZE_SUPABASE_URL')
  restore('COZE_SUPABASE_SERVICE_ROLE_KEY')
}
