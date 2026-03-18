import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'
import { createGame, joinGame, register } from './helpers.js'

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

  it('returns 400 for payload too large', async () => {
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

  it('returns 400 or 500 for malformed JSON via injector', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      body: '{ scenarioId: "swamp-siege-01", role: "onion" ',
    })

    expect([400, 500]).toContain(res.statusCode)
  })

  it('returns 500 for internal createMatch failure', async () => {
    const app = buildApp()
    const { userId, token } = await register(app, 'daltestuser')
    const mockDb = {
      findUserByUsername: async () => ({ userId, passwordHash: 'irrelevant' }),
      createMatch: async () => { throw new Error('fail') },
      findMatch: async () => null,
      updateMatchPlayers: async () => {},
      updateMatchState: async () => {},
      persistMatchProgress: async () => {},
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

    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_ERROR')
  })
})

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
    expect(res.json()).toEqual({ gameId, role: 'defender' })
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

  it('returns 409 when the game is already full', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const donkey = await register(app, 'donkey')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/join`,
      headers: { authorization: `Bearer ${donkey.token}` },
      payload: {},
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('GAME_FULL')
  })
})