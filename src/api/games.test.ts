import { describe, it, expect } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../app.js'

// ── helpers ────────────────────────────────────────────────────────────────────

async function register(
  app: FastifyInstance,
  username: string,
): Promise<{ userId: string; token: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { username, password: 'swamp1234' },
  })
  return res.json()
}

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
