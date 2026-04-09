
import { describe, expect, it, vi } from 'vitest'
import { materializeScenarioMap } from '../../../../../src/shared/scenarioMap'

import { createLiveGameClient, type LiveGameClientState } from '../../../lib/liveGameClient'

class FakeWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	readyState: number;
	sentMessages: string[];
	url: string;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: (() => void) | null = null;
	onerror: (() => void) | null = null;

	constructor(url: string) {
		this.url = url;
		this.readyState = FakeWebSocket.CONNECTING;
		this.sentMessages = [];
	}

	send(message: string) {
		this.sentMessages.push(message);
	}

	close() {
		this.readyState = FakeWebSocket.CLOSED;
		if (this.onclose) this.onclose();
	}

	open() {
		this.readyState = FakeWebSocket.OPEN;
		if (this.onopen) this.onopen();
	}

	receive(message: unknown) {
		if (this.onmessage) this.onmessage({ data: JSON.stringify(message) });
	}
}

describe('createLiveGameClient', () => {
	it('connects to the websocket endpoint and refreshes state when live events arrive', async () => {
		// Import the scenario map materializer
		// Use a radius-7 map with a few terrain hexes for test realism
		const scenarioMap = materializeScenarioMap({
			radius: 7,
			hexes: [
				{ q: 1, r: 0, t: 1 },
				{ q: 2, r: 0, t: 1 },
				{ q: 3, r: 1, t: 1 },
				{ q: 4, r: 1, t: 1 },
				{ q: 5, r: 2, t: 1 },
				{ q: 3, r: 8, t: 2 },
				{ q: 4, r: 8, t: 2 },
				{ q: 7, r: 5, t: 3 },
			],
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(JSON.stringify({
					gameId: 123,
					role: 'defender',
					phase: 'DEFENDER_MOVE',
					scenarioName: "The Siege of Shrek's Swamp",
					turnNumber: 8,
					state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
					movementRemainingByUnit: { 'onion-1': 0 },
					eventSeq: 47,
					scenarioMap,
				})),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				text: vi.fn().mockResolvedValue(JSON.stringify({
					gameId: 123,
					role: 'defender',
					phase: 'DEFENDER_MOVE',
					scenarioName: "The Siege of Shrek's Swamp",
					turnNumber: 8,
					state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {} },
					movementRemainingByUnit: { 'onion-1': 0 },
					eventSeq: 48,
					scenarioMap,
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
				return socket as unknown as {
					url: string
					readyState: number
					send: (message: string) => void
					close: () => void
					onopen: (() => void) | null
					onclose: (() => void) | null
					onerror: (() => void) | null
					onmessage: ((event: { data: string }) => void) | null
				}
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