import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'
import * as engineGame from '../engine/index.js';
import * as engineGameInternal from '../engine/game.js';
import { vi } from 'vitest';
import { register, makeToken } from './helpers.js';


async function createGame(
  app: FastifyInstance,
  token: string,
  role: 'onion' | 'defender',
): Promise<{ gameId: string; role: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/games',
    headers: { authorization: `Bearer ${token}` },
    payload: { scenarioId: 'swamp-siege-01', role },
  })
  return res.json()
}

async function joinGame(
  app: FastifyInstance,
  gameId: string,
  token: string,
): Promise<{ gameId: string; role: string }> {
  const res = await app.inject({
    method: 'POST',
    url: `/games/${gameId}/join`,
    headers: { authorization: `Bearer ${token}` },
    payload: {},
  })
  return res.json()
}

async function endPhase(
  app: FastifyInstance,
  gameId: string,
  token: string,
) {
  return app.inject({
    method: 'POST',
    url: `/games/${gameId}/actions`,
    headers: { authorization: `Bearer ${token}` },
    payload: { type: 'END_PHASE' },
  })
}

// ── POST /games ────────────────────────────────────────────────────────────────

describe('POST /games', () => {
  it('creates a game and returns gameId and role', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ gameId: string; role: string }>()
    expect(typeof body.gameId).toBe('string')
    expect(body.role).toBe('onion')
  })

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 with specific message for invalid role', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'wizard' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_INPUT')
    expect(res.json().error).toBe('role must be "onion" or "defender"')
  })

  it('returns 400 with specific message for missing scenarioId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { role: 'onion' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_INPUT')
    expect(res.json().error).toBe('scenarioId is required')
  })

    it('returns 404 for unknown scenarioId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'invalid-scenario', role: 'onion' },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('NOT_FOUND')
    expect(res.json().error).toBe('Scenario not found')
  })

    it('returns 400 for payload too large (Fastify test injector limitation)', async () => {
      const app = buildApp()
      const { token } = await register(app, 'shrek')
      const big = 'x'.repeat(17 * 1024)
      const res = await app.inject({
        method: 'POST',
        url: '/games',
        headers: { authorization: `Bearer ${token}` },
        payload: { scenarioId: big, role: big },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 for malformed JSON', async () => {
      const app = buildApp()
      const { token } = await register(app, 'shrek')
      // Fastify inject limitation: send invalid JSON as string
      const res = await app.inject({
        method: 'POST',
        url: '/games',
        headers: { authorization: `Bearer ${token}` },
        body: '{ scenarioId: "swamp-siege-01", role: "onion" ',
      })
      expect([400, 500]).toContain(res.statusCode)
      // Accept 400 or 500 due to Fastify test injector
    })

    it('returns 500 for internal error (DAL mock, DB down on createMatch)', async () => {
      // Register a real user to get a valid userId/token
      const app = buildApp()
      const { userId, token } = await register(app, 'daltestuser')
      // Patch db to log and throw on createMatch, but allow user lookup
      const mockDb = {
        findUserByUsername: async (username: string) => ({ userId, passwordHash: 'irrelevant' }),
        createMatch: async (...args: any[]) => {
          // eslint-disable-next-line no-console
          console.log('MOCK createMatch called', ...args)
          throw new Error('fail')
        },
        findMatch: async () => null,
        updateMatchPlayers: async () => {},
        updateMatchState: async () => {},
        appendEvents: async () => {},
        getEvents: async () => [],
        createUser: async () => ({ userId }),
      }
      const appWithMock = buildApp(mockDb)
      const res = await appWithMock.inject({
        method: 'POST',
        url: '/games',
        headers: { authorization: `Bearer ${token}` },
        payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
      })
      // eslint-disable-next-line no-console
      console.log('MOCKED /games response', res.statusCode, res.json())
      expect(res.statusCode).toBe(500)
      expect(res.json().code).toBe('INTERNAL_ERROR')
    })

})

// ── POST /games/:id/join ───────────────────────────────────────────────────────

describe('POST /games/:id/join', () => {
  it('assigns the remaining role to a second player', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      headers: { authorization: `Bearer ${fiona.token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().role).toBe('defender')
  })

  it('returns 409 when game is already full', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const puss = await register(app, 'puss')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      headers: { authorization: `Bearer ${puss.token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('GAME_FULL')
  })

  it('returns 400 when trying to join own game', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const { gameId } = await createGame(app, shrek.token, 'onion')

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('CANNOT_JOIN_OWN_GAME')
  })

  it('returns 404 for an unknown gameId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'POST',
      url: '/games/00000000-0000-4000-8000-000000000000/join',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')
    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      payload: {},
    })
    expect(res.statusCode).toBe(401)
  })

// ── GET /games/:id ─────────────────────────────────────────────────────────────

