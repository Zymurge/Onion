import { describe, expect, it, vi } from 'vitest'

import { createLiveEventSource } from '#web/lib/liveEventSource'
import type { LiveSessionSignal } from '#web/lib/gameSessionTypes'

class FakeWebSocket {
	static CONNECTING = 0
	static OPEN = 1
	static CLOSING = 2
	static CLOSED = 3

	readyState = FakeWebSocket.CONNECTING
	sentMessages: string[] = []
	onopen: null | (() => void) = null
	onmessage: null | ((event: { data: string }) => void) = null
	onclose: null | (() => void) = null
	onerror: null | (() => void) = null

	readonly url: string

	constructor(url: string) {
		this.url = url
	}

	send(message: string) {
		this.sentMessages.push(message)
	}

	close() {
		this.readyState = FakeWebSocket.CLOSED
		this.onclose?.()
	}

	open() {
		this.readyState = FakeWebSocket.OPEN
		this.onopen?.()
	}

	receive(message: unknown) {
		this.onmessage?.({ data: JSON.stringify(message) })
	}

	receiveRaw(data: string) {
		this.onmessage?.({ data })
	}

	fail() {
		this.onerror?.()
	}
}

describe('live event source contract', () => {
	it('emits connection state, live hints, and diagnostics through the seam', () => {
		const sockets: FakeWebSocket[] = []
		const signals: LiveSessionSignal[] = []

		const source = createLiveEventSource({
			baseUrl: 'https://onion.test/api',
			token: 'stub.token',
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})

		const unsubscribe = source.subscribe((signal) => {
			signals.push(signal)
		})

		source.connect(123)

		expect(sockets[0]?.url).toBe('wss://onion.test/api/games/123/ws?token=stub.token')
		expect(source.getConnectionState(123)).toBe('connecting')
		expect(signals).toContainEqual({ kind: 'connection', gameId: 123, status: 'connecting' })

		sockets[0]?.open()
		sockets[0]?.receive({ kind: 'STATE_SNAPSHOT', snapshot: { eventSeq: 47 } })
		sockets[0]?.receive({ kind: 'EVENT', event: { seq: 48, type: 'PLAYER_JOINED', timestamp: '2026-04-02T00:00:00.000Z' } })
		sockets[0]?.receive({ kind: 'ERROR', message: 'session expired' })

		expect(source.getConnectionState(123)).toBe('disconnected')
		expect(signals).toEqual([
			{ kind: 'connection', gameId: 123, status: 'connecting' },
			{ kind: 'connection', gameId: 123, status: 'connected' },
			{ kind: 'snapshot', gameId: 123, eventSeq: 47 },
			{ kind: 'event', gameId: 123, eventSeq: 48, eventType: 'PLAYER_JOINED' },
			{ kind: 'error', gameId: 123, message: 'session expired' },
			{ kind: 'connection', gameId: 123, status: 'disconnected' },
		])

		unsubscribe()
	})

	it('disconnects and resumes from the last live sequence when reconnecting', () => {
		const sockets: FakeWebSocket[] = []

		const source = createLiveEventSource({
			baseUrl: 'https://onion.test/api',
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})

		source.connect(123)
		sockets[0]?.open()
		sockets[0]?.receive({ kind: 'EVENT', event: { seq: 11, type: 'UNIT_MOVED', timestamp: '2026-04-02T00:00:00.000Z' } })

		source.disconnect(123)
		expect(source.getConnectionState(123)).toBe('disconnected')
		expect(sockets[0]?.readyState).toBe(FakeWebSocket.CLOSED)

		source.connect(123)
		expect(source.getConnectionState(123)).toBe('reconnecting')

		sockets[1]?.open()

		expect(sockets[1]?.sentMessages).toEqual([
			JSON.stringify({ kind: 'RESUME', afterSeq: 11 }),
		])
	})

	it('ignores malformed and unknown messages without changing connection state', () => {
		const socket = new FakeWebSocket('wss://onion.test/games/123/ws')
		const signals: LiveSessionSignal[] = []
		const source = createLiveEventSource({
			baseUrl: 'https://onion.test',
			webSocketFactory: () => socket,
		})

		source.subscribe((signal) => signals.push(signal))
		source.connect(123)
		socket.open()
		socket.receiveRaw('{not-json')
		socket.receive({ kind: 'UNKNOWN', payload: 'ignored' })
		socket.receive({ payload: 'missing kind' })

		expect(source.getConnectionState(123)).toBe('connected')
		expect(signals).toEqual([
			{ kind: 'connection', gameId: 123, status: 'connecting' },
			{ kind: 'connection', gameId: 123, status: 'connected' },
		])
	})

	it('does not create duplicate sockets when connect is called repeatedly', () => {
		const sockets: FakeWebSocket[] = []
		const source = createLiveEventSource({
			baseUrl: 'https://onion.test/',
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})

		source.connect(123)
		source.connect(123)
		sockets[0]?.open()
		source.connect(123)

		expect(sockets).toHaveLength(1)
		expect(sockets[0]?.url).toBe('wss://onion.test/games/123/ws')
	})

	it('reconnects after an error and after an already closed socket', () => {
		const sockets: FakeWebSocket[] = []
		const source = createLiveEventSource({
			baseUrl: 'http://onion.test/api',
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})

		source.connect(123)
		sockets[0]?.open()
		sockets[0]?.fail()
		expect(source.getConnectionState(123)).toBe('disconnected')

		source.connect(123)
		sockets[1]?.open()
		sockets[1]!.readyState = FakeWebSocket.CLOSED
		source.connect(123)

		expect(sockets).toHaveLength(3)
		expect(source.getConnectionState(123)).toBe('reconnecting')
	})

	it('builds a tokenized URL and stops notifying an unsubscribed listener', () => {
		const socket = new FakeWebSocket('wss://onion.test/games/123/ws')
		const listener = vi.fn()
		let socketUrl = ''
		const source = createLiveEventSource({
			baseUrl: 'https://onion.test/api/',
			token: 'token with spaces',
			webSocketFactory: (url) => {
				socketUrl = url
				return socket
			},
		})

		const unsubscribe = source.subscribe(listener)
		source.connect(123)
		expect(socketUrl).toBe('wss://onion.test/api/games/123/ws?token=token+with+spaces')
		unsubscribe()
		socket.open()
		socket.receive({ kind: 'EVENT', event: { seq: 4, type: 'UNIT_MOVED', timestamp: '2026-04-02T00:00:00.000Z' } })

		expect(listener).toHaveBeenCalledTimes(1)
	})

	it('ignores callbacks from a stale socket without changing the active stream', () => {
		const sockets: FakeWebSocket[] = []
		const signals: LiveSessionSignal[] = []
		const source = createLiveEventSource({
			baseUrl: 'https://onion.test/api',
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})

		source.subscribe((signal) => signals.push(signal))
		source.connect(123)
		sockets[0]?.open()
		source.disconnect(123)

		source.connect(123)
		sockets[1]?.open()
		sockets[1]?.receive({ kind: 'EVENT', event: { seq: 11, type: 'UNIT_MOVED', timestamp: '2026-04-02T00:00:00.000Z' } })

		sockets[0]?.onopen?.()
		sockets[0]?.onmessage?.({ data: JSON.stringify({ kind: 'EVENT', event: { seq: 99, type: 'INFERRED_STATE', timestamp: '2026-04-02T00:00:00.000Z' } }) })
		sockets[0]?.onerror?.()
		sockets[0]?.onclose?.()

		expect(source.getConnectionState(123)).toBe('connected')
		expect(signals).not.toContainEqual({ kind: 'event', gameId: 123, eventSeq: 99, eventType: 'INFERRED_STATE' })

		source.disconnect(123)
		source.connect(123)
		sockets[2]?.open()

		expect(sockets[2]?.sentMessages).toEqual([
			JSON.stringify({ kind: 'RESUME', afterSeq: 11 }),
		])
	})

	it('emits valid session initialization and ignores malformed initialization payloads', () => {
		const socket = new FakeWebSocket('wss://onion.test/games/123/ws')
		const signals: LiveSessionSignal[] = []
		const source = createLiveEventSource({
			baseUrl: 'https://onion.test',
			webSocketFactory: () => socket,
		})

		source.subscribe((signal) => signals.push(signal))
		source.connect(123)
		socket.open()
		socket.receive({
			kind: 'SESSION_INIT',
			payload: { unitTypes: { tank: { typeId: 'tank' } }, weaponTypes: { cannon: { typeId: 'cannon' } } },
		})
		socket.receive({ kind: 'SESSION_INIT', payload: { unitTypes: [] } })
		socket.receive({
			kind: 'SESSION_INIT',
			payload: { unitTypes: { tank: { typeId: 'tank' } }, weaponTypes: { cannon: { typeId: 'cannon' } } },
		})

		expect(signals).toEqual([
			{ kind: 'connection', gameId: 123, status: 'connecting' },
			{ kind: 'connection', gameId: 123, status: 'connected' },
			{ kind: 'session-init', gameId: 123, payload: { unitTypes: { tank: { typeId: 'tank' } }, weaponTypes: { cannon: { typeId: 'cannon' } } } },
			{ kind: 'session-init', gameId: 123, payload: { unitTypes: { tank: { typeId: 'tank' } }, weaponTypes: { cannon: { typeId: 'cannon' } } } },
		])
	})
})