import { config as loadDotEnv } from 'dotenv'

// Never seed, mutate, clean up, or run HTTP regression scripts against the configured source/production DB.
loadDotEnv({ path: '.env.local', quiet: true })
const databaseUrl = process.env.DATABASE_URL?.trim()
let name = ''
try {
  name = databaseUrl ? decodeURIComponent(new URL(databaseUrl).pathname.slice(1)) : ''
} catch {
  // An invalid connection URL must fail closed before any test code starts.
}
if (process.env.TEST_ISOLATED_DATABASE !== '1' || !/^qa_[a-z0-9_]+$/i.test(name)) {
  throw new Error('Tests require TEST_ISOLATED_DATABASE=1 and DATABASE_URL pointing to a dedicated qa_* PostgreSQL database. No test was executed.')
}
