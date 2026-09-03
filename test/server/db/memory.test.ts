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

    expect((await db.listMatches({ completion: 'active' })).map((match) => match.gameId)).toEqual([activeGame.gameId])
    expect((await db.listMatches({ completion: 'completed' })).map((match) => match.gameId)).toEqual([completedGame.gameId])
  })

  it('filters open and full matches', async () => {
    const db = new InMemoryDb()
    const openGame = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: null } }))
    const fullGame = await db.createMatch(makeMatch({ players: { onion: SHREK_ID, defender: FIONA_ID } }))

    expect((await db.listMatches({ availability: 'open' })).map((match) => match.gameId)).toEqual([openGame.gameId])
    expect((await db.listMatches({ availability: 'full' })).map((match) => match.gameId)).toEqual([fullGame.gameId])
  })
})
