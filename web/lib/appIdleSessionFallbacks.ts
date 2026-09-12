import type { GameSessionController, GameSessionViewState, LiveEventSource } from './gameSessionTypes'

/** Stable empty state used when the app has no bound game session. */
export const idleSessionState: GameSessionViewState = {
	status: 'idle',
	catalog: null,
	snapshot: null,
	session: null,
	liveConnection: 'idle',
	lastAppliedEventSeq: null,
	lastAppliedEventType: null,
	lastUpdatedAt: null,
	error: null,
}

/** No-op live source used by the idle session and injected-client fallback. */
export const idleLiveEventSource: LiveEventSource = {
	subscribe() {
		return () => {}
	},
	connect() {},
	disconnect() {},
	getConnectionState() {
		return 'idle'
	},
}

/** No-op controller that keeps session hooks safe before a game is bound. */
export const idleSessionController: GameSessionController = {
	subscribe() {
		return () => {}
	},
	getSnapshot() {
		return idleSessionState
	},
	async load() {
		return
	},
	async refresh() {
		return
	},
	async submitAction() {
		return null
	},
	abort() {},
	dispose() {},
}