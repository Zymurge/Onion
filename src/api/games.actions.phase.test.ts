import { describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.js'
import { StaleMatchStateError } from '../db/adapter.js'
import * as engineGameInternal from '../engine/game.js'
import { createGame, endPhase, getEvents, joinGame, register } from './helpers.js'

describe('POST /games/:id/actions END_PHASE', () => {
  it('returns ok with seq, events, and state', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await endPhase(app, gameId, shrek.token)

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(typeof body.seq).toBe('number')
    expect(body.seq).toBeGreaterThan(0)
    expect(Array.isArray(body.events)).toBe(true)
    expect(body.events[0].type).toBe('PHASE_CHANGED')
    expect(body).toHaveProperty('state')
  })

  it('advances phase from ONION_MOVE to ONION_COMBAT', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    await endPhase(app, gameId, shrek.token)

    const state = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${shrek.token}` },
    })

    expect(state.json().phase).toBe('ONION_COMBAT')
  })

  it('auto-advances through DEFENDER_RECOVERY to DEFENDER_MOVE', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    await endPhase(app, gameId, shrek.token)
    await endPhase(app, gameId, shrek.token)

    const state = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${shrek.token}` },
    })

    expect(state.json().phase).toBe('DEFENDER_MOVE')
  })

  it('seq in response matches last event seq', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await endPhase(app, gameId, shrek.token)
    const body = res.json()

    expect(body.seq).toBe(body.events.at(-1).seq)
  })

  it('persists END_PHASE events and advances event cursor', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const action = await endPhase(app, gameId, shrek.token)
    const actionBody = action.json<{ eventSeq: number }>()
    const eventsRes = await getEvents(app, gameId, shrek.token)
    const events = eventsRes.json<{ events: Array<{ seq: number; type: string }> }>().events

    expect(events.some((event) => event.type === 'PHASE_CHANGED')).toBe(true)
    expect(events.at(-1)?.seq).toBe(actionBody.eventSeq)
  })

  it('returns 403 when submitting on opponent turn', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await endPhase(app, gameId, fiona.token)

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('NOT_YOUR_TURN')
    expect(res.json()).toHaveProperty('currentPhase')
  })

  it('returns 400 when second player has not yet joined', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')

    const res = await endPhase(app, gameId, token)

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('WAITING_FOR_PLAYER')
  })

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      payload: { type: 'END_PHASE' },
    })

    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for unknown gameId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'POST',
      url: '/games/00000000-0000-4000-8000-000000000000/actions',
      headers: { authorization: `Bearer ${token}` },
      payload: { type: 'END_PHASE' },
    })

    expect(res.statusCode).toBe(404)
  })

  it('returns 400 with INVALID_INPUT code for missing command type', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: {},
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_INPUT')
    expect(res.json()).toHaveProperty('currentPhase')
  })

  it('returns 400 COMMAND_INVALID for unknown command types', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'SELF_DESTRUCT' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('COMMAND_INVALID')
    expect(res.json().detailCode).toBe('UNKNOWN_COMMAND SELF_DESTRUCT')
    expect(res.json()).toHaveProperty('currentPhase')
  })

  it('returns 500 for internal advancePhaseWithEvents failure', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const spy = vi.spyOn(engineGameInternal, 'advancePhaseWithEvents').mockImplementation(() => {
      throw new Error('engine fail')
    })

    const res = await endPhase(app, gameId, shrek.token)

    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_ERROR')
    spy.mockRestore()
  })

  it('returns 409 when persistence detects stale state', async () => {
    const onionId = '11111111-1111-4111-8111-111111111111'
    const defenderId = '22222222-2222-4222-8222-222222222222'
    const gameId = '33333333-3333-4333-8333-333333333333'
    const mockDb = {
      createUser: async () => ({ userId: onionId }),
      findUserByUsername: async () => null,
      createMatch: async () => {},
      findMatch: async () => ({
        gameId,
        scenarioId: 'swamp-siege-01',
        scenarioSnapshot: {
          map: { width: 22, height: 14, hexes: [] },
          victoryConditions: { maxTurns: 20 },
        },
        players: { onion: onionId, defender: defenderId },
        phase: 'ONION_MOVE' as const,
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            position: { q: 0, r: 10 },
            treads: 45,
            missiles: 2,
            batteries: { main: 1, secondary: 4, ap: 8 },
          },
          defenders: {},
          ramsThisTurn: 0,
        },
        events: [],
      }),
      updateMatchPlayers: async () => {},
      updateMatchState: async () => {},
      persistMatchProgress: async () => {
        throw new StaleMatchStateError('stale')
      },
      appendEvents: async () => {},
      getEvents: async () => [],
    }

    const app = buildApp(mockDb)
    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer stub.${onionId}` },
      payload: { type: 'END_PHASE' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('STALE_STATE')
  })
})
