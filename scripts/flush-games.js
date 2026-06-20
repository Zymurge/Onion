#!/usr/bin/env node
import { Pool } from 'pg'

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('Please set DATABASE_URL to your Postgres connection string.')
    process.exit(1)
  }

  if (process.env.CONFIRM !== 'YES') {
    console.error('This is destructive. To proceed set CONFIRM=YES environment variable.')
    console.error('Example: CONFIRM=YES DATABASE_URL=postgres://... node scripts/flush-games.js')
    process.exit(1)
  }

  const pool = new Pool({ connectionString })

  try {
    console.warn('Connecting to database...')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      // Truncate in safe order; restart identities
      await client.query('TRUNCATE TABLE game_events, game_state, matches RESTART IDENTITY CASCADE')
      await client.query('COMMIT')
      console.log('Flushed game tables: matches, game_state, game_events')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('Failed to flush games:', err)
    process.exit(2)
  } finally {
    await pool.end()
  }
}

main()
.catch((err) => { console.error(err); process.exit(2) })
