import { describe, expect, it } from 'vitest'

import { buildApp } from '#server/app'
import { createGame, getEvents, getGame, joinGame, register } from './helpers.js'

describe('POST /games', () => {
  it('creates a game and returns gameId and role', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ gameId: number; role: string }>()
    expect(typeof body.gameId).toBe('number')
    expect(body.role).toBe('onion')
  })

  it('creates a game with the signed JWT returned by registration', async () => {
    const app = buildApp()
    const registration = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'jwt-shrek', email: 'jwt-shrek@example.com', password: 'swamp1234' },
    })
    const { token } = registration.json<{ token: string }>()

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })

    expect(res.statusCode).toBe(201)
    expect(token).toEqual(expect.any(String))
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

  it('returns 401 for a legacy token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: 'Bearer legacy.550e8400-e29b-41d4-a716-446655440000' },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })

    expect(res.statusCode).toBe(401)
  })

  it.each([
    ['malformed JWT', 'Bearer not-a-jwt'],
    ['missing subject', 'signed-within-test'],
    ['non-UUID subject', 'signed-within-test'],
    ['tampered JWT', 'signed-within-test'],
  ])('returns 401 for a %s', async (description, marker) => {
    const app = buildApp()
    await app.ready()
    let authorization = marker
    if (description === 'missing subject') {
      authorization = `Bearer ${app.jwt.sign({})}`
    } else if (description === 'non-UUID subject') {
      authorization = `Bearer ${app.jwt.sign({ sub: 'user-1' })}`
    } else if (description === 'tampered JWT') {
      const token = app.jwt.sign({ sub: '550e8400-e29b-41d4-a716-446655440000' })
      authorization = `Bearer ${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`
    }

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })

    expect(res.statusCode, description).toBe(401)
  })

  it('returns 401 for a JWT signed with another secret', async () => {
    const app = buildApp()
    const otherApp = buildApp(undefined, {
      config: {
        port: 3000,
        host: '127.0.0.1',
        databaseUrl: 'postgres://onion:onionpass@127.0.0.1:5432/onion-test',
        jwtSecret: 'another-test-jwt-secret-that-is-long-enough',
        nodeEnv: 'test',
        logLevel: 'error',
        scenariosDir: `${process.cwd()}/scenarios`,
      },
    })
    await app.ready()
    await otherApp.ready()
    const token = otherApp.jwt.sign({ sub: '550e8400-e29b-41d4-a716-446655440000' })

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 'onion' },
    })

    expect(res.statusCode).toBe(401)
    await app.close()
    await otherApp.close()
  })

  it('returns 400 INVALID_INPUT for invalid role', async () => {
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
  })

  it('returns 400 INVALID_INPUT for missing scenarioId', async () => {
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
  })

  it('returns 400 INVALID_INPUT for missing role', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'swamp-siege-01' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for non-string scenarioId', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 123, role: 'onion' },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_INPUT')
  })

  it('returns 400 INVALID_INPUT for non-string role', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'swamp-siege-01', role: 123 },
    })

    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('INVALID_INPUT')
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

  it('allows only one concurrent join and persists one join event', async () => {
    const app = buildApp()
    const creator = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const donkey = await register(app, 'donkey')
    const { gameId } = await createGame(app, creator.token, 'onion')

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/games/${gameId}/join`,
        headers: { authorization: `Bearer ${fiona.token}` },
        payload: {},
      }),
      app.inject({
        method: 'POST',
        url: `/games/${gameId}/join`,
        headers: { authorization: `Bearer ${donkey.token}` },
        payload: {},
      }),
    ])

    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 409])

    const state = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${creator.token}` },
    })
    expect(state.json().players.onion).not.toBeNull()
    expect(state.json().players.defender).not.toBeNull()

    const events = await app.inject({
      method: 'GET',
      url: `/games/${gameId}/events`,
      headers: { authorization: `Bearer ${creator.token}` },
    })
    expect(events.json().events.filter((event: { type: string }) => event.type === 'PLAYER_JOINED')).toHaveLength(1)
  })
})

