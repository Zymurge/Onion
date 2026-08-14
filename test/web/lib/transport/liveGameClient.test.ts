
import { describe, expect, it, vi } from 'vitest'
import { materializeScenarioMap } from '../../../../shared/scenarioMap'

import { createLiveGameClient, type LiveGameClientState } from '../../../../web/lib/liveGameClient'

function jsonResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: vi.fn().mockResolvedValue(JSON.stringify(body)),
	}
}

function createStateResponse(gameId: number, eventSeq: number, phase = 'DEFENDER_MOVE') {
	return {
		gameId,
		role: 'defender',
		phase,
		scenarioName: `Game ${gameId}`,
		turnNumber: 1,
		state: { onions: {}, defenders: {}, stackRoster: { groupsById: {} } },
		victoryObjectives: [],
		scenarioMap: {
			width: 1,
			height: 1,
			cells: [{ q: 0, r: 0 }],
			hexes: [{ q: 0, r: 0, t: 0 }],
		},
		eventSeq,
	}
}

function createActionResponse(gameId: number, eventSeq: number, phase = 'DEFENDER_MOVE') {
	return {
		...createStateResponse(gameId, eventSeq, phase),
		ok: true,
		seq: eventSeq,
		events: [],
	}
}

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
					state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
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
					state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
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

	it('submits actions and polls events through the HTTP client', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(jsonResponse(createStateResponse(123, 7)))
			.mockResolvedValueOnce(jsonResponse(createActionResponse(123, 8, 'ONION_COMBAT')))
			.mockResolvedValueOnce(jsonResponse({ events: [] }))
		const client = createLiveGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'end-phase' })).resolves.toMatchObject({
			gameId: 123,
			phase: 'ONION_COMBAT',
			lastEventSeq: 8,
		})
		await expect(client.pollEvents(123, 8)).resolves.toEqual([])

		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({ type: 'END_PHASE' })
		expect(fetchImpl.mock.calls[2]?.[0]).toBe('https://onion.test/api/games/123/events?after=8')
	})

	it('keeps live state signals associated with each game', async () => {
		const sockets: FakeWebSocket[] = []
		const updates: LiveGameClientState[] = []
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(jsonResponse(createStateResponse(123, 10)))
			.mockResolvedValueOnce(jsonResponse(createStateResponse(456, 20)))
		const client = createLiveGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})
		client.subscribeLiveState((state) => updates.push(state))

		await client.getState(123)
		await client.getState(456)
		sockets[0]?.open()
		sockets[1]?.open()
		sockets[0]?.receive({ kind: 'EVENT', event: { seq: 11, type: 'GAME_ONE_EVENT', timestamp: '2026-04-02T00:00:00.000Z' } })
		sockets[1]?.receive({ kind: 'EVENT', event: { seq: 21, type: 'GAME_TWO_EVENT', timestamp: '2026-04-02T00:00:00.000Z' } })

		expect(updates).toContainEqual(expect.objectContaining({ gameId: 123, lastEventSeq: 11, lastEventType: 'GAME_ONE_EVENT' }))
		expect(updates).toContainEqual(expect.objectContaining({ gameId: 456, lastEventSeq: 21, lastEventType: 'GAME_TWO_EVENT' }))
		expect(client.getLiveState()).toMatchObject({ gameId: 456, lastEventSeq: 21, lastEventType: 'GAME_TWO_EVENT' })
	})

	it('projects snapshot, error, and disconnect signals and honors unsubscribe', async () => {
		const socket = new FakeWebSocket('wss://onion.test/games/123/ws')
		const listener = vi.fn()
		const client = createLiveGameClient({
			baseUrl: 'https://onion.test',
			fetchImpl: vi.fn().mockResolvedValue(jsonResponse(createStateResponse(123, 3))),
			webSocketFactory: () => socket,
		})
		const unsubscribe = client.subscribeLiveState(listener)

		await client.getState(123)
		const callsBeforeUnsubscribe = listener.mock.calls.length
		socket.open()
		socket.receive({ kind: 'STATE_SNAPSHOT', snapshot: { eventSeq: 4 } })
		socket.receive({ kind: 'ERROR', message: 'socket failed' })
		socket.close()

		expect(listener.mock.calls.slice(callsBeforeUnsubscribe)).toEqual([
			[expect.objectContaining({ connectionStatus: 'connected' })],
			[expect.objectContaining({ lastEventSeq: 4, lastEventType: null })],
			[expect.objectContaining({ connectionStatus: 'disconnected' })],
			[expect.objectContaining({ connectionStatus: 'disconnected' })],
			[expect.objectContaining({ connectionStatus: 'disconnected' })],
		])
		const callsAfterSignals = listener.mock.calls.length
		unsubscribe()
		socket.open()
		socket.receive({ kind: 'EVENT', event: { seq: 5, type: 'IGNORED', timestamp: '2026-04-02T00:00:00.000Z' } })
		expect(listener).toHaveBeenCalledTimes(callsAfterSignals)
	})

	it('reconnects and resumes from the latest live event sequence', async () => {
		const sockets: FakeWebSocket[] = []
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(jsonResponse(createStateResponse(123, 7)))
			.mockResolvedValueOnce(jsonResponse(createStateResponse(123, 7)))
		const client = createLiveGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			webSocketFactory: (url) => {
				const socket = new FakeWebSocket(url)
				sockets.push(socket)
				return socket
			},
		})

		await client.getState(123)
		sockets[0]?.open()
		sockets[0]?.receive({ kind: 'EVENT', event: { seq: 9, type: 'UNIT_MOVED', timestamp: '2026-04-02T00:00:00.000Z' } })
		sockets[0]?.close()

		await client.getState(123)
		sockets[1]?.open()

		expect(sockets[1]?.sentMessages).toEqual([
			JSON.stringify({ kind: 'RESUME', afterSeq: 9 }),
		])
	})
})