import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '#server/app'
import { StaleMatchStateError } from '#server/db/adapter'
import * as engineGame from '#server/engine/index'
import { materializeScenarioMap } from '#shared/scenarioMap'
import { advanceToPhase, createGame, joinGame, register, submitAction } from './helpers.js'
import logger from '#server/logger'

let infoSpy: any
let warnSpy: any
let errorSpy: any
let debugSpy: any

beforeEach(() => {
  infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
  debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {})
})

afterEach(() => {
  infoSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
  debugSpy.mockRestore()
})

describe('POST /games/:id/actions combat API contract', () => {
  it('rejects legacy FIRE_* command variants', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const legacyCommands = [
      {
        phase: 'ONION_COMBAT',
        token: shrek.token,
        command: { type: 'FIRE_WEAPON', weaponType: 'main', weaponIndex: 0, targetId: 'wolf-1' },
      },
      {
        phase: 'DEFENDER_COMBAT',
        token: fiona.token,
        command: { type: 'FIRE_UNIT', unitId: 'wolf-1', targetId: 'onion' },
      },
      {
        phase: 'DEFENDER_COMBAT',
        token: fiona.token,
        command: { type: 'COMBINED_FIRE', unitIds: ['wolf-1', 'puss-1'], targetId: 'onion' },
      },
    ] as const

    for (const { phase, token, command } of legacyCommands) {
      await advanceToPhase(app, gameId, shrek.token, fiona.token, phase)
      const res = await submitAction(app, gameId, token, command as unknown as Record<string, unknown>)
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.code).toBe('COMMAND_INVALID')
      expect(body.detailCode).toBe(`UNKNOWN_COMMAND ${command.type}`)
    }
  })

  it('returns 422 and detailCode for illegal multi-attacker fire on Onion treads', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)
    await advanceToPhase(app, gameId, shrek.token, fiona.token, 'DEFENDER_COMBAT')

    const validateSpy = vi.spyOn(engineGame, 'validateCombatAction').mockReturnValue({
      ok: false,
      code: 'MULTI_ATTACK_TREAD_TARGET',
      error: 'Multi-attacker fire is not allowed on Onion treads.',
    })

    const res = await submitAction(app, gameId, fiona.token, {
      type: 'FIRE',
      attackers: ['wolf-1', 'puss-1'],
      targetId: 'onion',
    })

    expect(res.statusCode).toBe(422)
    const body = res.json()
    expect(body.ok).toBe(false)
    expect(body.code).toBe('MOVE_INVALID')
    expect(body.detailCode).toBe('MULTI_ATTACK_TREAD_TARGET')
    expect(body.error).toMatch(/Multi-attacker fire is not allowed on Onion treads/)
    validateSpy.mockRestore()
  })

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
    expect(body.events[0].causeId).toBeDefined()
    expect(body.events.every((event: any) => event.causeId === body.events[0].causeId)).toBe(true)
    expect(body.state.onion.treads).toBe(43)
    expect(infoSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        actionType: 'FIRE',
        outcome: expect.objectContaining({
          attackers: ['wolf-1'],
          targetId: 'onion',
          roll: 6,
          outcome: 'X',
          odds: '1:1',
          treadsLost: 2,
          destroyedWeaponId: null,
          squadsLost: null,
        }),
        events: expect.arrayContaining([
          expect.objectContaining({ type: 'FIRE_RESOLVED' }),
          expect.objectContaining({ type: 'ONION_TREADS_LOST' }),
        ]),
      }),
      'FIRE resolved',
    )
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
    expect(body.events[0].causeId).toBeDefined()
    expect(body.events.every((event: any) => event.causeId === body.events[0].causeId)).toBe(true)
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('returns 409 when persistence detects stale state for combat action', async () => {
    const onionId = '11111111-1111-4111-8111-111111111111'
    const defenderId = '22222222-2222-4222-8222-222222222222'
    const gameId = 333333333
    const mockDb = {
      createUser: async () => ({ userId: onionId }),
      findUserByUsername: async () => null,
      createMatch: async () => ({ gameId: 333333333 }),
      findMatch: async () => ({
        gameId,
        scenarioId: 'swamp-siege-01',
        scenarioSnapshot: {
          map: materializeScenarioMap({ radius: 10, hexes: [] }),
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
  
})