describe('POST /games/:id/start', () => {
  it('requires authentication', async () => {
    const app = buildApp()
    const host = await register(app, 'shrek')
    const { gameId } = await createGame(app, host.token, 'onion')

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/start`,
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().code).toBe('UNAUTHORIZED')
  })

  it('allows only the host to start a full game', async () => {
    const app = buildApp()
    const host = await register(app, 'shrek')
    const joiner = await register(app, 'fiona')
    const { gameId } = await createGame(app, host.token, 'onion')
    await joinGame(app, gameId, joiner.token)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/start`,
      headers: { authorization: `Bearer ${joiner.token}` },
    })

    expect(res.statusCode).toBe(403)
    expect(res.json().code).toBe('NOT_HOST')
  })

  it('starts a ready game and persists a STARTED event', async () => {
    const app = buildApp()
    const host = await register(app, 'shrek')
    const joiner = await register(app, 'fiona')
    const { gameId } = await createGame(app, host.token, 'onion')
    await joinGame(app, gameId, joiner.token)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/start`,
      headers: { authorization: `Bearer ${host.token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      gameId,
      status: 'active',
      event: expect.objectContaining({
        seq: 2,
        type: 'STARTED',
        userId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }),
    })

    const state = await getGame(app, gameId, host.token)
    expect(state.json().status).toBe('active')

    const events = await getEvents(app, gameId, host.token)
    expect(events.json().events).toEqual([
      expect.objectContaining({ type: 'PLAYER_JOINED', seq: 1 }),
      expect.objectContaining({ type: 'STARTED', seq: 2, userId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    ])
  })

  it('rejects starting before the second player joins and after the game starts', async () => {
    const app = buildApp()
    const host = await register(app, 'shrek')
    const joiner = await register(app, 'fiona')
    const { gameId } = await createGame(app, host.token, 'onion')

    const waitingResponse = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/start`,
      headers: { authorization: `Bearer ${host.token}` },
    })
    expect(waitingResponse.statusCode).toBe(409)
    expect(waitingResponse.json().code).toBe('GAME_NOT_READY')

    await joinGame(app, gameId, joiner.token)
    const startedResponse = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/start`,
      headers: { authorization: `Bearer ${host.token}` },
    })
    expect(startedResponse.statusCode).toBe(200)

    const repeatedResponse = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/start`,
      headers: { authorization: `Bearer ${host.token}` },
    })
    expect(repeatedResponse.statusCode).toBe(409)
    expect(repeatedResponse.json().code).toBe('GAME_ALREADY_STARTED')
  })
})

describe('GET /games', () => {
  it('returns empty array when user has no games', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'GET',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ games: [] })
  })

  it('returns games the user created', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const { gameId } = await createGame(app, shrek.token, 'onion')

    const res = await app.inject({
      method: 'GET',
      url: '/games',
      headers: { authorization: `Bearer ${shrek.token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ games: Array<{ gameId: number; role: string; scenarioId: string; scenarioDisplayName: string; status: string; hostUserId: string }> }>()
    expect(body.games).toHaveLength(1)
    expect(body.games[0].gameId).toBe(gameId)
    expect(body.games[0].role).toBe('onion')
    expect(body.games[0].scenarioId).toBe('swamp-siege-01')
    expect(body.games[0].scenarioDisplayName).toBe('The Siege of Shrek\'s Swamp')
    expect(body.games[0].status).toBe('waiting')
    expect(body.games[0].hostUserId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('returns 500 when a persisted game references a missing scenario', async () => {
    const userId = '00000000-0000-4000-8000-000000000001'
    const app = buildApp({
      listMatches: async () => [{
        gameId: 1,
        scenarioId: 'missing-scenario',
        phase: 'ONION_MOVE',
        turnNumber: 1,
        winner: null,
        players: { onion: userId, defender: null },
        hostUserId: userId,
        status: 'waiting',
      }],
    })
    await app.ready()
    const token = app.jwt.sign({ sub: userId })

    const res = await app.inject({
      method: 'GET',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(500)
    expect(res.json()).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' })
  })

  it('returns games the user joined', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await app.inject({
      method: 'GET',
      url: '/games',
      headers: { authorization: `Bearer ${fiona.token}` },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json<{ games: Array<{ gameId: number; role: string; status: string }> }>()
    expect(body.games).toHaveLength(1)
    expect(body.games[0].gameId).toBe(gameId)
    expect(body.games[0].role).toBe('defender')
    expect(body.games[0].status).toBe('ready')

    const creatorRes = await app.inject({
      method: 'GET',
      url: '/games',
      headers: { authorization: `Bearer ${shrek.token}` },
    })

    expect(creatorRes.statusCode).toBe(200)
    const creatorBody = creatorRes.json<{ games: Array<{ gameId: number; status: string }> }>()
    expect(creatorBody.games).toHaveLength(1)
    expect(creatorBody.games[0].gameId).toBe(gameId)
    expect(creatorBody.games[0].status).toBe('ready')
  })

  it('returns 401 without auth token', async () => {
    const app = buildApp()

    const res = await app.inject({
      method: 'GET',
      url: '/games',
    })

    expect(res.statusCode).toBe(401)
  })
})

describe('GET /games/open', () => {
  it('returns empty array when no open games exist', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')

    const res = await app.inject({
      method: 'GET',
      url: '/games/open',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ games: [] })
  })

  it('returns a waiting game with its available role and scenario name', async () => {
    const app = buildApp()
    const creator = await register(app, 'shrek')
    const visitor = await register(app, 'fiona')
    const { gameId } = await createGame(app, creator.token, 'onion')

    const res = await app.inject({
      method: 'GET',
      url: '/games/open',
      headers: { authorization: `Bearer ${visitor.token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      games: [{
        gameId,
        scenarioId: 'swamp-siege-01',
        scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
        creatorRole: 'onion',
        openRole: 'defender',
      }],
    })
  })

  it('does not return the caller own waiting game', async () => {
    const app = buildApp()
    const creator = await register(app, 'shrek')
    await createGame(app, creator.token, 'defender')

    const res = await app.inject({
      method: 'GET',
      url: '/games/open',
      headers: { authorization: `Bearer ${creator.token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ games: [] })
  })

  it('excludes full games', async () => {
    const app = buildApp()
    const creator = await register(app, 'shrek')
    const joiner = await register(app, 'fiona')
    const visitor = await register(app, 'donkey')
    const { gameId } = await createGame(app, creator.token, 'onion')
    await joinGame(app, gameId, joiner.token)

    const res = await app.inject({
      method: 'GET',
      url: '/games/open',
      headers: { authorization: `Bearer ${visitor.token}` },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ games: [] })
  })

  it('returns 401 without auth token', async () => {
    const app = buildApp()

    const res = await app.inject({ method: 'GET', url: '/games/open' })

    expect(res.statusCode).toBe(401)
  })
})