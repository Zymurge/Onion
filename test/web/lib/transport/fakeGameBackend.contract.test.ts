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
		...overrides,
	}
}

function createStackSnapshot(phase: 'DEFENDER_MOVE' | 'DEFENDER_COMBAT', turnNumber: number, lastEventSeq: number): GameSnapshot {
	const stackRoster = buildStackRosterFromUnits([
		{ id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 1' },
		{ id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational', friendlyName: 'Little Pigs 2' },
	])

	return {
		gameId: 123,
		phase,
		scenarioName: phase === 'DEFENDER_MOVE' ? 'Stack move snapshot' : 'Stack combat snapshot',
		turnNumber,
		lastEventSeq,
		victoryObjectives: [],
		authoritativeState: {
			onion: {
				id: 'onion-1',
				type: 'TheOnion',
				position: { q: 0, r: 1 },
				treads: 33,
				status: 'operational',
				weapons: [],
				batteries: { main: 1, secondary: 0, ap: 0 },
			},
			defenders: {
				'wolf-2': {
					id: 'wolf-2',
					type: 'BigBadWolf',
					friendlyName: 'Big Bad Wolf 2',
					position: { q: 3, r: 6 },
					status: 'operational',
					weapons: [],
				},
				'puss-1': {
					id: 'puss-1',
					type: 'Puss',
					friendlyName: 'Puss 1',
					position: { q: 4, r: 4 },
					status: 'operational',
					weapons: [],
				},
				'pigs-1': {
					id: 'pigs-1',
					type: 'LittlePigs',
					friendlyName: 'Little Pigs 1',
					position: { q: 4, r: 4 },
					status: 'operational',
					weapons: [],
				},
				'pigs-2': {
					id: 'pigs-2',
					type: 'LittlePigs',
					friendlyName: 'Little Pigs 2',
					position: { q: 4, r: 4 },
					status: 'operational',
					weapons: [],
				},
			},
			stackRoster,
			stackNaming: refreshStackRosterNamingSnapshot(stackRoster),
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