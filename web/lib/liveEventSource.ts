import type {
	WebSocketClientMessage,
	WebSocketServerErrorMessage,
	WebSocketServerEventMessage,
	WebSocketServerSnapshotMessage,
} from '../../shared/websocketProtocol'

import type { LiveConnectionStatus, LiveEventSource, LiveSessionSignal } from './gameSessionTypes'

export type WebSocketLike = {
	readonly readyState: number
	send(message: string): void
	close(): void
	onopen: null | (() => void)
	onmessage: null | ((event: { data: string }) => void)
	onclose: null | (() => void)
	onerror: null | ((event?: unknown) => void)
}

export type LiveEventSourceOptions = {
	baseUrl: string
	token?: string
	webSocketFactory?: (url: string) => WebSocketLike
}

type LiveEventSourceState = {
	connectionStatus: LiveConnectionStatus
	lastEventSeq: number | null
	gameId: number
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

function isSnapshotMessage(message: WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage): message is WebSocketServerSnapshotMessage {
	return message.kind === 'STATE_SNAPSHOT'
}

function isEventMessage(message: WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage): message is WebSocketServerEventMessage {
	return message.kind === 'EVENT'
}

function parseMessage(rawMessage: string): WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage | null {
	try {
		const parsed = JSON.parse(rawMessage) as WebSocketServerSnapshotMessage | WebSocketServerEventMessage | WebSocketServerErrorMessage
		if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
			return parsed
		}
	} catch {
		return null
	}

	return null
}

export function createLiveEventSource(options: LiveEventSourceOptions): LiveEventSource {
	const listeners = new Set<(signal: LiveSessionSignal) => void>()
	const socketsByGameId = new Map<number, WebSocketLike>()
	const stateByGameId = new Map<number, LiveEventSourceState>()
	const webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url) as unknown as WebSocketLike)

	function getStateFor(gameId: number): LiveEventSourceState {
		return stateByGameId.get(gameId) ?? {
			connectionStatus: 'idle',
			lastEventSeq: null,
			gameId,
		}
	}

	function emit(signal: LiveSessionSignal) {
		for (const listener of listeners) {
			listener(signal)
		}
	}

	function setState(gameId: number, patch: Partial<Omit<LiveEventSourceState, 'gameId'>>) {
		const nextState: LiveEventSourceState = {
			...getStateFor(gameId),
			...patch,
			gameId,
		}
		stateByGameId.set(gameId, nextState)
		return nextState
	}

	function emitConnection(gameId: number, status: LiveConnectionStatus) {
		setState(gameId, { connectionStatus: status })
		emit({ kind: 'connection', gameId, status })
	}

	function updateLastEventSeq(gameId: number, eventSeq: number | null) {
		setState(gameId, { lastEventSeq: eventSeq })
	}

	function isCurrentSocket(gameId: number, socket: WebSocketLike) {
		return socketsByGameId.get(gameId) === socket
	}

	return {
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		connect(gameId) {
			const existingSocket = socketsByGameId.get(gameId)
			if (existingSocket !== undefined && existingSocket.readyState !== 3) {
				return
			}

			const previousState = getStateFor(gameId)
			emitConnection(gameId, previousState.connectionStatus === 'idle' ? 'connecting' : 'reconnecting')

			const socket = webSocketFactory(buildWebSocketUrl(options.baseUrl, gameId, options.token))
			socketsByGameId.set(gameId, socket)

			socket.onopen = () => {
				if (!isCurrentSocket(gameId, socket)) {
					return
				}

				emitConnection(gameId, 'connected')

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
				if (!isCurrentSocket(gameId, socket)) {
					return
				}

				const parsed = parseMessage(event.data)
				if (parsed === null) {
					return
				}

				if (isSnapshotMessage(parsed)) {
					const eventSeq = typeof parsed.snapshot.eventSeq === 'number' ? parsed.snapshot.eventSeq : null
					updateLastEventSeq(gameId, eventSeq)
					emit({ kind: 'snapshot', gameId, eventSeq })
					return
				}

				if (isEventMessage(parsed)) {
					updateLastEventSeq(gameId, parsed.event.seq)
					emit({ kind: 'event', gameId, eventSeq: parsed.event.seq, eventType: parsed.event.type })
					return
				}

				emit({ kind: 'error', gameId, message: parsed.message })
				emitConnection(gameId, 'disconnected')
			}

			socket.onclose = () => {
				if (!isCurrentSocket(gameId, socket)) {
					return
				}

				socketsByGameId.delete(gameId)
				emitConnection(gameId, 'disconnected')
			}

			socket.onerror = () => {
				if (!isCurrentSocket(gameId, socket)) {
					return
				}

				socketsByGameId.delete(gameId)
				emitConnection(gameId, 'disconnected')
			}
		},
		disconnect(gameId) {
			const socket = socketsByGameId.get(gameId)
			if (socket === undefined) {
				if (getStateFor(gameId).connectionStatus !== 'disconnected') {
					emitConnection(gameId, 'disconnected')
				}
				return
			}

			if (socket.readyState === 3) {
				socketsByGameId.delete(gameId)
				emitConnection(gameId, 'disconnected')
				return
			}

			socket.close()
		},
		getConnectionState(gameId) {
			return getStateFor(gameId).connectionStatus
		},
	}
}