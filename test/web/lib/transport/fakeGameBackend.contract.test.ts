import { describe, expect, it, vi } from 'vitest'

import { createFakeGameBackend } from '#web/lib/fakeGameBackend'
import { createGameSessionController } from '#web/lib/gameSessionController'
import type { GameSessionContext, GameSnapshot } from '#web/lib/gameClient'

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
})