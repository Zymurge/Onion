import { GameClientSeamError } from './gameClient'
import type {
	GameSessionController,
	GameSessionControllerOptions,
	GameSessionRefreshReason,
	GameSessionViewState,
	LiveSessionSignal,
} from './gameSessionTypes'

const DEFAULT_LIVE_REFRESH_QUIET_WINDOW_MS = 500

function normalizeTransportError(error: unknown): GameClientSeamError {
	if (error instanceof GameClientSeamError) {
		return error
	}

	const message = error instanceof Error ? error.message : 'Unexpected transport failure'
	return new GameClientSeamError('transport', message, error)
}

function createInitialState(options: GameSessionControllerOptions): GameSessionViewState {
	return {
		status: 'idle',
		snapshot: null,
		session: null,
		liveConnection: options.liveEventSource.getConnectionState(options.gameId),
		lastAppliedEventSeq: null,
		lastAppliedEventType: null,
		lastUpdatedAt: null,
		error: null,
	}
}

export function createGameSessionController(options: GameSessionControllerOptions): GameSessionController {
	const listeners = new Set<(state: GameSessionViewState) => void>()
	const quietWindowMs = options.liveRefreshQuietWindowMs ?? DEFAULT_LIVE_REFRESH_QUIET_WINDOW_MS
	let state = createInitialState(options)
	let disposed = false
	let liveRefreshTimer: ReturnType<typeof setTimeout> | null = null
	let liveRefreshInFlight = false
	let liveRefreshQueued = false
	let liveRefreshRequestedSeq: number | null = null
	let latestObservedEventSeq: number | null = null
	let latestObservedEventType: string | null = null
	let phaseRefreshRetryPending = false
	let phaseRefreshRetrySeq: number | null = null
	let requestVersion = 0

	function debugLog(event: string, details: Record<string, unknown>) {
		if (typeof window === 'undefined') {
			return
		}

		console.info(`[session-debug] ${event}`, {
			ts: Date.now(),
			...details,
		})
	}

	function emit() {
		for (const listener of listeners) {
			listener(state)
		}
	}

	function setState(patch: Partial<GameSessionViewState>) {
		state = {
			...state,
			...patch,
		}
		emit()
	}

	function clearRefreshTimer() {
		if (liveRefreshTimer !== null) {
			clearTimeout(liveRefreshTimer)
			liveRefreshTimer = null
		}
	}

	function syncObservedEventState() {
		const snapshotSeq = state.snapshot?.lastEventSeq ?? null
		const lastAppliedEventSeq = latestObservedEventSeq ?? snapshotSeq ?? null
		setState({
			lastAppliedEventSeq,
			lastAppliedEventType: latestObservedEventType,
		})
	}

	function updateObservedSignal(signal: LiveSessionSignal) {
		if (signal.kind === 'event') {
			latestObservedEventSeq = latestObservedEventSeq === null ? signal.eventSeq : Math.max(latestObservedEventSeq, signal.eventSeq)
			if (latestObservedEventSeq === signal.eventSeq) {
				latestObservedEventType = signal.eventType
			}
			syncObservedEventState()
			return
		}

		if (signal.kind === 'snapshot' && signal.eventSeq !== null) {
			latestObservedEventSeq = latestObservedEventSeq === null ? signal.eventSeq : Math.max(latestObservedEventSeq, signal.eventSeq)
			if (latestObservedEventSeq === signal.eventSeq) {
				latestObservedEventType = null
			}
			syncObservedEventState()
		}
	}

	function scheduleLiveRefresh() {
		if (disposed || state.snapshot === null || latestObservedEventSeq === null) {
			return
		}

		const currentSnapshotSeq = state.snapshot.lastEventSeq
		if (latestObservedEventSeq <= currentSnapshotSeq && !phaseRefreshRetryPending) {
			clearRefreshTimer()
			if (latestObservedEventSeq <= currentSnapshotSeq) {
				phaseRefreshRetryPending = false
				phaseRefreshRetrySeq = null
			}
			return
		}

		clearRefreshTimer()
		liveRefreshRequestedSeq = latestObservedEventSeq
		debugLog('schedule live refresh', {
			gameId: options.gameId,
			requestedSeq: liveRefreshRequestedSeq,
			currentSnapshotSeq,
			latestObservedEventSeq,
			phaseRefreshRetryPending,
		})
		liveRefreshTimer = setTimeout(() => {
			liveRefreshTimer = null
			void refreshLiveSnapshot()
		}, quietWindowMs)
	}

	function shouldAcceptSnapshot(nextSnapshotSeq: number, minimumAcceptedSeq: number | null, version: number) {
		if (disposed) {
			return false
		}

		if (version !== requestVersion) {
			return false
		}

		if (minimumAcceptedSeq !== null && nextSnapshotSeq < minimumAcceptedSeq) {
			return false
		}

		return true
	}

	function applySnapshot(
		nextSnapshot: NonNullable<GameSessionViewState['snapshot']>,
		nextSession: NonNullable<GameSessionViewState['session']>,
		minimumAcceptedSeq: number | null,
		version: number,
		status: GameSessionViewState['status'],
		preserveEventType: boolean,
	) {
		if (!shouldAcceptSnapshot(nextSnapshot.lastEventSeq, minimumAcceptedSeq, version)) {
			return false
		}

		latestObservedEventSeq = latestObservedEventSeq === null
			? nextSnapshot.lastEventSeq
			: Math.max(latestObservedEventSeq, nextSnapshot.lastEventSeq)
		if (!preserveEventType && latestObservedEventSeq === nextSnapshot.lastEventSeq) {
			latestObservedEventType = null
		}

		state = {
			...state,
			status,
			snapshot: nextSnapshot,
			session: nextSession,
			lastAppliedEventSeq: latestObservedEventSeq,
			lastAppliedEventType: latestObservedEventType,
			lastUpdatedAt: new Date(),
			error: null,
		}
		emit()
		return true
	}

	async function getStateWithVersion() {
		const version = ++requestVersion
		debugLog('getState start', {
			gameId: options.gameId,
			version,
			phase: state.snapshot?.phase ?? null,
			lastEventSeq: state.snapshot?.lastEventSeq ?? null,
			status: state.status,
		})
		const envelope = await options.requestTransport.getState(options.gameId)
		debugLog('getState success', {
			gameId: options.gameId,
			version,
			phase: envelope.snapshot?.phase ?? null,
			lastEventSeq: envelope.snapshot?.lastEventSeq ?? null,
			sessionRole: envelope.session?.role ?? null,
		})
		return { envelope, version }
	}

	async function refreshLiveSnapshot() {
		if (disposed || state.snapshot === null) {
			return
		}

		const currentSnapshotSeq = state.snapshot.lastEventSeq
		if (latestObservedEventSeq === null || (latestObservedEventSeq <= currentSnapshotSeq && !phaseRefreshRetryPending)) {
			return
		}

		if (liveRefreshInFlight) {
			liveRefreshQueued = true
			return
		}

		liveRefreshInFlight = true
		const previousSnapshotPhase = state.snapshot.phase
		const triggeringEventType = latestObservedEventType
		let acceptedSnapshot: GameSessionViewState['snapshot'] = null
		debugLog('refreshLiveSnapshot start', {
			gameId: options.gameId,
			currentSnapshotSeq,
			latestObservedEventSeq,
			triggeringEventType,
			previousSnapshotPhase,
			phaseRefreshRetryPending,
		})

		setState({ status: 'refreshing' })

		try {
			const minimumAcceptedSeq = latestObservedEventSeq
			const { envelope, version } = await getStateWithVersion()
			const accepted = applySnapshot(
				envelope.snapshot,
				envelope.session,
				minimumAcceptedSeq,
				version,
				'ready',
				true,
			)
			acceptedSnapshot = accepted ? envelope.snapshot : null
			debugLog('refreshLiveSnapshot success', {
				gameId: options.gameId,
				accepted,
				acceptedPhase: acceptedSnapshot?.phase ?? null,
				acceptedSeq: acceptedSnapshot?.lastEventSeq ?? null,
				version,
			})
		} catch (error) {
			debugLog('refreshLiveSnapshot failure', {
				gameId: options.gameId,
				error,
			})
			setState({
				status: 'error',
				error: normalizeTransportError(error),
			})
		} finally {
			liveRefreshInFlight = false

			if (liveRefreshQueued) {
				liveRefreshQueued = false
				if (
					state.snapshot !== null
					&& latestObservedEventSeq !== null
					&& latestObservedEventSeq > state.snapshot.lastEventSeq
					&& latestObservedEventSeq !== liveRefreshRequestedSeq
				) {
					scheduleLiveRefresh()
				}
			} else {
				const currentSnapshotSeq = state.snapshot?.lastEventSeq ?? null
				const currentLiveSeq = latestObservedEventSeq
				const refreshStillStale = acceptedSnapshot === null
					&& currentSnapshotSeq !== null
					&& currentLiveSeq !== null
					&& currentLiveSeq > currentSnapshotSeq
				const phaseStillStale = triggeringEventType === 'PHASE_CHANGED'
					&& previousSnapshotPhase !== null
					&& acceptedSnapshot !== null
					&& acceptedSnapshot.phase === previousSnapshotPhase

				phaseRefreshRetryPending = Boolean(
					phaseStillStale
					&& currentLiveSeq !== null
					&& phaseRefreshRetrySeq !== currentLiveSeq
				)
				if (phaseStillStale && currentLiveSeq !== null) {
					phaseRefreshRetrySeq = currentLiveSeq
				}

				if (
					phaseRefreshRetryPending
					|| refreshStillStale
					|| (
						currentSnapshotSeq !== null
						&& currentLiveSeq !== null
						&& currentLiveSeq > currentSnapshotSeq
						&& currentLiveSeq !== liveRefreshRequestedSeq
					)
				) {
					scheduleLiveRefresh()
				}
			}
		}
	}

	async function loadOrRefresh(reason: GameSessionRefreshReason) {
		if (disposed) {
			return
		}

		debugLog('loadOrRefresh start', {
			gameId: options.gameId,
			reason,
			status: state.status,
			phase: state.snapshot?.phase ?? null,
			lastEventSeq: state.snapshot?.lastEventSeq ?? null,
			latestObservedEventSeq,
			latestObservedEventType,
		})

		options.liveEventSource.connect(options.gameId)
		setState({ status: state.snapshot === null ? 'loading' : 'refreshing', error: null })

		try {
			const minimumAcceptedSeq = reason === 'manual'
				? state.snapshot?.lastEventSeq ?? latestObservedEventSeq ?? null
				: latestObservedEventSeq ?? state.snapshot?.lastEventSeq ?? null
			const { envelope, version } = await getStateWithVersion()
			const applied = applySnapshot(
				envelope.snapshot,
				envelope.session,
				minimumAcceptedSeq,
				version,
				'ready',
				reason !== 'manual',
			)

			debugLog('loadOrRefresh success', {
				gameId: options.gameId,
				reason,
				version,
				applied,
				phase: envelope.snapshot?.phase ?? null,
				lastEventSeq: envelope.snapshot?.lastEventSeq ?? null,
				minimumAcceptedSeq,
			})

			if (!applied && state.snapshot !== null) {
				setState({ status: 'ready' })
			}
		} catch (error) {
			debugLog('loadOrRefresh failure', {
				gameId: options.gameId,
				reason,
				error,
			})
			setState({
				status: 'error',
				error: normalizeTransportError(error),
			})
		}
	}

	const unsubscribeLiveSignals = options.liveEventSource.subscribe((signal) => {
		if (disposed || signal.gameId !== options.gameId) {
			return
		}

		debugLog('live signal', {
			gameId: options.gameId,
			signal,
			phase: state.snapshot?.phase ?? null,
			lastEventSeq: state.snapshot?.lastEventSeq ?? null,
		})

		if (signal.kind === 'connection') {
			setState({ liveConnection: signal.status })
			return
		}

		if (signal.kind === 'error') {
			setState({
				liveConnection: 'disconnected',
				error: new GameClientSeamError('transport', signal.message),
			})
			return
		}

		updateObservedSignal(signal)
		scheduleLiveRefresh()
	})

	return {
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot() {
			return state
		},
		async load() {
			await loadOrRefresh('manual')
		},
		async refresh(reason = 'manual') {
			if (state.snapshot === null || state.session === null) {
				await loadOrRefresh(reason)
				return
			}

			await loadOrRefresh(reason)
		},
		async submitAction(action) {
			if (disposed) {
				return null
			}

			debugLog('submitAction start', {
				gameId: options.gameId,
				action,
				phase: state.snapshot?.phase ?? null,
				lastEventSeq: state.snapshot?.lastEventSeq ?? null,
			})

			options.liveEventSource.connect(options.gameId)
			setState({ status: 'refreshing', error: null })

			const version = ++requestVersion
			const currentSession = state.session

			try {
				const nextSnapshot = await options.requestTransport.submitAction(options.gameId, action)
				debugLog('submitAction response', {
					gameId: options.gameId,
					action,
					version,
					phase: nextSnapshot?.snapshot?.phase ?? null,
					lastEventSeq: nextSnapshot?.snapshot?.lastEventSeq ?? null,
				})

				if (!shouldAcceptSnapshot(nextSnapshot.lastEventSeq, null, version)) {
					debugLog('submitAction stale response ignored', {
						gameId: options.gameId,
						action,
						version,
						responseSeq: nextSnapshot.lastEventSeq,
					})
					return null
				}

				latestObservedEventSeq = latestObservedEventSeq === null
					? nextSnapshot.lastEventSeq
					: Math.max(latestObservedEventSeq, nextSnapshot.lastEventSeq)
				latestObservedEventType = null

				state = {
					...state,
					status: 'ready',
					snapshot: nextSnapshot,
					session: currentSession,
					lastAppliedEventSeq: latestObservedEventSeq,
					lastAppliedEventType: latestObservedEventType,
					lastUpdatedAt: new Date(),
					error: null,
				}
				emit()
				return nextSnapshot
			} catch (error) {
				const normalizedError = normalizeTransportError(error)
				debugLog('submitAction failure', {
					gameId: options.gameId,
					action,
					version,
					error: normalizedError,
				})
				setState({
					status: 'error',
					error: normalizedError,
				})
				throw normalizedError
			}
		},
		dispose() {
			if (disposed) {
				return
			}

			disposed = true
			clearRefreshTimer()
			unsubscribeLiveSignals()
			listeners.clear()
			options.liveEventSource.disconnect(options.gameId)
		},
	}
}