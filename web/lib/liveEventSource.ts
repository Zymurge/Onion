import type {
	WebSocketClientMessage,
	WebSocketServerEventMessage,
	WebSocketServerErrorMessage,
	WebSocketServerMessage,
	WebSocketServerSessionInitMessage,
	WebSocketServerSnapshotMessage,
	WebSocketServerPresenceMessage,
} from '../../shared/websocketProtocol'
import type { SessionInitPayload } from '../../shared/types/index.js'

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

const DEFAULT_RECONNECT_DELAYS_MS = [250, 500, 1_000, 2_000, 4_000]

export type LiveEventSourceOptions = {
	baseUrl: string
	token?: string
	webSocketFactory?: (url: string) => WebSocketLike
	reconnectDelaysMs?: readonly number[]
	maxReconnectAttempts?: number
	reconnectJitter?: (delayMs: number) => number
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSessionInitPayload(value: unknown): value is SessionInitPayload {
	return isRecord(value) && isRecord(value.unitTypes) && isRecord(value.weaponTypes)
}

function isSessionInitMessage(message: WebSocketServerMessage): message is WebSocketServerSessionInitMessage {
	return message.kind === 'SESSION_INIT' && isSessionInitPayload(message.payload)
}

function isSnapshotMessage(message: WebSocketServerMessage): message is WebSocketServerSnapshotMessage {
	return message.kind === 'STATE_SNAPSHOT'
}

function isPresenceMessage(message: WebSocketServerMessage): message is WebSocketServerPresenceMessage {
	return message.kind === 'PLAYER_PRESENCE'
}

function isEventMessage(message: WebSocketServerMessage): message is WebSocketServerEventMessage {
	return message.kind === 'EVENT'
}

function isErrorMessage(message: WebSocketServerMessage): message is WebSocketServerErrorMessage {
	return message.kind === 'ERROR' && typeof message.message === 'string'
}

function parseMessage(rawMessage: string): WebSocketServerMessage | null {
	try {
		const parsed = JSON.parse(rawMessage) as WebSocketServerMessage
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
	const reconnectTimers = new Map<number, ReturnType<typeof setTimeout>>()
	const reconnectAttempts = new Map<number, number>()
	const intentionalDisconnects = new Set<number>()
	const reconnectDelaysMs = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS
	const maxReconnectAttempts = options.maxReconnectAttempts ?? reconnectDelaysMs.length
	const reconnectJitter = options.reconnectJitter ?? ((delayMs: number) => delayMs + Math.floor(Math.random() * Math.min(100, delayMs)))
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

	function clearReconnectTimer(gameId: number) {
		const timer = reconnectTimers.get(gameId)
		if (timer !== undefined) {
			clearTimeout(timer)
			reconnectTimers.delete(gameId)
		}
	}

	function scheduleReconnect(gameId: number) {
		if (intentionalDisconnects.has(gameId)) {
			return
		}

		const attempt = reconnectAttempts.get(gameId) ?? 0
		if (attempt >= maxReconnectAttempts) {
			reconnectAttempts.delete(gameId)
			emitConnection(gameId, 'disconnected')
			return
		}

		clearReconnectTimer(gameId)
		emitConnection(gameId, 'reconnecting')
		const baseDelay = reconnectDelaysMs[Math.min(attempt, reconnectDelaysMs.length - 1)] ?? 1_000
		reconnectTimers.set(gameId, setTimeout(() => {
			reconnectTimers.delete(gameId)
			if (intentionalDisconnects.has(gameId)) {
				return
			}
			const existingSocket = socketsByGameId.get(gameId)
			if (existingSocket !== undefined && existingSocket.readyState !== 3) {
				return
			}
			reconnectAttempts.set(gameId, attempt + 1)
			openSocket(gameId)
		}, Math.max(0, reconnectJitter(baseDelay))))
	}

	function handleUnexpectedSocketEnd(gameId: number, socket: WebSocketLike) {
		if (!isCurrentSocket(gameId, socket)) {
			return
		}

		socketsByGameId.delete(gameId)
		if (intentionalDisconnects.has(gameId)) {
			intentionalDisconnects.delete(gameId)
			emitConnection(gameId, 'disconnected')
			return
		}

		if (socket.readyState !== 3) {
			socket.close()
		}
		scheduleReconnect(gameId)
	}

	function openSocket(gameId: number) {
		const previousState = getStateFor(gameId)
		emitConnection(gameId, previousState.connectionStatus === 'idle' ? 'connecting' : 'reconnecting')

		const socket = webSocketFactory(buildWebSocketUrl(options.baseUrl, gameId, options.token))
		socketsByGameId.set(gameId, socket)

		socket.onopen = () => {
			if (!isCurrentSocket(gameId, socket)) {
				return
			}

			reconnectAttempts.delete(gameId)
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

			if (isSessionInitMessage(parsed)) {
				emit({ kind: 'session-init', gameId, payload: parsed.payload })
				return
			}

			if (isSnapshotMessage(parsed)) {
				const eventSeq = typeof parsed.snapshot.eventSeq === 'number' ? parsed.snapshot.eventSeq : null
				updateLastEventSeq(gameId, eventSeq)
				emit({ kind: 'snapshot', gameId, eventSeq })
				return
			}

			if (isPresenceMessage(parsed)) {
				emit({ kind: 'presence', gameId, presence: parsed.presence })
				return
			}

			if (isEventMessage(parsed)) {
				updateLastEventSeq(gameId, parsed.event.seq)
				emit({ kind: 'event', gameId, eventSeq: parsed.event.seq, eventType: parsed.event.type })
				return
			}

			if (isErrorMessage(parsed)) {
				emit({ kind: 'error', gameId, message: parsed.message })
				if (!isCurrentSocket(gameId, socket)) {
					return
				}
				socketsByGameId.delete(gameId)
				clearReconnectTimer(gameId)
				reconnectAttempts.delete(gameId)
				emitConnection(gameId, 'disconnected')
				if (socket.readyState !== 3) {
					socket.close()
				}
			}
		}

		socket.onclose = () => {
			handleUnexpectedSocketEnd(gameId, socket)
		}

		socket.onerror = () => {
			handleUnexpectedSocketEnd(gameId, socket)
		}
	}

	return {
		subscribe(listener) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		connect(gameId) {
			intentionalDisconnects.delete(gameId)
			clearReconnectTimer(gameId)
			reconnectAttempts.delete(gameId)
			const existingSocket = socketsByGameId.get(gameId)
			if (existingSocket !== undefined && existingSocket.readyState !== 3) {
				return
			}

			openSocket(gameId)
		},
		disconnect(gameId) {
			intentionalDisconnects.add(gameId)
			clearReconnectTimer(gameId)
			reconnectAttempts.delete(gameId)
			const socket = socketsByGameId.get(gameId)
			if (socket === undefined) {
				if (getStateFor(gameId).connectionStatus !== 'disconnected') {
					emitConnection(gameId, 'disconnected')
				}
				intentionalDisconnects.delete(gameId)
				return
			}

			if (socket.readyState === 3) {
				socketsByGameId.delete(gameId)
				emitConnection(gameId, 'disconnected')
				intentionalDisconnects.delete(gameId)
				return
			}

			socket.close()
		},
		getConnectionState(gameId) {
			return getStateFor(gameId).connectionStatus
		},
	}
}