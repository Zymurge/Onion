import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
	clearApiProtocolTraffic,
	formatApiProtocolTrafficEntry,
	getApiProtocolTrafficSnapshot,
	type GameStateResponse,
	requestJson,
	subscribeApiProtocolTraffic,
} from './apiProtocol.js'

describe('apiProtocol traffic logging', () => {
	beforeEach(() => {
		clearApiProtocolTraffic()
	})

	it('requires scenario map cells on game state responses', () => {
		const response: GameStateResponse = {
			gameId: 123,
			scenarioId: 'swamp-siege-01',
			role: 'defender',
			phase: 'DEFENDER_MOVE',
			turnNumber: 8,
			winner: null,
			players: {
				onion: 'onion-user',
				defender: 'defender-user',
			},
			state: {
				onion: { position: { q: 0, r: 0 }, treads: 45 },
				defenders: {},
			},
			movementRemainingByUnit: {},
			scenarioMap: {
				width: 2,
				height: 2,
				cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }],
				hexes: [],
			},
			eventSeq: 7,
		}

		expect(response.scenarioMap.cells).toHaveLength(4)
	})

	it('captures request and response traffic for requests', async () => {
		const seenDirections: string[] = []
		const unsubscribe = subscribeApiProtocolTraffic((entry) => {
			seenDirections.push(entry.direction)
		})

		await requestJson({
			baseUrl: 'http://example.com',
			path: 'auth/login',
			method: 'POST',
			body: {
				username: 'player-1',
				password: 'secret',
			},
			fetchImpl: vi.fn().mockResolvedValue(
				new Response(JSON.stringify({ userId: 'user-123', token: 'stub.token' }), {
					status: 200,
					headers: { 'content-type': 'application/json' },
				}),
			),
		})

		unsubscribe()

		expect(seenDirections).toEqual(['request', 'response'])
		const snapshot = getApiProtocolTrafficSnapshot()
		expect(snapshot).toHaveLength(2)
		expect(formatApiProtocolTrafficEntry(snapshot[0]).join('\n')).toContain('auth/login')
		expect(formatApiProtocolTrafficEntry(snapshot[0]).join('\n')).toContain('request:')
		expect(formatApiProtocolTrafficEntry(snapshot[0]).join('\n')).toContain('  "username": "player-1"')
		expect(formatApiProtocolTrafficEntry(snapshot[0]).join('\n')).toContain('  "password": "(redacted)"')
		expect(formatApiProtocolTrafficEntry(snapshot[1]).join('\n')).toContain('response:')
		expect(formatApiProtocolTrafficEntry(snapshot[1]).join('\n')).toContain('  "token": "(redacted)"')
	})

	it('captures network failures as error traffic', async () => {
		await requestJson({
			baseUrl: 'http://example.com',
			path: 'games/123',
			method: 'GET',
			fetchImpl: vi.fn().mockRejectedValue(new Error('offline')),
		})

		const snapshot = getApiProtocolTrafficSnapshot()
		expect(snapshot.at(-1)?.direction).toBe('error')
		expect(formatApiProtocolTrafficEntry(snapshot.at(-1)!).join('\n')).toContain('offline')
	})
})
