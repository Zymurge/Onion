import { describe, expect, it, vi } from 'vitest'

import { createLiveGameClient, type LiveGameClientState } from './liveGameClient'

class FakeWebSocket {
	static CONNECTING = 0
	static OPEN = 1
	static CLOSING = 2
	static CLOSED = 3

	readyState = FakeWebSocket.CONNECTING
	sentMessages: string[] = []
	onopen: null | (() => void) = null
	onmessage: null | ((event: MessageEvent<string>) => void) = null
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
		this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>)
	}
}

describe('createLiveGameClient', () => {
	it('connects to the websocket endpoint and refreshes state when live events arrive', async () => {
		const snapshot = {
			gameId: 123,
			phase: 'DEFENDER_MOVE',
			selectedUnitId: 'wolf-2',
			mode: 'fire',
			scenarioName: 'The Siege of Shrek\'s Swamp',
			turnNumber: 8,
			lastEventSeq: 47,
			movementRemainingByUnit: {
				'wolf-2': 4,
			},
		}

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(JSON.stringify({
					gameId: 123,
					role: 'defender',
					phase: 'DEFENDER_MOVE',
					scenarioName: 'The Siege of Shrek\'s Swamp',
					turnNumber: 8,
					state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
					movementRemainingByUnit: { 'onion-1': 0 },
					eventSeq: 47,
				})),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(JSON.stringify({
					gameId: 123,
					role: 'defender',
					phase: 'DEFENDER_MOVE',
					scenarioName: 'The Siege of Shrek\'s Swamp',
					turnNumber: 8,
					state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {} },
					movementRemainingByUnit: { 'onion-1': 0 },
					eventSeq: 48,
				})),
			})

		const sockets: FakeWebSocket[] = []
		const client = createLiveGameClient({
			baseUrl: 'https://onion.test/api',
			token: 'stub.token',
			fetchImpl,
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket as unknown as WebSocket
			},
		})

		const updates: LiveGameClientState[] = []
		const unsubscribe = client.subscribeLiveState((state) => {
			updates.push(state)
		})

		await client.getState(123)
		expect(sockets[0]?.url).toBe('wss://onion.test/api/games/123/ws?token=stub.token')

		sockets[0]?.open()
		sockets[0]?.receive({ kind: 'EVENT', event: { seq: 48, type: 'PLAYER_JOINED', timestamp: '2026-04-02T00:00:00.000Z' } })

		await Promise.resolve()

		const liveState = client.getLiveState()
		expect(liveState.connectionStatus).toBe('connected')
		expect(liveState.lastUpdatedAt).not.toBeNull()
		expect(updates.some((state) => state.connectionStatus === 'connected')).toBe(true)
		expect(fetchImpl).toHaveBeenCalledTimes(1)

		unsubscribe()
	})
})