import { describe, expect, it } from 'vitest'

import { buildApp } from '../app.js'
import { createGame, joinGame, register, submitAction } from './helpers.js'

describe('POST /games/:id/actions combat stubs', () => {
  it('acknowledges FIRE_UNIT commands without mutating state', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const before = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${shrek.token}` },
    })
    const res = await submitAction(app, gameId, shrek.token, {
      type: 'FIRE_UNIT',
      unitId: 'onion',
      targetId: 'wolf-1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.events).toHaveLength(1)
    expect(body.events[0].type).toBe('ACTION_ACKNOWLEDGED')
    expect(body.state).toEqual(before.json().state)
  })

  it('acknowledges COMBINED_FIRE commands', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const res = await submitAction(app, gameId, shrek.token, {
      type: 'COMBINED_FIRE',
      unitIds: ['secondary_1', 'secondary_2'],
      targetId: 'wolf-1',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.events[0].type).toBe('ACTION_ACKNOWLEDGED')
    expect(body.events[0].command).toBe('COMBINED_FIRE')
  })
})