import { describe, expect, it } from 'vitest'

import { buildApp } from '#server/app'
import { createGame, endPhase, getEvents, joinGame, register } from './helpers.js'

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
    expect(body.role).toBe('onion')
    expect(body.phase).toBe('ONION_MOVE')
    expect(body.turnNumber).toBe(1)
    expect(body.winner).toBeNull()
    expect(body).toHaveProperty('state')
    expect(body).toHaveProperty('movementRemainingByUnit')
    expect(body).toHaveProperty('scenarioMap')
    expect(body.scenarioMap.width).toBeGreaterThan(0)
    expect(body.scenarioMap.height).toBeGreaterThan(0)
    expect(typeof body.eventSeq).toBe('number')
    expect(body.movementRemainingByUnit[body.state.onion.id ?? 'onion-1']).toBe(3)
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
    expect(body.scenarioName).toBe("The Siege of Shrek's Swamp")
    expect(body.role).toBe('onion')
    expect(body.state.onion).toBeDefined()
    expect(body.state.onion.position).toBeDefined()
    expect(body.state.defenders).toBeDefined()
    expect(body.scenarioMap).toBeDefined()
    expect(body.scenarioMap.hexes).toBeDefined()
    expect(Object.keys(body.state.defenders).length).toBeGreaterThanOrEqual(1)
  })
})

describe('GET /games/:id/events', () => {
  it('returns an empty events array before any actions', async () => {
    const app = buildApp()
    const { token } = await register(app, 'shrek')
    const { gameId } = await createGame(app, token, 'onion')

    const res = await getEvents(app, gameId, token)

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

    const res = await getEvents(app, gameId, fiona.token)

    expect(res.statusCode).toBe(200)
    const { events } = res.json<{ events: { seq: number; type: string }[] }>()
    expect(events.length).toBeGreaterThan(0)
    expect(events.every((event) => event.seq > 0)).toBe(true)
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

    const first = await endPhase(app, gameId, shrek.token)
    const firstSeq = first.json().seq
    await endPhase(app, gameId, shrek.token)

    const res = await getEvents(app, gameId, fiona.token, firstSeq)

    const { events } = res.json<{ events: { seq: number }[] }>()
    expect(events.every((event) => event.seq > firstSeq)).toBe(true)
  })

  it('emits a PLAYER_JOINED event when a second player joins', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await getEvents(app, gameId, shrek.token)

    expect(res.statusCode).toBe(200)
    const { events } = res.json<{ events: { seq: number; type: string; userId: string; role: string; causeId?: string }[] }>()
    const joinEvent = events.find((event) => event.type === 'PLAYER_JOINED')
    expect(joinEvent).toBeDefined()
    expect(joinEvent?.userId).toBeDefined()
    expect(['onion', 'defender']).toContain(joinEvent?.role)
    expect(joinEvent?.causeId).toBeDefined()
  })
})