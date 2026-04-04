import { createHttpGameClient } from './httpGameClient'
import type { GameAction, GameClient, GameSnapshot } from './gameClient'
import type { WebSocketClientMessage } from '../../../src/shared/websocketProtocol'
import type { EventEnvelope } from '../../../src/types/index'
import type { WebSocketServerErrorMessage, WebSocketServerEventMessage, WebSocketServerSnapshotMessage } from '../../../src/shared/websocketProtocol'

export type LiveConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

export type LiveGameClientState = {
	connectionStatus: LiveConnectionStatus
	lastUpdatedAt: Date | null
	lastEventSeq: number | null
	lastEventType: EventEnvelope['type'] | null
	gameId: number | null
}

export type LiveGameClientListener = (state: LiveGameClientState) => void

export type WebSocketLike = {
	readonly readyState: number
	send(message: string): void
	close(): void
	onopen: null | (() => void)
	onmessage: null | ((event: { data: string }) => void)
	onclose: null | (() => void)
	onerror: null | ((event?: unknown) => void)
}

export type LiveGameClientOptions = {
	baseUrl: string
	fetchImpl?: typeof fetch
	token?: string
	webSocketFactory?: (url: string) => WebSocketLike
}

export type LiveGameClient = GameClient & {
	subscribeLiveState(listener: LiveGameClientListener): () => void
	getLiveState(): LiveGameClientState
}

function trimTrailingSlash(baseUrl: string) {
	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function buildWebSocketUrl(baseUrl: string, gameId: number, token?: string) {
	const url = new URL(`games/${gameId}/ws`, `${trimTrailingSlash(baseUrl)}/`)
	url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
	if (token !== undefined) {
		url.searchParams.set('token', token)
	}
	return url.toString()
}

function isSnapshotMessage(message: WebSocketClientMessage | WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage): message is WebSocketServerSnapshotMessage {
	return (message as WebSocketServerSnapshotMessage).kind === 'STATE_SNAPSHOT'
}

function isEventMessage(message: WebSocketClientMessage | WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage): message is WebSocketServerEventMessage {
	return (message as WebSocketServerEventMessage).kind === 'EVENT'
}

function parseMessage(rawMessage: string): WebSocketClientMessage | WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage | null {
	try {
		const parsed = JSON.parse(rawMessage) as WebSocketClientMessage | WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage
		if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
			return parsed
		}
	} catch {
		return null
	}

	return null
}

export function createLiveGameClient(options: LiveGameClientOptions): LiveGameClient {
	const httpClient = createHttpGameClient({
		baseUrl: options.baseUrl,
		fetchImpl: options.fetchImpl,
		token: options.token,
	})
	const listeners = new Set<LiveGameClientListener>()
	const liveStateByGameId = new Map<number, LiveGameClientState>()
	const socketsByGameId = new Map<number, WebSocketLike>()
	const webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike)

	function getStateFor(gameId: number): LiveGameClientState {
		return liveStateByGameId.get(gameId) ?? {
			connectionStatus: 'idle',
			lastUpdatedAt: null,
			lastEventSeq: null,
			lastEventType: null,
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
	}

	function ensureSocket(gameId: number) {
		const existingSocket = socketsByGameId.get(gameId)
		if (existingSocket !== undefined && existingSocket.readyState !== 3) {
			return existingSocket
		}

		emitState(gameId, {
			connectionStatus: existingSocket === undefined ? 'connecting' : 'reconnecting',
		})

		const socket = webSocketFactory(buildWebSocketUrl(options.baseUrl, gameId, options.token))
		socketsByGameId.set(gameId, socket)

		socket.onopen = () => {
			emitState(gameId, {
				connectionStatus: 'connected',
			})

			const liveState = getStateFor(gameId)
			if (liveState.lastEventSeq !== null && liveState.lastEventSeq > 0) {
				const resumeMessage: WebSocketClientMessage = {
					kind: 'RESUME',
					afterSeq: liveState.lastEventSeq,
				}
				socket.send(JSON.stringify(resumeMessage))
			}
		}

		socket.onmessage = (event) => {
			const parsed = parseMessage(event.data)
			if (parsed === null) {
				return
			}

			if (isSnapshotMessage(parsed)) {
				emitState(gameId, {
					lastUpdatedAt: new Date(),
					lastEventSeq: parsed.snapshot.eventSeq,
					lastEventType: null,
				})
				return
			}

			if (isEventMessage(parsed)) {
				emitState(gameId, {
					lastEventSeq: parsed.event.seq,
					lastUpdatedAt: new Date(),
					lastEventType: parsed.event.type,
				})
				return
			}

			if (parsed.kind === 'ERROR') {
				emitState(gameId, {
					connectionStatus: 'disconnected',
				})
			}
		}

		socket.onclose = () => {
			emitState(gameId, {
				connectionStatus: 'disconnected',
			})
		}

		socket.onerror = () => {
			emitState(gameId, {
				connectionStatus: 'disconnected',
			})
		}

		return socket
	}

	return {
		subscribeLiveState(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		getLiveState() {
			return Array.from(liveStateByGameId.values()).at(-1) ?? {
				connectionStatus: 'idle',
				lastUpdatedAt: null,
				lastEventSeq: null,
				lastEventType: null,
				gameId: null,
			}
		},
		async getState(gameId: number) {
			ensureSocket(gameId)
			const envelope = await httpClient.getState(gameId)
			emitState(gameId, {
				lastUpdatedAt: new Date(),
				lastEventSeq: envelope.snapshot.lastEventSeq,
			})
			return envelope
		},
		async submitAction(gameId: number, action: GameAction) {
			ensureSocket(gameId)
			const snapshot = await httpClient.submitAction(gameId, action)
			emitState(gameId, {
				lastUpdatedAt: new Date(),
				lastEventSeq: snapshot.lastEventSeq,
			})
			return snapshot as GameSnapshot
		},
		async pollEvents(gameId: number, afterSeq: number) {
			return httpClient.pollEvents(gameId, afterSeq)
		},
	}
}