import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Client } from 'pg'
import { config as loadDotEnv } from 'dotenv'

async function main(): Promise<void> {
  loadDotEnv({ path: '.env.local', quiet: true })
  loadDotEnv({ quiet: true })
  const databaseUrl = process.env.DATABASE_URL?.trim()
  if (!databaseUrl) throw new Error('DATABASE_URL is required for database migrations')

  const migrationsDirectory = path.resolve(process.cwd(), 'drizzle')
  const files = (await readdir(migrationsDirectory))
    .filter((file) => /^\d+_.+\.sql$/.test(file))
    .sort()

  if (files.length === 0) throw new Error('No SQL migrations were found')

  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name text PRIMARY KEY,
        checksum varchar(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await client.query("SELECT pg_advisory_lock(hashtext('campus-agent-os-migrations'))")

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM public.schema_migrations WHERE name = $1',
        [file]
      )

      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Migration checksum mismatch: ${file}`)
        }
        console.log(`skip ${file}`)
        continue
      }

      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query(
          'INSERT INTO public.schema_migrations (name, checksum) VALUES ($1, $2)',
          [file, checksum]
        )
        await client.query('COMMIT')
        console.log(`applied ${file}`)
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext('campus-agent-os-migrations'))")
    } finally {
      await client.end()
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
