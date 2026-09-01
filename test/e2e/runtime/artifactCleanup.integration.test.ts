import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { cleanupArtifacts } from './artifactCleanup.js'
import { PostgresArtifactCleanupDatabaseFactory } from './adapters.js'
import { createEmptyArtifactManifest } from './artifactRegistry.js'

const { Pool } = pg

let container: StartedPostgreSqlContainer
let pool: InstanceType<typeof Pool>
let factory: PostgresArtifactCleanupDatabaseFactory
let databaseUrl: string

const MIGRATION_PATH = join(process.cwd(), 'server/db/migrations/001_initial.sql')

async function insertUser(username: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
    [username, `${username}@example.com`, 'hash'],
  )
  return rows[0].id
}

async function insertMatch(onionPlayerId: string | null): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO matches (scenario_id, scenario_snapshot, onion_player_id, current_phase, turn_number)
     VALUES ('swamp-siege-01', '{}'::jsonb, $1, 'ONION_MOVE', 1) RETURNING id`,
    [onionPlayerId],
  )
  const gameId = rows[0].id
  await pool.query('INSERT INTO game_state (match_id, state) VALUES ($1, $2)', [gameId, '{}'])
  await pool.query('INSERT INTO game_events (match_id, seq, type, payload) VALUES ($1, 1, $2, $3)', [
    gameId,
    'PHASE_CHANGED',
    '{}',
  ])
  return gameId
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  databaseUrl = container.getConnectionUri()
  pool = new Pool({ connectionString: databaseUrl })
  const sql = await readFile(MIGRATION_PATH, 'utf8')
  await pool.query(sql)
  factory = new PostgresArtifactCleanupDatabaseFactory()
}, 60_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('TRUNCATE game_events, game_state, matches, users RESTART IDENTITY CASCADE')
})

describe('PostgresArtifactCleanupDatabaseFactory', () => {
  it('deletes only the registered match, cascading to game_state and game_events, and preserves unrelated rows', async () => {
    const userA = await insertUser('registered-user')
    const userB = await insertUser('unrelated-user')
    const registeredGameId = await insertMatch(userA)
    const unrelatedGameId = await insertMatch(userB)

    const database = factory.create(databaseUrl)
    try {
      const result = await cleanupArtifacts(database, {
        ...createEmptyArtifactManifest(),
        gameIds: [registeredGameId],
        userIds: [userA],
      })
      expect(result.errors).toEqual([])
    } finally {
      await database.close()
    }

    expect((await pool.query('SELECT 1 FROM matches WHERE id = $1', [registeredGameId])).rowCount).toBe(0)
    expect((await pool.query('SELECT 1 FROM game_state WHERE match_id = $1', [registeredGameId])).rowCount).toBe(0)
    expect((await pool.query('SELECT 1 FROM game_events WHERE match_id = $1', [registeredGameId])).rowCount).toBe(0)
    expect((await pool.query('SELECT 1 FROM users WHERE id = $1', [userA])).rowCount).toBe(0)

    expect((await pool.query('SELECT 1 FROM matches WHERE id = $1', [unrelatedGameId])).rowCount).toBe(1)
    expect((await pool.query('SELECT 1 FROM users WHERE id = $1', [userB])).rowCount).toBe(1)
  })

  it('is safe to repeat once rows are already deleted', async () => {
    const userA = await insertUser('repeat-user')
    const registeredGameId = await insertMatch(userA)
    const manifest = { ...createEmptyArtifactManifest(), gameIds: [registeredGameId], userIds: [userA] }
    const database = factory.create(databaseUrl)

    try {
      const first = await cleanupArtifacts(database, manifest)
      const second = await cleanupArtifacts(database, manifest)
      expect(first.errors).toEqual([])
      expect(second.errors).toEqual([])
    } finally {
      await database.close()
    }
  })

  it('reports a foreign key error rather than throwing when a user is registered without its match', async () => {
    const userA = await insertUser('still-referenced')
    await insertMatch(userA)
    const database = factory.create(databaseUrl)

    try {
      const result = await cleanupArtifacts(database, {
        ...createEmptyArtifactManifest(),
        gameIds: [],
        userIds: [userA],
      })
      expect(result.errors).toEqual([expect.stringMatching(/Failed to delete users/)])
    } finally {
      await database.close()
    }

    expect((await pool.query('SELECT 1 FROM users WHERE id = $1', [userA])).rowCount).toBe(1)
  })
})
