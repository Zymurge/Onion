import { describe, expect, it, vi } from 'vitest'

import { GameClientSeamError, type GameSnapshot } from '#web/lib/gameClient'
import { createGameSessionController } from '#web/lib/gameSessionController'
import type {
	GameRequestTransport,
	GameSessionController,
	GameSessionViewState,
	LiveConnectionStatus,
	LiveEventSource,
	LiveSessionSignal,
} from '#web/lib/gameSessionTypes'
import type { TurnPhase } from '#shared/types/index'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'

function createDeferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void

	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve
		reject = promiseReject
	})

	return { promise, resolve, reject }
}

function createSnapshot(overrides: {
	phase: TurnPhase
	lastEventSeq: number
	gameId?: number
	scenarioName?: string
	turnNumber?: number
}): GameSnapshot {
	return {
		gameId: overrides.gameId ?? 123,
		phase: overrides.phase,
		scenarioName: overrides.scenarioName ?? 'Test session',
		turnNumber: overrides.turnNumber ?? 1,
		lastEventSeq: overrides.lastEventSeq,
		victoryObjectives: [],
	}
}

function createLiveEventSource(initialStatus: LiveConnectionStatus = 'idle') {
	const listeners = new Set<(signal: LiveSessionSignal) => void>()
	let connectionStatus = initialStatus

	const source: LiveEventSource & {
		emit(signal: LiveSessionSignal): void
		listeners: Set<(signal: LiveSessionSignal) => void>
	} = {
		subscribe: vi.fn((listener: (signal: LiveSessionSignal) => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		}),
		connect: vi.fn(() => {
			connectionStatus = 'connecting'
		}),
		disconnect: vi.fn(() => {
			connectionStatus = 'disconnected'
		}),
		getConnectionState: vi.fn(() => connectionStatus),
		emit(signal: LiveSessionSignal) {
			if (signal.kind === 'connection') {
				connectionStatus = signal.status
			}

			for (const listener of listeners) {
				listener(signal)
			}
		},
		listeners,
	}

	return source
}

function createTransport(getState: GameRequestTransport['getState'], submitAction?: GameRequestTransport['submitAction']): GameRequestTransport {
	return {
		getState,
		submitAction: submitAction ?? vi.fn(),
	}
}

function expectIdleState(state: GameSessionViewState) {
	expect(state).toMatchObject({
		status: 'idle',
		catalog: null,
		snapshot: null,
		session: null,
		liveConnection: 'idle',
		lastAppliedEventSeq: null,
		lastAppliedEventType: null,
		lastUpdatedAt: null,
		error: null,
	})
}

async function flushMicrotasks() {
	await Promise.resolve()
	await Promise.resolve()
}

async function createLoadedController(options: {
	getState: ReturnType<typeof vi.fn>
	liveConnection?: LiveConnectionStatus
	liveRefreshQuietWindowMs?: number
}) {
	const liveEventSource = createLiveEventSource(options.liveConnection ?? 'idle')
	const controller = createGameSessionController({
		gameId: 123,
		requestTransport: createTransport(options.getState as GameRequestTransport['getState']),
		liveEventSource,
		liveRefreshQuietWindowMs: options.liveRefreshQuietWindowMs ?? 5,
	}) as GameSessionController

	await controller.load()

	return {
		controller,
		liveEventSource,
		getState: options.getState,
	}
}

