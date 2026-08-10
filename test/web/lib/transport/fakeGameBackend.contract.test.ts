import { describe, expect, it, vi } from 'vitest'

import { createFakeGameBackend } from '#web/lib/fakeGameBackend'
import { createGameSessionController } from '#web/lib/gameSessionController'
import type { GameSessionContext, GameSnapshot } from '#web/lib/gameClient'
import { buildStackRosterFromUnits, refreshStackRosterNamingSnapshot } from '#shared/stackRoster'

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: 'Fake backend contract snapshot',
		turnNumber: 8,
		lastEventSeq: 47,
		victoryObjectives: [],
		...overrides,
	}
}

function createStackSnapshot(phase: 'DEFENDER_MOVE' | 'DEFENDER_COMBAT', turnNumber: number, lastEventSeq: number): GameSnapshot {
	const stackRoster = buildStackRosterFromUnits([
		{ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational', friendlyName: 'Little Pigs 1' },
		{ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational', friendlyName: 'Little Pigs 2' },
	])

	const defenders = {
		'wolf-2': {
			unitId: 'wolf-2',
			typeId: 'BigBadWolf',
			role: 'defender',
			friendlyName: 'Big Bad Wolf 2',
			position: { q: 3, r: 6 },
			state: 'operational',
			weapons: [],
		},
		'puss-1': {
			unitId: 'puss-1',
			typeId: 'Puss',
			role: 'defender',
			friendlyName: 'Puss 1',
			position: { q: 4, r: 4 },
			state: 'operational',
			weapons: [],
		},
		'pigs-1': {
			unitId: 'pigs-1',
			typeId: 'LittlePigs',
			role: 'defender',
			friendlyName: 'Little Pigs 1',
			position: { q: 4, r: 4 },
			state: 'operational',
			weapons: [],
		},
		'pigs-2': {
			unitId: 'pigs-2',
			typeId: 'LittlePigs',
			role: 'defender',
			friendlyName: 'Little Pigs 2',
			position: { q: 4, r: 4 },
			state: 'operational',
			weapons: [],
		}
	 } as Record<string, any>

	return {
		gameId: 123,
		phase,
		scenarioName: phase === 'DEFENDER_MOVE' ? 'Stack move snapshot' : 'Stack combat snapshot',
		turnNumber,
		lastEventSeq,
		victoryObjectives: [],
		authoritativeState: {
			onions: {
					'onion-1': {
						unitId: 'onion-1',
						typeId: 'TheOnion',
						role: 'onion',
						friendlyName: 'The Onion 1',
						position: { q: 0, r: 1 },
						treads: 33,
						state: 'operational',
						weapons: [{ id: 'main', typeId: 'TheOnion.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main Weapon' }],
					},
			},
			defenders,
			stackRoster,
			stackNaming: refreshStackRosterNamingSnapshot( stackRoster, undefined, defenders ),
			ramsThisTurn: 0,
			movementSpent: {},
		},
		movementRemainingByUnit: {
			'onion-1': 0,
			'wolf-2': 4,
			'puss-1': 3,
			'pigs-1': 3,
			'pigs-2': 3,
		},
	}
}

describe('createFakeGameBackend', () => {
	it('serves queued snapshots and records submitted actions through the request transport', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				scenarioName: 'Initial fake backend snapshot',
				lastEventSeq: 11,
			}),
			session,
		})

		backend.queueRefresh(
			createSnapshot({
				scenarioName: 'Queued fake backend snapshot',
				lastEventSeq: 12,
			}),
			session,
		)

		const firstState = await backend.requestTransport.getState(123)
		expect(firstState.snapshot.scenarioName).toBe('Queued fake backend snapshot')
		expect(firstState.session).toEqual(session)
		expect(backend.getCurrentSnapshot().lastEventSeq).toBe(12)

		await backend.requestTransport.submitAction(123, { type: 'end-phase' })
		expect(backend.getSubmittedActions()).toEqual([
			{ gameId: 123, action: { type: 'end-phase' } },
		])

		backend.failNextRefreshWith(new Error('refresh failed'))
		await expect(backend.requestTransport.getState(123)).rejects.toThrow('refresh failed')
	})

	it('emits live connection state and arbitrary signals through the live source', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot(),
			session,
		})
		const signals: unknown[] = []

		const unsubscribe = backend.liveEventSource.subscribe((signal) => {
			signals.push(signal)
		})

		vi.useFakeTimers()
		try {
			backend.liveEventSource.connect(123)
			expect(backend.liveEventSource.getConnectionState(123)).toBe('connecting')
			expect(signals).toContainEqual({ kind: 'connection', gameId: 123, status: 'connecting' })

			await vi.advanceTimersByTimeAsync(1)
			expect(backend.liveEventSource.getConnectionState(123)).toBe('connected')
			expect(signals).toContainEqual({ kind: 'connection', gameId: 123, status: 'connected' })

			backend.emitLiveSignal({ kind: 'event', gameId: 123, eventSeq: 48, eventType: 'PHASE_CHANGED' })
			expect(signals).toContainEqual({ kind: 'event', gameId: 123, eventSeq: 48, eventType: 'PHASE_CHANGED' })

			backend.liveEventSource.disconnect(123)
			expect(backend.liveEventSource.getConnectionState(123)).toBe('disconnected')
			expect(signals).toContainEqual({ kind: 'connection', gameId: 123, status: 'disconnected' })
		} finally {
			vi.useRealTimers()
			unsubscribe()
		}
	})

	it('drives the session controller without browser WebSocket stubs', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				scenarioName: 'Controller baseline snapshot',
				lastEventSeq: 21,
			}),
			session,
		})
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: backend.requestTransport,
			liveEventSource: backend.liveEventSource,
			liveRefreshQuietWindowMs: 5,
		})

		vi.useFakeTimers()
		try {
			await controller.load()
			expect(controller.getSnapshot().status).toBe('ready')
			expect(controller.getSnapshot().snapshot?.scenarioName).toBe('Controller baseline snapshot')

			backend.queueRefresh(
				createSnapshot({
					scenarioName: 'Controller refreshed snapshot',
					lastEventSeq: 22,
				}),
				session,
			)
			backend.emitLiveSignal({ kind: 'event', gameId: 123, eventSeq: 22, eventType: 'PHASE_CHANGED' })

			await vi.advanceTimersByTimeAsync(5)

			expect(controller.getSnapshot().snapshot?.scenarioName).toBe('Controller refreshed snapshot')
			expect(controller.getSnapshot().lastAppliedEventSeq).toBe(22)
		} finally {
			vi.useRealTimers()
			controller.dispose()
		}
	})

	it('refreshes a stacked Little Pigs snapshot across move and combat phases', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createStackSnapshot('DEFENDER_MOVE', 2, 50),
			session,
		})
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: backend.requestTransport,
			liveEventSource: backend.liveEventSource,
			liveRefreshQuietWindowMs: 5,
		})

		vi.useFakeTimers()
		try {
			await controller.load()
			expect(controller.getSnapshot().snapshot?.phase).toBe('DEFENDER_MOVE')

			const moveState = controller.getSnapshot().snapshot as GameSnapshot & { authoritativeState?: { stackRoster?: { groupsById?: Record<string, { groupName: string; unitIds: string[] }> } } }
			expect(moveState.authoritativeState?.stackRoster?.groupsById?.['LittlePigs:4,4']).toMatchObject({
				groupName: 'Little Pigs 1',
				unitIds: ['pigs-1', 'pigs-2'],
			})

			backend.queueRefresh(createStackSnapshot('DEFENDER_COMBAT', 2, 51), session)
			backend.emitLiveSignal({ kind: 'event', gameId: 123, eventSeq: 51, eventType: 'PHASE_CHANGED' })

			await vi.advanceTimersByTimeAsync(5)

			expect(controller.getSnapshot().snapshot?.phase).toBe('DEFENDER_COMBAT')
			const combatState = controller.getSnapshot().snapshot as GameSnapshot & { authoritativeState?: { stackRoster?: { groupsById?: Record<string, { groupName: string; unitIds: string[] }> } } }
			expect(combatState.authoritativeState?.stackRoster?.groupsById?.['LittlePigs:4,4']).toMatchObject({
				groupName: 'Little Pigs 1',
				unitIds: ['pigs-1', 'pigs-2'],
			})
		} finally {
			vi.useRealTimers()
			controller.dispose()
		}
	})
})