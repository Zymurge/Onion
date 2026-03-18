import { describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.js'
import * as engineGame from '../engine/index.js'
import { createGame, createMovePlan, joinGame, register } from './helpers.js'

describe('POST /games/:id/actions MOVE', () => {
  it('calls engine and updates state on success', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const moveTo = { q: 1, r: 10 }
    const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo] })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation((state, plan) => {
      state.onion.position = plan.to
      return { success: true, newPosition: plan.to }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'MOVE', unitId: 'onion', to: moveTo },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.state.onion.position).toEqual(moveTo)
    expect(validateSpy).toHaveBeenCalled()
    expect(executeSpy).toHaveBeenCalled()
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('returns 422 when execution fails', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const validatedPlan = createMovePlan({ to: { q: 1, r: 1 }, path: [{ q: 1, r: 1 }] })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(() => {
      return { success: false, error: 'Injected executeUnitMovement error' }
    })

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'MOVE', unitId: 'onion', to: { q: 1, r: 1 } },
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toMatch(/Injected executeUnitMovement error/)
    expect(validateSpy).toHaveBeenCalled()
    expect(executeSpy).toHaveBeenCalled()
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })
})