import { describe, expect, it } from 'vitest'

import { createLiveEventSource } from './liveEventSource'
import type { LiveSessionSignal } from './gameSessionTypes'

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

	constructor(public readonly url: string) {}

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
})