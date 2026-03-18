import { describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.js'
import * as engineGame from '../engine/index.js'
import { advanceToPhase, createGame, joinGame, register, submitAction } from './helpers.js'

describe('POST /games/:id/actions combat API contract', () => {
  it('returns 422 and detailCode for illegal combined fire on Onion treads', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: false,
      code: 'COMBINED_FIRE_TREAD_TARGET',
      error: 'Combined fire is not allowed on Onion treads.',
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'COMBINED_FIRE',
      unitIds: ['wolf-1', 'puss-1'],
      targetId: 'onion',
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('MOVE_INVALID')
    expect(body.detailCode).toBe('COMBINED_FIRE_TREAD_TARGET')
    expect(body.error).toMatch(/Combined fire is not allowed on Onion treads/)
    validateSpy.mockRestore()
  })

  it('returns 422 and detailCode for exhausted weapon', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'ONION_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: false,
      code: 'WEAPON_EXHAUSTED',
      error: 'Missile 0 is already destroyed or exhausted',
    })

    const res = await submitAction(app, gameId, shrek.token, {
      type: 'FIRE_WEAPON',
      weaponType: 'missile',
      weaponIndex: 0,
      targetId: 'wolf-1',
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('MOVE_INVALID')
    expect(body.detailCode).toBe('WEAPON_EXHAUSTED')
    expect(body.error).toMatch(/destroyed or exhausted/)
    validateSpy.mockRestore()
  })

  it('returns 422 and detailCode for illegal target', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'ONION_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: false,
      code: 'NO_TARGET',
      error: 'Target not found',
    })

    const res = await submitAction(app, gameId, shrek.token, {
      type: 'FIRE_WEAPON',
      weaponType: 'main',
      weaponIndex: 0,
      targetId: 'not-a-unit',
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('MOVE_INVALID')
    expect(body.detailCode).toBe('NO_TARGET')
    expect(body.error).toMatch(/Target not found/)
    validateSpy.mockRestore()
  })

  it('returns 200 and emits combat and damage events for valid FIRE_UNIT', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: true,
      plan: {
        actionType: 'FIRE_UNIT',
        attackerIds: ['wolf-1'],
        target: { kind: 'treads', id: 'onion' },
        attackStrength: 2,
        defense: 0,
      },
    } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeCombatAction').mockImplementation((state) => {
      state.onion.treads = 43
      return {
        success: true,
        actionType: 'FIRE_UNIT',
        attackerIds: ['wolf-1'],
        targetId: 'onion',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        treadsLost: 2,
      }
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'FIRE_UNIT',
      unitId: 'wolf-1',
      targetId: 'onion',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.events[0].type).toBe('UNIT_FIRED')
    expect(body.events[0].unitId).toBe('wolf-1')
    expect(body.events[0].targetId).toBe('onion')
    expect(body.events[1].type).toBe('ONION_TREADS_LOST')
    expect(body.events[1].amount).toBe(2)
    expect(body.events[1].remaining).toBe(43)
    expect(body.state.onion.treads).toBe(43)
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('returns 200 and emits combat and subsystem damage events for valid COMBINED_FIRE', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: true,
      plan: {
        actionType: 'COMBINED_FIRE',
        attackerIds: ['wolf-1', 'puss-1'],
        target: { kind: 'weapon', id: 'main' },
        attackStrength: 6,
        defense: 4,
      },
    } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeCombatAction').mockImplementation((state) => {
      ;(state.onion as any).batteries.main = 0
      return {
        success: true,
        actionType: 'COMBINED_FIRE',
        attackerIds: ['wolf-1', 'puss-1'],
        targetId: 'main',
        roll: { roll: 4, result: 'X', odds: '2:1' },
        destroyedWeaponId: 'main',
      }
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'COMBINED_FIRE',
      unitIds: ['wolf-1', 'puss-1'],
      targetId: 'main',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.events[0].type).toBe('COMBINED_FIRE_RESOLVED')
    expect(body.events[0].unitIds).toEqual(['wolf-1', 'puss-1'])
    expect(body.events[0].targetId).toBe('main')
    expect(body.events[1].type).toBe('ONION_BATTERY_DESTROYED')
    expect(body.events[1].weaponId).toBe('main')
    expect(body.events[1].weaponType).toBe('main')
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })
})