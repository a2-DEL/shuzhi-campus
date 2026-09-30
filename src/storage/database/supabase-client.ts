import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { config as loadDotEnv } from 'dotenv'

let envLoaded = false

interface SupabaseCredentials {
  url: string
  anonKey: string
}

function loadEnv(): void {
  if (envLoaded) return
  if (process.env.NODE_ENV !== 'production') {
    loadDotEnv({ path: '.env.local', quiet: true })
    loadDotEnv({ quiet: true })
  }
  envLoaded = true
}

function hasSupabaseCredentials(): boolean {
  loadEnv()
  return Boolean(process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_ANON_KEY)
}

function hasSupabaseAdminCredentials(): boolean {
  loadEnv()
  return Boolean(process.env.COZE_SUPABASE_URL && process.env.COZE_SUPABASE_SERVICE_ROLE_KEY)
}

function getSupabaseCredentials(): SupabaseCredentials {
  loadEnv()
  const url = process.env.COZE_SUPABASE_URL?.trim()
  const anonKey = process.env.COZE_SUPABASE_ANON_KEY?.trim()
  if (!url) throw new Error('COZE_SUPABASE_URL is not set')
  if (!anonKey) throw new Error('COZE_SUPABASE_ANON_KEY is not set')
  return { url, anonKey }
}

function getSupabaseServiceRoleKey(): string | undefined {
  loadEnv()
  return process.env.COZE_SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined
}

function createServerClient(url: string, key: string, token?: string): SupabaseClient {
  return createClient(url, key, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    db: { timeout: 60000 },
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

function getSupabaseClient(token?: string): SupabaseClient {
  const { url, anonKey } = getSupabaseCredentials()
  if (token) return createServerClient(url, anonKey, token)
  return createServerClient(url, getSupabaseServiceRoleKey() ?? anonKey)
}

function getSupabaseAdminClient(): SupabaseClient {
  loadEnv()
  const url = process.env.COZE_SUPABASE_URL?.trim()
  const serviceRoleKey = getSupabaseServiceRoleKey()
  if (!url || !serviceRoleKey) {
    throw new Error('COZE_SUPABASE_URL and COZE_SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return createServerClient(url, serviceRoleKey)
}

export {
  loadEnv,
  hasSupabaseCredentials,
  hasSupabaseAdminCredentials,
  getSupabaseCredentials,
  getSupabaseServiceRoleKey,
  getSupabaseClient,
  getSupabaseAdminClient,
}
