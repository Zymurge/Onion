import { describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.js'
import * as engineGameInternal from '../engine/game.js'
import { createGame, endPhase, joinGame, register } from './helpers.js'

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
})