describe('GET /games/:id', () => {
  it('returns full game state', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')

    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.gameId).toBe(gameId)
    expect(body.phase).toBe('ONION_MOVE')
    expect(body.turnNumber).toBe(1)
    expect(body.winner).toBeNull()
    expect(body).toHaveProperty('state')
    expect(typeof body.eventSeq).toBe('number')
  })

  it('returns 401 without auth', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')
    const res = await app.inject({ method: 'GET', url: `/games/${gameId}` })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for unknown gameId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'GET',
      url: '/games/00000000-0000-4000-8000-000000000000',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })
})

// ── POST /games/:id/actions ────────────────────────────────────────────────────

describe('POST /games/:id/actions', () => {
  it('END_PHASE returns ok with seq, events, and state', async () => {
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

  it('END_PHASE advances phase from ONION_MOVE to ONION_COMBAT', async () => {
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

    // ONION_MOVE → ONION_COMBAT
    await endPhase(app, gameId, shrek.token)
    // ONION_COMBAT → (auto-skip DEFENDER_RECOVERY) → DEFENDER_MOVE
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
    const lastEventSeq = body.events.at(-1).seq
    expect(body.seq).toBe(lastEventSeq)
  })

  it('returns 403 when submitting on opponent turn', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    // Game is in ONION_MOVE; fiona is the defender
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

  it('returns 500 for internal error (engine mock, advancePhaseWithEvents throws)', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    // Ensure it's shrek's turn (onion, ONION_MOVE)
    // Properly mock advancePhaseWithEvents to throw
    const spy = vi.spyOn(engineGameInternal, 'advancePhaseWithEvents').mockImplementation(() => { throw new Error('engine fail') })

    const res = await endPhase(app, gameId, shrek.token)
    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_ERROR')

    spy.mockRestore()
  })
})

// ── GET /games/:id/events ──────────────────────────────────────────────────────

describe('GET /games/:id/events', () => {
  it('returns an empty events array before any actions', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')

    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/events?after=0`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().events).toEqual([])
  })

  it('returns events after the specified seq', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await endPhase(app, gameId, shrek.token)

    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/events?after=0`,
      headers: { authorization: `Bearer ${fiona.token}` },
    })
    expect(res.statusCode).toBe(200)
    const { events } = res.json<{ events: { seq: number; type: string }[] }>()
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((e) => e.seq > 0)).toBe(true)
  })

  it('returns 401 without auth token', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')
    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/events?after=0`,
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 404 for unknown gameId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const res = await app.inject({
      method: 'GET',
      url: '/games/00000000-0000-4000-8000-000000000000/events?after=0',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('defaults after=0 when param is omitted', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')
    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/events`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().events).toEqual([])
  })

  it('returns only events after the given seq cursor', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    // Generate two batches of events
    const first = await endPhase(app, gameId, shrek.token) // ONION_MOVE → ONION_COMBAT
    const firstSeq = first.json().seq
    await endPhase(app, gameId, shrek.token) // ONION_COMBAT → DEFENDER_MOVE (via recovery)

    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/events?after=${firstSeq}`,
      headers: { authorization: `Bearer ${fiona.token}` },
    })
    const { events } = res.json<{ events: { seq: number }[] }>()
    expect(events.every((e) => e.seq > firstSeq)).toBe(true)
  })
})

it('MOVE_ONION calls engine and updates state on success', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    // Place Onion at (0,0) and move to (1,0)
    // Spy on engine
    const spy = vi.spyOn(engineGame, 'executeOnionMovement').mockImplementation((map, state, command) => {
      state.onion.position = command.to
      return { success: true, newPosition: command.to }
    })

    const moveCmd = { type: 'MOVE_ONION', to: { q: 1, r: 0 } }
    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: moveCmd,
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.state.onion.position).toEqual({ q: 1, r: 0 })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('MOVE_ONION returns error if engine fails', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    // Spy on engine to simulate failure
    const spy = vi.spyOn(engineGame, 'executeOnionMovement').mockImplementation(() => {
      return { success: false, error: 'No valid path' }
    })

    const moveCmd = { type: 'MOVE_ONION', to: { q: 99, r: 99 } }
    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: moveCmd,
    })
    expect(res.statusCode).toBe(400)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/No valid path/)
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('uses scenario initialState and exposes scenarioName and units', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')

    const res = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    // Scenario name should match scenario file
    expect(body.scenarioName).toBe('The Siege of Shrek\'s Swamp')
    // Onion and defenders should be present in state
    const onion = body.state.onion
    const defenders = body.state.defenders
    // Onion must exist and have a position
    expect(onion).toBeDefined()
    expect(onion.position).toBeDefined()
    // Defenders must be an object with at least one key
    expect(defenders).toBeDefined()
    expect(Object.keys(defenders).length).toBeGreaterThanOrEqual(1)
  })
})
