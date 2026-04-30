import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import { buildApp } from '#server/app'
import { StaleMatchStateError } from '#server/db/adapter'
import * as engineGame from '#server/engine/index'
import { materializeScenarioMap } from '#shared/scenarioMap'
import { createGame, createMovePlan, joinGame, register } from './helpers.js'
import logger from '#server/logger'

let infoSpy: any, warnSpy: any, errorSpy: any, debugSpy: any

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

		const app = buildApp(mockDb as any)
		const res = await app.inject({
			method: 'POST',
			url: `/games/${gameId}/actions`,
			headers: { authorization: `Bearer stub.${onionId}` },
			payload: { type: 'MOVE', movers: ['onion'], to: moveTo },
		})

		expect(res.statusCode).toBe(409)
		expect(res.json().code).toBe('STALE_STATE')
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
		const validateSpy = vi.spyOn(engineGame, 'validateUnitMovement').mockReturnValue({ ok: true, plan: validatedPlan } as any)
		const executeSpy = vi.spyOn(engineGame, 'executeUnitMovement').mockImplementation(((state: any) => {
			state.onion.position = moveTo
			state.onion.treads = 0
			return { success: true, newPosition: moveTo }
		}) as any)

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
