import { describe, expect, it } from 'vitest'

import { createHttpGameClient, createHttpGameRequestTransport } from '#web/lib/httpGameClient'
import { createFakeHttpBackend } from './fakeHttpBackend'

const baseUrl = 'https://onion.test/api'

function stateResponse(overrides: Record<string, unknown> = {}) {
	return {
		gameId: 123,
		scenarioId: 'swamp-siege-01',
		scenarioName: 'Retry scenario',
		role: 'defender',
		phase: 'DEFENDER_MOVE',
		turnNumber: 1,
		winner: null,
		aborted: false,
		players: { onion: 'onion-user', defender: 'defender-user' },
		state: { onions: {}, defenders: {}, stackRoster: { groupsById: {} } },
		victoryObjectives: [],
		scenarioMap: {
			width: 1,
			height: 1,
			cells: [{ q: 0, r: 0 }],
			hexes: [{ q: 0, r: 0, t: 0 }],
		},
		eventSeq: 1,
		...overrides,
	}
}

describe('HTTP client retry integration', () => {
	it('retries a transient server response and returns the authoritative snapshot', async () => {
		const backend = createFakeHttpBackend({ baseUrl })
		backend.queueResponse('GET', '/games/123', { status: 503, body: { error: 'temporary outage' } })
		backend.queueResponse('GET', '/games/123', { body: stateResponse({ eventSeq: 2 }) })
		const client = createHttpGameClient({ baseUrl, fetchImpl: backend.fetchImpl })

		await expect(client.getState(123)).resolves.toMatchObject({
			snapshot: { lastEventSeq: 2 },
		})
		expect(backend.getRequests()).toMatchObject([
			{ method: 'GET', path: '/games/123' },
			{ method: 'GET', path: '/games/123' },
		])
	})

	it('retries a transient network failure and returns the next response', async () => {
		const backend = createFakeHttpBackend({ baseUrl })
		backend.queueNetworkFailure('GET', '/games/123', new Error('connection reset'))
		backend.queueResponse('GET', '/games/123', { body: stateResponse() })
		const client = createHttpGameClient({ baseUrl, fetchImpl: backend.fetchImpl })

		await expect(client.getState(123)).resolves.toMatchObject({ snapshot: { gameId: 123 } })
		expect(backend.getRequests()).toHaveLength(2)
	})

	it('retries event polling independently of state loading', async () => {
		const backend = createFakeHttpBackend({ baseUrl })
		backend.queueResponse('GET', '/games/123/events?after=7', { status: 500, body: { error: 'temporary outage' } })
		backend.queueResponse('GET', '/games/123/events?after=7', {
			body: { events: [{ seq: 8, type: 'UNIT_MOVED', timestamp: '2026-08-18T00:00:00.000Z' }] },
		})
		const client = createHttpGameClient({ baseUrl, fetchImpl: backend.fetchImpl })

		await expect(client.pollEvents(123, 7)).resolves.toMatchObject([{ seq: 8, type: 'UNIT_MOVED' }])
		expect(backend.getRequests()).toHaveLength(2)
	})

	it('does not retry a not-found response', async () => {
		const backend = createFakeHttpBackend({ baseUrl })
		backend.queueResponse('GET', '/games/123', { status: 404, body: { error: 'game not found' } })
		const client = createHttpGameClient({ baseUrl, fetchImpl: backend.fetchImpl })

		await expect(client.getState(123)).rejects.toMatchObject({
			kind: 'not-found',
			message: 'game not found',
		})
		expect(backend.getRequests()).toHaveLength(1)
	})

	it('does not retry an invalid successful snapshot', async () => {
		const backend = createFakeHttpBackend({ baseUrl })
		backend.queueResponse('GET', '/games/123', {
			body: stateResponse({ state: { onions: {}, defenders: {} } }),
		})
		backend.queueResponse('GET', '/games/123', { body: stateResponse() })
		const client = createHttpGameClient({ baseUrl, fetchImpl: backend.fetchImpl })

		await expect(client.getState(123)).rejects.toThrow('Missing stack roster')
		expect(backend.getRequests()).toHaveLength(1)
	})

	it('stops after the bounded read retry limit', async () => {
		const backend = createFakeHttpBackend({ baseUrl })
		backend.queueResponse('GET', '/games/123', { status: 500, body: { error: 'database unavailable' } })
		backend.queueResponse('GET', '/games/123', { status: 500, body: { error: 'database unavailable' } })
		const client = createHttpGameClient({ baseUrl, fetchImpl: backend.fetchImpl })

		await expect(client.getState(123)).rejects.toMatchObject({
			kind: 'transport',
			message: 'database unavailable',
		})
		expect(backend.getRequests()).toHaveLength(2)
	})

	it('does not retry action or diagnostic POST requests', async () => {
		const actionBackend = createFakeHttpBackend({ baseUrl })
		actionBackend.queueResponse('GET', '/games/123', { body: stateResponse() })
		actionBackend.queueNetworkFailure('POST', '/games/123/actions', new Error('action connection reset'))
		const client = createHttpGameClient({ baseUrl, fetchImpl: actionBackend.fetchImpl })

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'end-phase' })).rejects.toThrow('action connection reset')
		expect(actionBackend.getRequests()).toMatchObject([
			{ method: 'GET', path: '/games/123' },
			{ method: 'POST', path: '/games/123/actions' },
		])

		const diagnosticBackend = createFakeHttpBackend({ baseUrl })
		diagnosticBackend.queueNetworkFailure('POST', '/games/123/client-diagnostics', new Error('diagnostic connection reset'))
		const transport = createHttpGameRequestTransport({ baseUrl, fetchImpl: diagnosticBackend.fetchImpl })

		await expect(transport.reportDiagnostic!(123, {
			reportId: '550e8400-e29b-41d4-a716-446655440000',
			code: 'CLIENT_SESSION_READY',
			message: 'ready',
			snapshot: {
				gameId: 123,
				scenarioName: 'Retry scenario',
				phase: 'DEFENDER_MOVE',
				turnNumber: 1,
				lastEventSeq: 1,
			},
			client: { build: 'test', userAgent: 'vitest' },
			protocolTraffic: [],
		})).rejects.toThrow('diagnostic connection reset')
		expect(diagnosticBackend.getRequests()).toMatchObject([
			{ method: 'POST', path: '/games/123/client-diagnostics' },
		])
	})
})
