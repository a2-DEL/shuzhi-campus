import { Pool } from 'pg'
import { loadEnv } from '@/storage/database/supabase-client'

type PostgresGlobal = typeof globalThis & { __SHUZHI_POSTGRES_POOL__?: Pool }

export function isDatabaseMemoryMode(): boolean {
  loadEnv()
  return process.env.AI_DATABASE_MODE?.trim().toLowerCase() === 'memory'
}

export function hasPostgresDatabaseUrl(): boolean {
  loadEnv()
  return !isDatabaseMemoryMode() && Boolean(process.env.DATABASE_URL?.trim())
}

export function getPostgresPool(): Pool {
  loadEnv()
  const connectionString = process.env.DATABASE_URL?.trim()
  if (!connectionString) throw new Error('DATABASE_URL is not configured')

  const runtime = globalThis as PostgresGlobal
  if (!runtime.__SHUZHI_POSTGRES_POOL__) {
    runtime.__SHUZHI_POSTGRES_POOL__ = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 60_000,
      application_name: 'shuzhi-agent-runtime',
    })
  }
  return runtime.__SHUZHI_POSTGRES_POOL__
}
