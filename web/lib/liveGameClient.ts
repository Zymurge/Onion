import { createGameClient, type GameAction, type GameClient, type GameSnapshot } from './gameClient'
import { createHttpGameClient, createHttpGameRequestTransport } from './httpGameClient'
import type { LiveConnectionStatus as LiveConnectionStatusType } from './gameSessionTypes'
import { createLiveEventSource, type LiveEventSourceOptions } from './liveEventSource'

export type { LiveConnectionStatus } from './gameSessionTypes'
export type { WebSocketLike } from './liveEventSource'

export type LiveGameClientState = {
	connectionStatus: LiveConnectionStatusType
	lastUpdatedAt: Date | null
	lastEventSeq: number | null
	lastEventType: string | null
	gameId: number | null
}

export type LiveGameClientListener = (state: LiveGameClientState) => void

export type LiveGameClientOptions = LiveEventSourceOptions & {
	fetchImpl?: typeof fetch
}

export type LiveGameClient = GameClient & {
	subscribeLiveState(listener: LiveGameClientListener): () => void
	getLiveState(): LiveGameClientState
}

function createIdleState(): LiveGameClientState {
	return {
		connectionStatus: 'idle',
		lastUpdatedAt: null,
		lastEventSeq: null,
		lastEventType: null,
		gameId: null,
	}
}

export function createLiveGameClient(options: LiveGameClientOptions): LiveGameClient {
	const requestTransport = createHttpGameRequestTransport({
		baseUrl: options.baseUrl,
		fetchImpl: options.fetchImpl,
		token: options.token,
	})
	const compatibilityClient = createHttpGameClient({
		baseUrl: options.baseUrl,
		fetchImpl: options.fetchImpl,
		token: options.token,
	})
	const client = createGameClient({
		...requestTransport,
		pollEvents: compatibilityClient.pollEvents,
	})
	const liveEventSource = createLiveEventSource({
		baseUrl: options.baseUrl,
		token: options.token,
		webSocketFactory: options.webSocketFactory,
	})
	const listeners = new Set<LiveGameClientListener>()
	const liveStateByGameId = new Map<number, LiveGameClientState>()

	function getStateFor(gameId: number): LiveGameClientState {
		return liveStateByGameId.get(gameId) ?? {
			...createIdleState(),
			gameId,
		}
	}

	function emitState(gameId: number, patch: Partial<Omit<LiveGameClientState, 'gameId'>>) {
		const nextState: LiveGameClientState = {
			...getStateFor(gameId),
			...patch,
			gameId,
		}
		liveStateByGameId.set(gameId, nextState)
		for (const listener of listeners) {
			listener(nextState)
		}
		return nextState
	}

	liveEventSource.subscribe((signal) => {
		if (signal.kind === 'connection') {
			emitState(signal.gameId, {
				connectionStatus: signal.status,
			})
			return
		}

		if (signal.kind === 'snapshot') {
			emitState(signal.gameId, {
				lastUpdatedAt: new Date(),
				lastEventSeq: signal.eventSeq,
				lastEventType: null,
			})
			return
		}

		if (signal.kind === 'event') {
			emitState(signal.gameId, {
				lastUpdatedAt: new Date(),
				lastEventSeq: signal.eventSeq,
				lastEventType: signal.eventType,
			})
			return
		}

		emitState(signal.gameId, {
			connectionStatus: 'disconnected',
		})
	})

	return {
		subscribeLiveState(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getLiveState() {
			return Array.from(liveStateByGameId.values()).at(-1) ?? createIdleState()
		},
		async getState(gameId: number) {
			liveEventSource.connect(gameId)
			const envelope = await client.getState(gameId)
			emitState(gameId, {
				lastUpdatedAt: new Date(),
				lastEventSeq: envelope.snapshot.lastEventSeq,
				lastEventType: null,
			})
			return envelope
		},
		async submitAction(gameId: number, action: GameAction) {
			liveEventSource.connect(gameId)
			const snapshot = await client.submitAction(gameId, action)
			emitState(gameId, {
				lastUpdatedAt: new Date(),
				lastEventSeq: snapshot.lastEventSeq,
				lastEventType: null,
			})
			return snapshot as GameSnapshot
		},
		async pollEvents(gameId: number, afterSeq: number) {
			return client.pollEvents(gameId, afterSeq)
		},
	}
}