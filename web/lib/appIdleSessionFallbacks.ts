import type { GameSessionController, GameSessionViewState, LiveEventSource } from './gameSessionTypes'

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