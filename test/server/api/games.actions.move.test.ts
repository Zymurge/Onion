import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { buildApp } from '#server/app'
import { StaleMatchStateError } from '#server/db/adapter'
import type { DbAdapter } from '#server/db/adapter'
import * as engineGame from '#server/engine/index'
import type { MovementResult, MovementValidation } from '#server/engine/movement'
import { materializeScenarioMap } from '#shared/scenarioMap'
import type { GameState } from '#shared/types/index'
import { createGame, createMovePlan, joinGame, register } from './helpers.js'
import logger from '#server/logger'

type RestorableSpy = { mockRestore(): void }

let infoSpy: RestorableSpy, warnSpy: RestorableSpy, errorSpy: RestorableSpy, debugSpy: RestorableSpy

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

describe('POST /games/:id/actions MOVE', () => {
	it('returns 409 when persistence detects stale state', async () => {
		const onionId = '11111111-1111-4111-8111-111111111111'
		const defenderId = '22222222-2222-4222-8222-222222222222'
		const gameId = 333333333
		const mockDb = {
			createUser: async () => ({ userId: onionId }),
			findUserByUsername: async () => null,
			createMatch: async () => ({ gameId }),
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
					onions: {
						'onion-1': {
							unitId: 'onion-1',
							typeId: 'TheOnion',
							role: 'onion',
							position: { q: 0, r: 10 },
							state: 'operational',
							friendlyName: 'The Onion 1',
							treads: 45,
							weapons: [
								{ id: 'main', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main Weapon' },
								...Array.from({ length: 4 }, (_, index) => ({
									id: `secondary_${index + 1}`,
									typeId: `TheOnion.secondary_${index + 1}`,
									state: 'ready' as const,
									weaponClass: 'secondary' as const,
									friendlyName: `Secondary Weapon ${index + 1}`,
								})),
								...Array.from({ length: 8 }, (_, index) => ({
									id: `ap_${index + 1}`,
									typeId: 'TheOnion.ap_1',
									state: 'ready' as const,
									friendlyName: `AP Gun ${index + 1}`,
								})),
							],
						},
					},
					defenders: {},
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
		const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } satisfies MovementValidation)
		const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockReturnValue({ success: true, newPosition: moveTo } satisfies MovementResult)

		const ramRolls = { next: vi.fn(() => 1) }
		const createRamRolls = vi.fn(() => ramRolls)
		const app = buildApp(mockDb as unknown as DbAdapter, { createRamRolls })
		await app.ready()
		const token = app.jwt.sign({ sub: onionId })
		const res = await app.inject({
			method: 'POST',
			url: `/games/${gameId}/actions`,
			headers: { authorization: `Bearer ${token}` },
			payload: { type: 'MOVE', movers: ['onion'], to: moveTo },
		})

		expect(res.statusCode).toBe(409)
		expect(res.json().code).toBe('STALE_STATE')
		expect(executeSpy).toHaveBeenCalledWith(expect.anything(), validatedPlan, {
			reconcileStackRoster: false,
			ramRolls,
		})
		expect(createRamRolls).toHaveBeenCalledTimes(1)
		validateSpy.mockRestore()
		executeSpy.mockRestore()
	})

	it('persists winner when Onion is immobilized by tread loss on a MOVE turn', async () => {
		const app = buildApp()
		const shrek = await register(app, 'shrek')
		const fiona = await register(app, 'fiona')
		const { gameId } = await createGame(app, shrek.token, 'onion')
		await joinGame(app, gameId, fiona.token)

		const moveTo = { q: 1, r: 10 }
		const validatedPlan = createMovePlan({ to: moveTo, path: [moveTo] })
		const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } satisfies MovementValidation)
		const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: GameState): MovementResult => {
			state.onions['onion-1'].position = moveTo
			state.onions['onion-1'].treads = 0
			return { success: true, newPosition: moveTo }
		}))

		await app.inject({
			method: 'POST',
			url: `/games/${gameId}/actions`,
			headers: { authorization: `Bearer ${shrek.token}` },
			payload: { type: 'MOVE', movers: ['onion'], to: moveTo },
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
})
