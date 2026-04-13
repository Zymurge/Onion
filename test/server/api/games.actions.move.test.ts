import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { buildApp } from '#server/app'
import { StaleMatchStateError } from '#server/db/adapter'
import * as engineGame from '#server/engine/index'
import { materializeScenarioMap } from '#shared/scenarioMap'
import { createGame, createMovePlan, joinGame, register } from './helpers.js'
import logger from '#server/logger'

let infoSpy: any, warnSpy: any, errorSpy: any, debugSpy: any;

beforeEach(() => {
  infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => {});
});

afterEach(() => {
  infoSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
  debugSpy.mockRestore();
});

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
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: any, plan: any) => {
      state.onion.position = plan.to
      return { success: true, newPosition: plan.to }
    }) as any)

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
    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId,
        actionType: 'MOVE',
        eventCount: 1,
        eventTypes: ['ONION_MOVED'],
      }),
      'Events sent',
    )
    validateSpy.mockRestore()
    executeSpy.mockRestore()

    // Assert logger calls
    expect(infoSpy).toHaveBeenCalled()
    // Optionally: expect(warnSpy).not.toHaveBeenCalled()
    // Optionally: expect(errorSpy).not.toHaveBeenCalled()
  })

  it('records spent movement in the returned state after a successful move', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const initialStateRes = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${shrek.token}` },
    })
    const initialStateBody = initialStateRes.json<{ state: { onion: { id?: string; position: { q: number; r: number } } } }>()
    const onionUnitId = initialStateBody.state.onion.id ?? 'onion-1'

    const moveTo = { q: 1, r: 10 }
    const validatedPlan = createMovePlan({ unitId: onionUnitId, from: initialStateBody.state.onion.position, to: moveTo, path: [moveTo], cost: 1 })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'MOVE', unitId: onionUnitId, to: moveTo },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)
    expect(body.state.onion.position).toEqual(moveTo)
    expect(body.state.movementSpent).toMatchObject({ [`ONION_MOVE:${onionUnitId}`]: 1 })
    expect(body.movementRemainingByUnit).toMatchObject({ [onionUnitId]: 2 })
    expect(validateSpy).toHaveBeenCalled()
    validateSpy.mockRestore()
  })

  it('returns 422 when execution fails', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const validatedPlan = createMovePlan({ to: { q: 1, r: 1 }, path: [{ q: 1, r: 1 }] })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation((() => {
      return { success: false, error: 'Injected executeUnitMovement error' }
    }) as any)

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

  it('returns 409 when persistence detects stale state', async () => {
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
        phase: 'ONION_MOVE' as const,
        turnNumber: 1,
        winner: null,
        state: {
          onion: { position: { q: 0, r: 10 }, treads: 45, missiles: 2, batteries: { main: 1, secondary: 4, ap: 8 } },
          defenders: {},
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

    const moveTo = { q: 1, r: 10 }
    const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo] })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockReturnValue({ success: true, newPosition: moveTo } as any)

    const app = buildApp(mockDb)
    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer stub.${onionId}` },
      payload: { type: 'MOVE', unitId: 'onion', to: moveTo },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('STALE_STATE')
    validateSpy.mockRestore()
    executeSpy.mockRestore()
  })

  it('persists winner when Onion is immobilized by tread loss on a MOVE turn', async () => {
    // This tests that computeWinnerUserId is wired: if state after MOVE already
    // meets a victory condition the match winner is persisted and visible via GET.
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const moveTo = { q: 1, r: 10 }
    const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo] })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: any) => {
      state.onion.position = moveTo
      state.onion.treads = 0  // defender wins
      return { success: true, newPosition: moveTo }
    }) as any)

    await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'MOVE', unitId: 'onion', to: moveTo },
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
    expect(body.winner).toBe('defender')
  })

  it('emits ONION_TREADS_LOST and UNIT_STATUS_CHANGED events when a ram destroys a unit', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const moveTo = { q: 1, r: 10 }
    const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo], rammedUnitIds: ['d1'], ramCapacityUsed: 1, treadCost: 1 })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: any, plan: any) => {
      state.onion.position = plan.to
      state.onion.treads = state.onion.treads - 1
      return {
        success: true,
        newPosition: plan.to,
        rammedUnitIds: ['d1'],
        ramCapacityUsed: 1,
        treadDamage: 1,
        destroyedUnits: ['d1'],
      }
    }) as any)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'MOVE', unitId: 'onion', to: moveTo },
    })

    validateSpy.mockRestore()
    executeSpy.mockRestore()

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)

    const eventTypes = body.events.map((e: any) => e.type)
    expect(eventTypes[0]).toBe('ONION_MOVED')
    expect(eventTypes).toContain('ONION_TREADS_LOST')
    expect(eventTypes).toContain('UNIT_STATUS_CHANGED')

    const treadEvent = body.events.find((e: any) => e.type === 'ONION_TREADS_LOST')
    expect(treadEvent.amount).toBe(1)

    const statusEvent = body.events.find((e: any) => e.type === 'UNIT_STATUS_CHANGED')
    expect(statusEvent.unitId).toBe('d1')
    expect(statusEvent.from).toBe('operational')
    expect(statusEvent.to).toBe('destroyed')
  })

  it('emits only ONION_TREADS_LOST (no UNIT_STATUS_CHANGED) when ram does not destroy the unit', async () => {
    const app = buildApp()
    const shrek = await register(app, 'shrek')
    const fiona = await register(app, 'fiona')
    const { gameId } = await createGame(app, shrek.token, 'onion')
    await joinGame(app, gameId, fiona.token)

    const moveTo = { q: 1, r: 10 }
    const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo], rammedUnitIds: ['d1'], ramCapacityUsed: 1, treadCost: 1 })
    const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
    const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: any, plan: any) => {
      state.onion.position = plan.to
      state.onion.treads = state.onion.treads - 1
      return {
        success: true,
        newPosition: plan.to,
        rammedUnitIds: ['d1'],
        ramCapacityUsed: 1,
        treadDamage: 1,
        destroyedUnits: [],   // unit survived the ram
      }
    }) as any)

    const res = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/actions`,
      headers: { authorization: `Bearer ${shrek.token}` },
      payload: { type: 'MOVE', unitId: 'onion', to: moveTo },
    })

    validateSpy.mockRestore()
    executeSpy.mockRestore()

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.ok).toBe(true)

    const eventTypes = body.events.map((e: any) => e.type)
    expect(eventTypes[0]).toBe('ONION_MOVED')
    expect(eventTypes).toContain('ONION_TREADS_LOST')
    expect(eventTypes).not.toContain('UNIT_STATUS_CHANGED')

    const treadEvent = body.events.find((e: any) => e.type === 'ONION_TREADS_LOST')
    expect(treadEvent.amount).toBe(1)
  })
})