import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Pool } from 'pg'

const DEFAULT_MIGRATIONS_DIR = fileURLToPath(new URL('./migrations', import.meta.url))
const MIGRATION_LOCK_KEY = 814236

export async function runMigrations(pool: Pool, migrationsDir = DEFAULT_MIGRATIONS_DIR): Promise<void> {
  const migrationFiles = (await readdir(migrationsDir))
    .filter((fileName) => /^\d+.*\.sql$/i.test(fileName))
    .sort()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY])
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)

    for (const fileName of migrationFiles) {
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE version = $1', [fileName])
      if ((applied.rowCount ?? 0) > 0) continue

      await client.query(await readFile(join(migrationsDir, fileName), 'utf8'))
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [fileName])
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
