import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { PostgresDb } from '../../../server/db/postgres.js'
import type { MatchRecord } from '../../../server/db/adapter.js'
import { makeGameState, makeOnion } from '#test/utils/gameStateUtils'

const { Pool } = pg

let container: StartedPostgreSqlContainer
let pool: InstanceType<typeof Pool>
let db: PostgresDb

const MIGRATION_PATH = join(process.cwd(), 'server/db/migrations/001_initial.sql')

const SAMPLE_STATE = makeGameState({
  onions: { 'onion-1': makeOnion({ position: { q: 0, r: 10 }, treads: 45 }) },
  defenders: {},
})

function makeMatch(overrides: Partial<Omit<MatchRecord, 'gameId'>> = {}): Omit<MatchRecord, 'gameId'> {
  return {
    scenarioId: 'swamp-siege-01',
    scenarioSnapshot: { id: 'swamp-siege-01', displayName: 'The Siege of Shrek\'s Swamp' },
    players: { onion: null, defender: null },
    phase: 'ONION_MOVE',
    turnNumber: 1,
    winner: null,
    state: structuredClone(SAMPLE_STATE),
    events: [],
    ...overrides,
  }
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start()
  pool = new Pool({ connectionString: container.getConnectionUri() })
  const sql = await readFile(MIGRATION_PATH, 'utf8')
  await pool.query(sql)
  db = new PostgresDb(pool)
}, 60_000)

afterAll(async () => {
  await pool.end()
  await container.stop()
})

beforeEach(async () => {
  await pool.query('TRUNCATE game_events, game_state, matches, users RESTART IDENTITY CASCADE')
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('PostgresDb - auth', () => {
  it('createUser generates a UUID and stores hashed password', async () => {
    const { userId } = await db.createUser('shrek', 'shrek@example.com', 'hashed:pass')
    expect(userId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('findUserByUsername returns the stored record', async () => {
    const { userId } = await db.createUser('shrek', 'shrek@example.com', 'hashed:pass')
    const found = await db.findUserByUsername('shrek')
    expect(found?.userId).toBe(userId)
    expect(found?.passwordHash).toBe('hashed:pass')
  })

  it('finds usernames and emails case-insensitively', async () => {
    await db.createUser('ShReK', 'Player@Example.com', 'hashed:pass')
    expect((await db.findUserByUsername('shrek'))?.userId).toMatch(/^[0-9a-f-]{36}$/)
    const found = await db.findUserByEmail('player@example.com')
    expect(found?.username).toBe('ShReK')
    expect(found?.email).toBe('Player@Example.com')
  })

  it('findUserByUsername returns null for unknown user', async () => {
    expect(await db.findUserByUsername('nobody')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

describe('PostgresDb - games', () => {
  it('createMatch then findMatch roundtrip', async () => {
    const match = makeMatch()
    const created = await db.createMatch(match)
    const found = await db.findMatch(created.gameId)
    expect(found?.gameId).toBe(created.gameId)
    expect(found?.scenarioId).toBe('swamp-siege-01')
    expect(found?.scenarioSnapshot).toEqual(expect.objectContaining({ displayName: 'The Siege of Shrek\'s Swamp' }))
    expect(found?.phase).toBe('ONION_MOVE')
    expect(found?.turnNumber).toBe(1)
    expect(found?.winner).toBeNull()
    expect(found?.players).toEqual({ onion: null, defender: null })
    expect(found?.state.onions['onion-1'].position).toEqual({ q: 0, r: 10 })
    expect(found?.events).toEqual([])
  })

  it('findMatch returns null for unknown gameId', async () => {
    expect(await db.findMatch(999999)).toBeNull()
  })

  it('listMatches applies generic participant, completion, and availability filters', async () => {
    const shrek = await db.createUser('shrek', 'shrek@example.com', 'x')
    const fiona = await db.createUser('fiona', 'fiona@example.com', 'x')
    const donkey = await db.createUser('donkey', 'donkey@example.com', 'x')
    const openOnion = await db.createMatch(makeMatch({ players: { onion: shrek.userId, defender: null } }))
    const openDefender = await db.createMatch(makeMatch({ players: { onion: null, defender: fiona.userId } }))
    const full = await db.createMatch(makeMatch({ players: { onion: shrek.userId, defender: fiona.userId } }))
    const completed = await db.createMatch(makeMatch({ players: { onion: donkey.userId, defender: fiona.userId }, winner: donkey.userId }))

    expect((await db.listMatches()).map((match) => match.gameId)).toEqual([
      openOnion.gameId,
      openDefender.gameId,
      full.gameId,
      completed.gameId,
    ])
    expect((await db.listMatches({
      participantUserId: shrek.userId,
      completion: 'active',
      availability: 'open',
    })).map((match) => match.gameId)).toEqual([openOnion.gameId])
    expect((await db.listMatches({
      excludeParticipantUserId: shrek.userId,
      completion: 'active',
      availability: 'open',
    })).map((match) => match.gameId)).toEqual([openDefender.gameId])
    expect((await db.listMatches({ completion: 'completed' })).map((match) => match.gameId)).toEqual([completed.gameId])
    expect((await db.listMatches({ availability: 'full' })).map((match) => match.gameId)).toEqual([full.gameId, completed.gameId])
  })

  it('updateMatchPlayers persists player assignment', async () => {
    const { userId } = await db.createUser('shrek', 'shrek@example.com', 'x')
    const match = makeMatch()
    const created = await db.createMatch(match)
    await db.updateMatchPlayers(created.gameId, { onion: userId, defender: null })
    const found = await db.findMatch(created.gameId)
    expect(found?.players.onion).toBe(userId)
    expect(found?.players.defender).toBeNull()
  })

  it('updateMatchState persists phase, turnNumber, and state', async () => {
    const match = makeMatch()
    const created = await db.createMatch(match)
    const newState = structuredClone(SAMPLE_STATE)
    newState.onions['onion-1'].treads = 30
    await db.updateMatchState(created.gameId, 'ONION_COMBAT', 2, null, newState)
    const found = await db.findMatch(created.gameId)
    expect(found?.phase).toBe('ONION_COMBAT')
    expect(found?.turnNumber).toBe(2)
    expect(found?.state.onions['onion-1'].treads).toBe(30)
  })

  it('appendEvents + getEvents roundtrip with after filter', async () => {
    const match = makeMatch()
    const created = await db.createMatch(match)
    const ts = new Date().toISOString()
    await db.appendEvents(created.gameId, [
      { seq: 1, type: 'PHASE_CHANGED', timestamp: ts, from: 'ONION_MOVE', to: 'ONION_COMBAT', turnNumber: 1 },
      { seq: 2, type: 'PHASE_CHANGED', timestamp: ts, from: 'ONION_COMBAT', to: 'DEFENDER_RECOVERY', turnNumber: 1 },
    ])
    const all = await db.getEvents(created.gameId, 0)
    expect(all).toHaveLength(2)
    expect(all[0].seq).toBe(1)
    expect(all[0].type).toBe('PHASE_CHANGED')

    const after1 = await db.getEvents(created.gameId, 1)
    expect(after1).toHaveLength(1)
    expect(after1[0].seq).toBe(2)
  })

  it('getEvents returns [] for unknown gameId', async () => {
    expect(await db.getEvents(999999, 0)).toEqual([])
  })
})
