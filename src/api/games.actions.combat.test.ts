import { describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.js'
import { StaleMatchStateError } from '../db/adapter.js'
import * as engineGame from '../engine/index.js'
import { advanceToPhase, createGame, joinGame, register, submitAction } from './helpers.js'

describe('POST /games/:id/actions combat API contract', () => {
  it('returns 422 and detailCode for duplicate attacker in FIRE command', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: false,
      code: 'DUPLICATE_ATTACKER',
      error: "Duplicate attacker 'wolf-1'",
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'FIRE',
      attackers: ['wolf-1', 'wolf-1'],
      targetId: 'onion',
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('MOVE_INVALID')
    expect(body.detailCode).toBe('DUPLICATE_ATTACKER')
    expect(body.error).toMatch(/Duplicate attacker 'wolf-1'/)
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
      type: 'FIRE',
      attackers: ['missile_1'],
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
      type: 'FIRE',
      attackers: ['main'],
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

  it('returns 200 and emits combat and damage events for valid FIRE', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: true,
      plan: {
        actionType: 'FIRE',
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
        actionType: 'FIRE',
        attackerIds: ['wolf-1'],
        targetId: 'onion',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        treadsLost: 2,
      }
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'FIRE',
      attackers: ['wolf-1'],
      targetId: 'onion',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.events[0].type).toBe('FIRE_RESOLVED')
    expect(body.events[0].attackers).toEqual(['wolf-1'])
    expect(body.events[0].targetId).toBe('onion')
    expect(body.events[1].type).toBe('ONION_TREADS_LOST')
    expect(body.events[1].amount).toBe(2)
    expect(body.events[1].remaining).toBe(43)
    expect(body.state.onion.treads).toBe(43)
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('returns 200 and emits combat and subsystem damage events for multi-attacker FIRE', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: true,
      plan: {
        actionType: 'FIRE',
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
        actionType: 'FIRE',
        attackerIds: ['wolf-1', 'puss-1'],
        targetId: 'main',
        roll: { roll: 4, result: 'X', odds: '2:1' },
        destroyedWeaponId: 'main',
      }
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'FIRE',
      attackers: ['wolf-1', 'puss-1'],
      targetId: 'main',
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.events[0].type).toBe('FIRE_RESOLVED')
    expect(body.events[0].attackers).toEqual(['wolf-1', 'puss-1'])
    expect(body.events[0].targetId).toBe('main')
    expect(body.events[1].type).toBe('ONION_BATTERY_DESTROYED')
    expect(body.events[1].weaponId).toBe('main')
    expect(body.events[1].weaponType).toBe('main')
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('returns 409 when persistence detects stale state for combat action', async () => {
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
        phase: 'ONION_COMBAT' as const,
        turnNumber: 1,
        winner: null,
        state: {
          onion: { position: { q: 0, r: 10 }, treads: 45, missiles: 2, batteries: { main: 1, secondary: 4, ap: 8 } },
          defenders: { 'wolf-1': { type: 'GEV', position: { q: 3, r: 10 }, status: 'operational' as const } },
          ramsThisTurn: 0,
        },
        events: [],
      }),
      updateMatchPlayers: async () => {},
      updateMatchState: async () => {},
      persistMatchProgress: async () => { throw new StaleMatchStateError('stale') },
      appendEvents: async () => {},
      getEvents: async () => [],
    }

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: true,
      plan: { actionType: 'FIRE', attackerIds: ['main'], target: { kind: 'defender', id: 'wolf-1' }, attackStrength: 4, defense: 2 },
    } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeCombatAction').mockReturnValue({
      success: true, actionType: 'FIRE', targetId: 'wolf-1', roll: { roll: 5, result: 'X', odds: '2:1' },
    } as any)

    const app = buildApp(mockDb)
    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer stub.${onionId}` },
      payload: { type: 'FIRE', attackers: ['main'], targetId: 'wolf-1' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('STALE_STATE')
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('persists winner when Onion destroys the Castle via combat', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'ONION_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: true,
      plan: { actionType: 'FIRE', attackerIds: ['main'], target: { kind: 'defender', id: 'castle' }, attackStrength: 8, defense: 2 },
    } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeCombatAction').mockImplementation((state) => {
      // Simulate castle being destroyed — Onion wins
      if (state.defenders['castle']) {
        state.defenders['castle'].status = 'destroyed'
      } else {
        // inject a castle into state so checkVictoryConditions can find it
        state.defenders['castle'] = { type: 'Castle', position: { q: 5, r: 5 }, status: 'destroyed' } as any
      }
      return {
        success: true,
        actionType: 'FIRE',
        attackerIds: ['main'],
        targetId: 'castle',
        roll: { roll: 6, result: 'X', odds: '3:1' },
        statusChanges: [{ unitId: 'castle', from: 'operational', to: 'destroyed' }],
      }
    })

    await submitAction(app, gameId, shrek.token, {
      type: 'FIRE',
      attackers: ['main'],
      targetId: 'castle',
    })

    validateSpy.mockRestore()
    executeSpy.mockRestore()

    const stateRes = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${shrek.token}` },
    })
    const body = stateRes.json()
    expect(body.winner).not.toBeNull()
    expect(body.winner).toBe(shrek.userId)
  })
})