describe('createGameSessionController', () => {
	it('loads the initial session and publishes live connection changes', async () => {
		const initialSnapshot = createSnapshot({
			phase: 'DEFENDER_COMBAT',
			lastEventSeq: 47,
			scenarioName: 'Initial controller snapshot',
		})
		const getState = vi.fn().mockResolvedValue({
			snapshot: initialSnapshot,
			session: { role: 'defender' as const },
		})
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
			liveRefreshQuietWindowMs: 5,
		}) as GameSessionController
		const observedStates: GameSessionViewState[] = []
		const unsubscribe = controller.subscribe((state) => {
			observedStates.push(state)
		})

		expectIdleState(controller.getSnapshot())

		await controller.load()

		expect(getState).toHaveBeenCalledWith(123)
		expect(liveEventSource.connect).toHaveBeenCalledWith(123)
		expect(controller.getSnapshot()).toMatchObject({
			status: 'ready',
			snapshot: initialSnapshot,
			session: { role: 'defender' },
			lastAppliedEventSeq: 47,
			lastAppliedEventType: null,
			error: null,
		})

		liveEventSource.emit({
			kind: 'connection',
			gameId: 123,
			status: 'connected',
		})

		expect(controller.getSnapshot()).toMatchObject({
			liveConnection: 'connected',
		})
		expect(observedStates.length).toBeGreaterThan(0)

		unsubscribe()
		controller.dispose()
	})

	it('tracks connection transitions and notifies active subscribers', async () => {
		const getState = vi.fn().mockResolvedValue({
			snapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 10,
				scenarioName: 'Connection transition snapshot',
			}),
			session: { role: 'defender' as const },
		})
		const { controller, liveEventSource } = await createLoadedController({ getState })
		const observedStates: GameSessionViewState[][] = [[], []]
		const unsubscribeFirst = controller.subscribe((state) => {
			observedStates[0].push(state)
		})
		const unsubscribeSecond = controller.subscribe((state) => {
			observedStates[1].push(state)
		})

		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'connecting' })
		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'connected' })
		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'reconnecting' })

		expect(controller.getSnapshot()).toMatchObject({
			liveConnection: 'reconnecting',
		})
		expect(observedStates[0].at(-1)).toMatchObject({ liveConnection: 'reconnecting' })
		expect(observedStates[1].at(-1)).toMatchObject({ liveConnection: 'reconnecting' })

		unsubscribeFirst()
		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'disconnected' })

		expect(controller.getSnapshot()).toMatchObject({
			liveConnection: 'disconnected',
		})
		expect(observedStates[0]).toHaveLength(3)
		expect(observedStates[1].at(-1)).toMatchObject({ liveConnection: 'disconnected' })
		expect(observedStates[1]).toHaveLength(4)

		unsubscribeSecond()
		controller.dispose()
	})

	it('aborts the session, reports the error, and disconnects live updates', async () => {
		const getState = vi.fn().mockResolvedValue({
			snapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 10,
				scenarioName: 'Abort snapshot',
			}),
			session: { role: 'defender' as const },
		})
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
		})

		await controller.load()
		controller.abort('Loaded game snapshot is invalid')

		expect(controller.getSnapshot()).toMatchObject({
			status: 'aborted',
			error: expect.objectContaining({ message: 'Loaded game snapshot is invalid' }),
		})
		expect(liveEventSource.disconnect).toHaveBeenCalledWith(123)
		await expect(controller.refresh()).resolves.toBeUndefined()
		expect(getState).toHaveBeenCalledTimes(1)
	})

	it('stores session initialization separately and preserves it across snapshot refreshes', async () => {
		const initialSnapshot = createSnapshot({
			phase: 'DEFENDER_COMBAT',
			lastEventSeq: 47,
			scenarioName: 'Catalog session snapshot',
		})
		const refreshedSnapshot = createSnapshot({
			phase: 'ONION_MOVE',
			lastEventSeq: 48,
			scenarioName: 'Catalog refreshed snapshot',
		})
		const getState = vi.fn()
			.mockResolvedValueOnce({ snapshot: initialSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValueOnce({ snapshot: refreshedSnapshot, session: { role: 'defender' as const } })
		const { controller, liveEventSource } = await createLoadedController({ getState })
		const catalog = {
			unitTypes: getUnitTypeCatalog(),
			weaponTypes: getWeaponTypeCatalog(),
		}

		liveEventSource.emit({ kind: 'session-init', gameId: 123, payload: catalog })
		expect(controller.getSnapshot()).toMatchObject({ catalog })

		await controller.refresh()

		expect(controller.getSnapshot()).toMatchObject({
			catalog,
			snapshot: refreshedSnapshot,
		})

		controller.dispose()
	})

	it('allows the live session initialization to arrive after the HTTP snapshot', async () => {
		const getState = vi.fn().mockResolvedValue({
			snapshot: createSnapshot({ phase: 'ONION_MOVE', lastEventSeq: 4 }),
			session: { role: 'onion' as const },
		})
		const { controller, liveEventSource } = await createLoadedController({ getState })

		expect(controller.getSnapshot().catalog).toBeNull()
		expect(liveEventSource.disconnect).not.toHaveBeenCalled()
		expect(liveEventSource.connect).toHaveBeenCalledTimes(1)

		await controller.refresh()

		expect(liveEventSource.disconnect).not.toHaveBeenCalled()
		expect(liveEventSource.connect).toHaveBeenCalledTimes(2)
		controller.dispose()
	})

	it('preserves initialization when it arrives before or after the HTTP snapshot', async () => {
		const catalog = {
			unitTypes: getUnitTypeCatalog(),
			weaponTypes: getWeaponTypeCatalog(),
		}
		const snapshot = createSnapshot({ phase: 'ONION_MOVE', lastEventSeq: 4 })
		const initialLoad = createDeferred<{ snapshot: GameSnapshot; session: { role: 'onion' } }>()
		const getState = vi.fn().mockReturnValue(initialLoad.promise)
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
		})

		const loadPromise = controller.load()
		liveEventSource.emit({ kind: 'session-init', gameId: 123, payload: catalog })
		initialLoad.resolve({ snapshot, session: { role: 'onion' } })
		await loadPromise

		expect(controller.getSnapshot()).toMatchObject({ status: 'ready', snapshot, catalog })
		controller.dispose()

		const laterInitLoad = vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } })
		const laterLiveEventSource = createLiveEventSource()
		const laterController = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(laterInitLoad),
			liveEventSource: laterLiveEventSource,
		})

		await laterController.load()
		laterLiveEventSource.emit({ kind: 'session-init', gameId: 123, payload: catalog })

		expect(laterController.getSnapshot()).toMatchObject({ status: 'ready', snapshot, catalog })
		laterController.dispose()
	})

	it('ignores snapshot hints that do not advance the sequence', async () => {
		const getState = vi.fn().mockResolvedValue({
			snapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 47,
				scenarioName: 'Snapshot hint suppression snapshot',
			}),
			session: { role: 'defender' as const },
		})
		const { controller, liveEventSource } = await createLoadedController({ getState })

		liveEventSource.emit({ kind: 'snapshot', gameId: 123, eventSeq: null })
		liveEventSource.emit({ kind: 'snapshot', gameId: 123, eventSeq: 47 })

		expect(getState).toHaveBeenCalledTimes(1)
		expect(controller.getSnapshot()).toMatchObject({
			snapshot: expect.objectContaining({ lastEventSeq: 47 }),
			lastAppliedEventSeq: 47,
			lastAppliedEventType: null,
		})

		controller.dispose()
	})

	it('keeps the newer refresh snapshot when an older initial load resolves later', async () => {
		const initialLoad = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
		const newerRefresh = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
		const olderInitialSnapshot = createSnapshot({
			phase: 'DEFENDER_COMBAT',
			lastEventSeq: 12,
			scenarioName: 'Stale initial load snapshot',
		})
		const newerSnapshot = createSnapshot({
			phase: 'ONION_MOVE',
			lastEventSeq: 13,
			scenarioName: 'Newer refresh snapshot',
		})
		const getState = vi.fn()
			.mockReturnValueOnce(initialLoad.promise)
			.mockReturnValueOnce(newerRefresh.promise)
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
			liveRefreshQuietWindowMs: 5,
		}) as GameSessionController

		const loadPromise = controller.load()
		liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 13, eventType: 'PHASE_CHANGED' })
		const refreshPromise = controller.refresh('live-event')

		newerRefresh.resolve({ snapshot: newerSnapshot, session: { role: 'defender' } })
		await flushMicrotasks()

		expect(controller.getSnapshot()).toMatchObject({
			status: 'ready',
			snapshot: newerSnapshot,
			lastAppliedEventSeq: 13,
			lastAppliedEventType: 'PHASE_CHANGED',
		})

		initialLoad.resolve({ snapshot: olderInitialSnapshot, session: { role: 'defender' } })
		await flushMicrotasks()

		expect(controller.getSnapshot()).toMatchObject({
			status: 'ready',
			snapshot: newerSnapshot,
			lastAppliedEventSeq: 13,
			lastAppliedEventType: 'PHASE_CHANGED',
		})

		await Promise.all([loadPromise, refreshPromise])
		controller.dispose()
	})

	it('surfaces live transport errors and recovers on the next refresh hint', async () => {
		vi.useFakeTimers()
		try {
			const initialSnapshot = createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 47,
				scenarioName: 'Live error initial snapshot',
			})
			const recoveredSnapshot = createSnapshot({
				phase: 'ONION_MOVE',
				lastEventSeq: 48,
				scenarioName: 'Live error recovered snapshot',
			})
			const getState = vi.fn()
				.mockResolvedValueOnce({
					snapshot: initialSnapshot,
					session: { role: 'defender' as const },
				})
				.mockResolvedValueOnce({
					snapshot: recoveredSnapshot,
					session: { role: 'defender' as const },
				})
			const { controller, liveEventSource } = await createLoadedController({
				getState,
				liveRefreshQuietWindowMs: 10,
			})

			liveEventSource.emit({ kind: 'error', gameId: 123, message: 'socket dropped' })
			expect(controller.getSnapshot()).toMatchObject({
				liveConnection: 'disconnected',
				status: 'ready',
				error: expect.any(GameClientSeamError),
			})

			liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'connected' })
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 48, eventType: 'PHASE_CHANGED' })
			vi.advanceTimersByTime(10)
			await flushMicrotasks()

			expect(controller.getSnapshot()).toMatchObject({
				status: 'ready',
				error: null,
				liveConnection: 'connected',
				snapshot: recoveredSnapshot,
				lastAppliedEventSeq: 48,
				lastAppliedEventType: 'PHASE_CHANGED',
			})

			controller.dispose()
		} finally {
			vi.useRealTimers()
		}
	})

	it('recovers from a transient refresh failure and preserves the latest snapshot on retry', async () => {
		vi.useFakeTimers()
		try {
			const initialSnapshot = createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 10,
				scenarioName: 'Recovery initial snapshot',
			})
			const refreshedSnapshot = createSnapshot({
				phase: 'ONION_MOVE',
				lastEventSeq: 12,
				scenarioName: 'Recovery refreshed snapshot',
			})
			const getState = vi.fn()
				.mockResolvedValueOnce({
					snapshot: initialSnapshot,
					session: { role: 'defender' as const },
				})
				.mockRejectedValueOnce(new Error('temporary refresh failure'))
				.mockResolvedValueOnce({
					snapshot: refreshedSnapshot,
					session: { role: 'defender' as const },
				})
			const { controller, liveEventSource } = await createLoadedController({
				getState,
				liveRefreshQuietWindowMs: 10,
			})

			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 11, eventType: 'PHASE_CHANGED' })
			vi.advanceTimersByTime(10)
			await flushMicrotasks()

			expect(controller.getSnapshot()).toMatchObject({
				status: 'error',
				error: expect.any(GameClientSeamError),
				snapshot: initialSnapshot,
				lastAppliedEventSeq: 10,
				lastAppliedEventType: null,
			})
			expect(controller.getSnapshot().error?.message).toBe('temporary refresh failure')

			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 12, eventType: 'PHASE_CHANGED' })
			vi.advanceTimersByTime(10)
			await flushMicrotasks()

			expect(controller.getSnapshot()).toMatchObject({
				status: 'ready',
				error: null,
				snapshot: refreshedSnapshot,
				lastAppliedEventSeq: 12,
				lastAppliedEventType: 'PHASE_CHANGED',
			})

			controller.dispose()
		} finally {
			vi.useRealTimers()
		}
	})

	it('keeps subscribers isolated across unsubscribe and dispose', async () => {
		const getState = vi.fn().mockResolvedValue({
			snapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 21,
				scenarioName: 'Subscription snapshot',
			}),
			session: { role: 'defender' as const },
		})
		const { controller, liveEventSource } = await createLoadedController({ getState })
		const firstListener = vi.fn()
		const secondListener = vi.fn()
		const unsubscribeFirst = controller.subscribe(firstListener)
		const unsubscribeSecond = controller.subscribe(secondListener)

		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'connected' })
		expect(firstListener).toHaveBeenCalledTimes(1)
		expect(secondListener).toHaveBeenCalledTimes(1)

		unsubscribeFirst()
		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'reconnecting' })
		expect(firstListener).toHaveBeenCalledTimes(1)
		expect(secondListener).toHaveBeenCalledTimes(2)

		controller.dispose()
		liveEventSource.emit({ kind: 'connection', gameId: 123, status: 'disconnected' })
		expect(firstListener).toHaveBeenCalledTimes(1)
		expect(secondListener).toHaveBeenCalledTimes(2)

		unsubscribeSecond()
	})

	it('ignores signals for another game and ignores a load that resolves after disposal', async () => {
		const initialLoad = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
		const getState = vi.fn().mockReturnValue(initialLoad.promise)
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
		})
		const listener = vi.fn()
		controller.subscribe(listener)

		const loadPromise = controller.load()
		liveEventSource.emit({ kind: 'connection', gameId: 456, status: 'connected' })
		liveEventSource.emit({ kind: 'event', gameId: 456, eventSeq: 99, eventType: 'WRONG_GAME' })
		expect(controller.getSnapshot()).toMatchObject({ status: 'loading', liveConnection: 'idle' })

		listener.mockClear()
		controller.dispose()
		initialLoad.resolve({
			snapshot: createSnapshot({ phase: 'DEFENDER_MOVE', lastEventSeq: 1 }),
			session: { role: 'defender' },
		})
		await loadPromise

		expect(controller.getSnapshot()).toMatchObject({ status: 'loading', snapshot: null })
		expect(liveEventSource.disconnect).toHaveBeenCalledWith(123)
		expect(listener).not.toHaveBeenCalled()
	})

	it('queues a refresh requested while another live refresh is in flight', async () => {
		vi.useFakeTimers()
		try {
			const firstRefresh = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
			const secondRefresh = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
			const initialSnapshot = createSnapshot({ phase: 'DEFENDER_COMBAT', lastEventSeq: 10 })
			const firstSnapshot = createSnapshot({ phase: 'DEFENDER_COMBAT', lastEventSeq: 11 })
			const secondSnapshot = createSnapshot({ phase: 'ONION_MOVE', lastEventSeq: 12 })
			const getState = vi.fn()
				.mockResolvedValueOnce({ snapshot: initialSnapshot, session: { role: 'defender' as const } })
				.mockReturnValueOnce(firstRefresh.promise)
				.mockReturnValueOnce(secondRefresh.promise)
			const { controller, liveEventSource } = await createLoadedController({
				getState,
				liveRefreshQuietWindowMs: 5,
			})

			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 11, eventType: 'UNIT_MOVED' })
			vi.advanceTimersByTime(5)
			await flushMicrotasks()
			expect(getState).toHaveBeenCalledTimes(2)

			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 12, eventType: 'PHASE_CHANGED' })
			vi.advanceTimersByTime(5)
			await flushMicrotasks()
			firstRefresh.resolve({ snapshot: firstSnapshot, session: { role: 'defender' } })
			await flushMicrotasks()
			vi.advanceTimersByTime(5)
			await flushMicrotasks()

			expect(getState).toHaveBeenCalledTimes(3)
			secondRefresh.resolve({ snapshot: secondSnapshot, session: { role: 'defender' } })
			await flushMicrotasks()
			expect(controller.getSnapshot()).toMatchObject({ snapshot: secondSnapshot, lastAppliedEventSeq: 12 })

			controller.dispose()
		} finally {
			vi.useRealTimers()
		}
	})

	it('ignores stale submit responses after a newer action has been accepted', async () => {
		const firstAction = createDeferred<GameSnapshot>()
		const secondAction = createDeferred<GameSnapshot>()
		const submitAction = vi.fn()
			.mockReturnValueOnce(firstAction.promise)
			.mockReturnValueOnce(secondAction.promise)
		const getState = vi.fn().mockResolvedValue({
			snapshot: createSnapshot({ phase: 'DEFENDER_MOVE', lastEventSeq: 10 }),
			session: { role: 'defender' as const },
		})
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState, submitAction),
			liveEventSource: createLiveEventSource(),
		})
		await controller.load()

		const firstPromise = controller.submitAction({ type: 'end-phase' })
		const secondPromise = controller.submitAction({ type: 'refresh' })
		const newerSnapshot = createSnapshot({ phase: 'ONION_MOVE', lastEventSeq: 12 })
		secondAction.resolve(newerSnapshot)
		expect(await secondPromise).toBe(newerSnapshot)

		const staleSnapshot = createSnapshot({ phase: 'DEFENDER_MOVE', lastEventSeq: 11 })
		firstAction.resolve(staleSnapshot)
		expect(await firstPromise).toBeNull()
		expect(controller.getSnapshot()).toMatchObject({ snapshot: newerSnapshot, lastAppliedEventSeq: 12 })
		controller.dispose()
	})

	it('loads state when refresh is requested before any snapshot exists', async () => {
		const snapshot = createSnapshot({ phase: 'DEFENDER_MOVE', lastEventSeq: 3 })
		const getState = vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } })
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
		})

		await controller.refresh('live-event')

		expect(getState).toHaveBeenCalledWith(123)
		expect(controller.getSnapshot()).toMatchObject({ status: 'ready', snapshot, session: { role: 'defender' } })
		controller.dispose()
	})

	it('coalesces rapid live hints into a single refresh and tracks the newest event sequence', async () => {
		vi.useFakeTimers()
		try {
			const initialSnapshot = createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 47,
				scenarioName: 'Burst initial snapshot',
			})
			const refreshedSnapshot = createSnapshot({
				phase: 'ONION_MOVE',
				lastEventSeq: 50,
				scenarioName: 'Burst refreshed snapshot',
			})
			const getState = vi.fn()
				.mockResolvedValueOnce({
					snapshot: initialSnapshot,
					session: { role: 'defender' as const },
				})
				.mockResolvedValueOnce({
					snapshot: refreshedSnapshot,
					session: { role: 'defender' as const },
				})
			const liveEventSource = createLiveEventSource()
			const controller = createGameSessionController({
				gameId: 123,
				requestTransport: createTransport(getState),
				liveEventSource,
				liveRefreshQuietWindowMs: 10,
			}) as GameSessionController

			await controller.load()
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 48, eventType: 'PHASE_CHANGED' })
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 49, eventType: 'PHASE_CHANGED' })
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 50, eventType: 'PHASE_CHANGED' })

			expect(getState).toHaveBeenCalledTimes(1)

			vi.advanceTimersByTime(9)
			await flushMicrotasks()
			expect(getState).toHaveBeenCalledTimes(1)

			vi.advanceTimersByTime(1)
			await flushMicrotasks()
			expect(getState).toHaveBeenCalledTimes(2)
			expect(controller.getSnapshot()).toMatchObject({
				snapshot: refreshedSnapshot,
				lastAppliedEventSeq: 50,
				lastAppliedEventType: 'PHASE_CHANGED',
			})

			controller.dispose()
		} finally {
			vi.useRealTimers()
		}
	})

	it('rejects stale refresh results that arrive behind a newer live signal', async () => {
		vi.useFakeTimers()
		try {
			const initialSnapshot = createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 47,
				scenarioName: 'Stale rejection initial snapshot',
			})
			const staleSnapshot = createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 48,
				scenarioName: 'Stale rejection stale snapshot',
			})
			const refreshedSnapshot = createSnapshot({
				phase: 'ONION_MOVE',
				lastEventSeq: 50,
				scenarioName: 'Stale rejection refreshed snapshot',
			})
			const firstRefresh = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
			const secondRefresh = createDeferred<{ snapshot: GameSnapshot; session: { role: 'defender' } }>()
			const getState = vi.fn()
				.mockResolvedValueOnce({
					snapshot: initialSnapshot,
					session: { role: 'defender' as const },
				})
				.mockReturnValueOnce(firstRefresh.promise)
				.mockReturnValueOnce(secondRefresh.promise)
			const liveEventSource = createLiveEventSource()
			const controller = createGameSessionController({
				gameId: 123,
				requestTransport: createTransport(getState),
				liveEventSource,
				liveRefreshQuietWindowMs: 10,
			}) as GameSessionController

			await controller.load()
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 49, eventType: 'PHASE_CHANGED' })
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 50, eventType: 'PHASE_CHANGED' })

			vi.advanceTimersByTime(10)
			await flushMicrotasks()
			expect(getState).toHaveBeenCalledTimes(2)

			firstRefresh.resolve({ snapshot: staleSnapshot, session: { role: 'defender' } })
			await flushMicrotasks()
			expect(controller.getSnapshot()).toMatchObject({
				snapshot: initialSnapshot,
				lastAppliedEventSeq: 47,
				lastAppliedEventType: null,
			})

			vi.advanceTimersByTime(10)
			await flushMicrotasks()
			expect(getState).toHaveBeenCalledTimes(3)

			secondRefresh.resolve({ snapshot: refreshedSnapshot, session: { role: 'defender' } })
			await flushMicrotasks()
			expect(controller.getSnapshot()).toMatchObject({
				snapshot: refreshedSnapshot,
				lastAppliedEventSeq: 50,
				lastAppliedEventType: 'PHASE_CHANGED',
			})

			controller.dispose()
		} finally {
			vi.useRealTimers()
		}
	})

	it('normalizes transport failures into session error state', async () => {
		const getState = vi.fn().mockRejectedValue(new Error('mocked transport fault'))
		const liveEventSource = createLiveEventSource()
		const controller = createGameSessionController({
			gameId: 123,
			requestTransport: createTransport(getState),
			liveEventSource,
		}) as GameSessionController

		await controller.load()

		expect(controller.getSnapshot()).toMatchObject({
			status: 'error',
			error: expect.any(GameClientSeamError),
		})
		const state = controller.getSnapshot()
		expect(state.error).toBeInstanceOf(GameClientSeamError)
		expect(state.error?.kind).toBe('transport')
		expect(state.error?.message).toBe('mocked transport fault')

		controller.dispose()
	})
})