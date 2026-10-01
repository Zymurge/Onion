import { describe, expect, it } from 'vitest'

import { InMemoryDb } from '#server/db/memory'
import type { MatchRecord } from '#server/db/adapter'
import { makeGameState } from '#test/utils/gameStateUtils'

const SHREK_ID = '00000000-0000-4000-8000-000000000001'
const FIONA_ID = '00000000-0000-4000-8000-000000000002'
const DONKEY_ID = '00000000-0000-4000-8000-000000000003'

function makeMatch(overrides: Partial<Omit<MatchRecord, 'gameId'>> = {}): Omit<MatchRecord, 'gameId'> {
  return {
    scenarioId: 'swamp-siege-01',
    scenarioSnapshot: { displayName: 'The Siege of Shrek\'s Swamp' },
    hostUserId: SHREK_ID,
    players: { onion: null, defender: null },
    status: 'waiting',
    phase: 'ONION_MOVE',
    turnNumber: 1,
    winner: null,
    state: makeGameState(),
    events: [],
    ...overrides,
  }
}

function getSnapshotRevision(match: MatchRecord | null): number {
  return (match as (MatchRecord & { snapshotRevision?: number }) | null)?.snapshotRevision ?? 0
}

describe('InMemoryDb.listMatches', () => {
  it('returns all matches by default', async () => {
    const db = new InMemoryDb()
    await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: null } }))
    await db.createMatch(makeMatch({ players: { onion: null, defender: FIONA_ID } }))
    await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: FIONA_ID } }))
    await db.createMatch(makeMatch({ players: { onion: DONKEY_ID, defender: FIONA_ID }, winner: SHREK_ID, status: 'completed' }))

    const matches = await db.listMatches()

    expect(matches).toHaveLength(4)
  })

  it('filters by participant and excluded participant', async () => {
    const db = new InMemoryDb()
    const shrekGame = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: null } }))
    await db.createMatch(makeMatch({ players: { onion: null, defender: FIONA_ID } }))
    await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: FIONA_ID } }))

    const matches = await db.listMatches({
      participantUserId: SHREK_ID,
      excludeParticipantUserId: FIONA_ID,
    })

    expect(matches.map((match) => match.gameId)).toEqual([shrekGame.gameId])
  })

  it('filters active and completed matches', async () => {
    const db = new InMemoryDb()
    const activeGame = await db.createMatch(makeMatch())
    const completedGame = await db.createMatch(makeMatch({ winner: SHREK_ID, status: 'completed' }))
    const archivedGame = await db.createMatch(makeMatch({ winner: SHREK_ID, status: 'archived' }))

    expect((await db.listMatches({ completion: 'active' })).map((match) => match.gameId)).toEqual([activeGame.gameId])
    expect((await db.listMatches({ completion: 'completed' })).map((match) => match.gameId)).toEqual([completedGame.gameId])
    expect((await db.listMatches({ completion: 'history' })).map((match) => match.gameId)).toEqual([completedGame.gameId, archivedGame.gameId])
  })

  it('archives, restores, and deletes matches', async () => {
    const db = new InMemoryDb()
    const created = await db.createMatch(makeMatch({ winner: SHREK_ID, status: 'completed' }))

    await db.archiveMatch(created.gameId, SHREK_ID)
    expect((await db.findMatch(created.gameId))?.status).toBe('archived')

    await db.restoreMatch(created.gameId, SHREK_ID)
    expect((await db.findMatch(created.gameId))?.status).toBe('completed')

    await db.deleteMatch(created.gameId, SHREK_ID)
    expect(await db.findMatch(created.gameId)).toBeNull()
  })

  it('filters open and full matches', async () => {
    const db = new InMemoryDb()
    const openGame = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: null } }))
    const fullGame = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: FIONA_ID } }))

    expect((await db.listMatches({ availability: 'open' })).map((match) => match.gameId)).toEqual([openGame.gameId])
    expect((await db.listMatches({ availability: 'full' })).map((match) => match.gameId)).toEqual([fullGame.gameId])
  })
})

describe('InMemoryDb snapshot revisions', () => {
  it('increments for client-visible mutations but not event-only appends', async () => {
    const db = new InMemoryDb()
    const created = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: null } }))

    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(0)

    await db.appendEvents(created.gameId, [{ seq: 1, type: 'DIAGNOSTIC_ONLY', timestamp: new Date().toISOString() }])
    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(0)

    await db.joinMatch(created.gameId, FIONA_ID, 'join-1')
    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(1)

    await db.startMatch(created.gameId, SHREK_ID, 'start-1')
    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(2)
  })

  it('increments gameplay persistence once and preserves the revision on stale writes', async () => {
    const db = new InMemoryDb()
    const created = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: FIONA_ID }, status: 'active' }))
    const initial = await db.findMatch(created.gameId)

    await db.persistMatchProgress({
      gameId: created.gameId,
      phase: 'ONION_COMBAT',
      turnNumber: 1,
      winner: null,
      status: 'active',
      state: makeGameState(),
      events: [{ seq: 1, type: 'PHASE_CHANGED', timestamp: new Date().toISOString() }],
      expectedLastEventSeq: initial?.events.at(-1)?.seq ?? 0,
    })

    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(1)

    await expect(db.persistMatchProgress({
      gameId: created.gameId,
      phase: 'DEFENDER_MOVE',
      turnNumber: 2,
      winner: null,
      status: 'active',
      state: makeGameState(),
      events: [{ seq: 1, type: 'STALE_WRITE', timestamp: new Date().toISOString() }],
      expectedLastEventSeq: 0,
    })).rejects.toMatchObject({ name: 'StaleMatchStateError' })

    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(1)
  })

  it('increments for archive and restore but not for event-only appends', async () => {
    const db = new InMemoryDb()
    const created = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: FIONA_ID }, status: 'completed', winner: SHREK_ID }))

    await db.appendEvents(created.gameId, [{ seq: 1, type: 'AUDIT_ONLY', timestamp: new Date().toISOString() }])
    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(0)

    await db.archiveMatch(created.gameId, SHREK_ID)
    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(1)

    await db.restoreMatch(created.gameId, SHREK_ID)
    expect(getSnapshotRevision(await db.findMatch(created.gameId))).toBe(2)
  })
})
