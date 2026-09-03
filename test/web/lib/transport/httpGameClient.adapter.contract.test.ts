import { describe, expect, it, vi } from 'vitest'

import { createHttpGameClient, createHttpGameRequestTransport } from '#web/lib/httpGameClient'
import { clearApiProtocolTraffic, getApiProtocolTrafficSnapshot } from '#shared/apiProtocol'

clearApiProtocolTraffic()

function minimalJsonResponse(body: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: vi.fn().mockResolvedValue(JSON.stringify(body)),
	}
}

function minimalStateResponse(overrides: Record<string, unknown> = {}) {
	return {
		gameId: 123,
		role: 'defender',
		phase: 'DEFENDER_MOVE',
		scenarioName: 'Contract scenario',
		turnNumber: 1,
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

function minimalActionResponse(overrides: Record<string, unknown> = {}) {
	return {
		...minimalStateResponse(),
		ok: true,
		seq: 2,
		events: [],
		...overrides,
	}
}

describe('http game client adapter contract', () => {
	it('posts a client diagnostic with the authenticated game request transport', async () => {
		const reportId = '550e8400-e29b-41d4-a716-446655440000'
		const fetchImpl = vi.fn().mockResolvedValue(minimalJsonResponse({ ok: true, reportId }, 202))
		const transport = createHttpGameRequestTransport({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await transport.reportDiagnostic!(123, {
			reportId,
			code: 'CLIENT_SESSION_READY',
			message: 'Client loaded an authoritative game snapshot',
			snapshot: {
				gameId: 123,
				scenarioName: 'Contract scenario',
				phase: 'DEFENDER_MOVE',
				turnNumber: 1,
				lastEventSeq: 2,
			},
			client: { build: 'web-test-build', userAgent: 'vitest' },
			protocolTraffic: [],
		})

		expect(fetchImpl).toHaveBeenCalledWith(
			'https://onion.test/api/games/123/client-diagnostics',
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({ authorization: 'Bearer test.jwt.token' }),
				body: expect.stringContaining('CLIENT_SESSION_READY'),
			}),
		)
	})

	it('loads state and polls events over HTTP', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				scenarioId: 'swamp-siege-01',
				hostUserId: 'host-123',
				status: 'active',
				role: 'defender',
				players: { onion: 'onion-123', defender: 'defender-123' },
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {
						'wolf-2': {
							id: 'wolf-2',
							type: 'BigBadWolf',
							position: { q: 3, r: 6 },
							state: 'operational',
							weapons: [],
						},
					},
					stackRoster: {
						groupsById: {
							'BigBadWolf:3,6': {
								groupName: 'Big Bad Wolf 2',
								unitType: 'BigBadWolf',
								position: { q: 3, r: 6 },
								unitIds: ['wolf-2'],
							},
						},
					},
				},
				victoryObjectives: [],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				events: [
					{ seq: 48, type: 'TURN_CONTEXT', summary: 'ready', timestamp: '2026-03-26T12:00:00.000Z' },
				],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		const loadedState = await client.getState(123)
		expect(loadedState).toEqual({
			snapshot: {
				authoritativeState: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {
						'wolf-2': {
							id: 'wolf-2',
							type: 'BigBadWolf',
							position: { q: 3, r: 6 },
							state: 'operational',
							weapons: [],
						},
					},
					stackRoster: {
						groupsById: {
							'BigBadWolf:3,6': {
								groupName: 'Big Bad Wolf 2',
								unitType: 'BigBadWolf',
								position: { q: 3, r: 6 },
								unitIds: ['wolf-2'],
							},
						},
					},
				},
				gameId: 123,
				scenarioId: 'swamp-siege-01',
				hostUserId: 'host-123',
				status: 'active',
				players: { onion: 'onion-123', defender: 'defender-123' },
				escapeHexes: undefined,
				phase: 'DEFENDER_COMBAT',
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				victoryObjectives: [],
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				lastEventSeq: 47,
				winner: undefined,
			},
			session: { role: 'defender' },
		})
		expect(loadedState).not.toHaveProperty('catalog')

		await expect(client.pollEvents(123, 47)).resolves.toEqual([
			{ seq: 48, type: 'TURN_CONTEXT', summary: 'ready', timestamp: '2026-03-26T12:00:00.000Z' },
		])

		expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://onion.test/api/games/123')
		expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: 'Bearer test.jwt.token',
					'content-type': 'application/json',
				}),
			}),
		)
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/events?after=47')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: 'Bearer test.jwt.token',
					'content-type': 'application/json',
				}),
			}),
		)
	})

	it('preserves lobby metadata when an action response omits immutable roster fields', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse({
				scenarioId: 'swamp-siege-01',
				hostUserId: 'host-123',
				status: 'active',
				players: { onion: 'onion-123', defender: 'defender-123' },
			})))
			.mockResolvedValueOnce(minimalJsonResponse(minimalActionResponse({
				status: 'active',
				hostUserId: 'host-123',
			})))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'end-phase' })).resolves.toMatchObject({
			scenarioId: 'swamp-siege-01',
			hostUserId: 'host-123',
			status: 'active',
			players: { onion: 'onion-123', defender: 'defender-123' },
		})
	})

	it('captures the raw refresh snapshot before parsing it', async () => {
		clearApiProtocolTraffic()

		const fetchImpl = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			text: vi.fn().mockResolvedValue(JSON.stringify({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_MOVE',
				scenarioName: 'The Siege of Shrek\'s Swamp',
				turnNumber: 8,
				state: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {},
					stackRoster: { groupsById: {} },
				},
				scenarioMap: {
					width: 15,
					height: 22,
					cells: [{ q: 0, r: 0 }],
					hexes: [],
				},
				eventSeq: 47,
			})),
		})

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)

		const traffic = getApiProtocolTrafficSnapshot()
		expect(String(traffic.at(-1)?.rawResponseBody ?? '')).toContain('"eventSeq":47')
		expect(String(traffic.at(-1)?.rawResponseBody ?? '')).toContain('"stackRoster"')
	})

	it('rejects local-only actions through the client adapter', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi.fn().mockResolvedValueOnce(
			jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				victoryObjectives: [],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}),
		)

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)

		await expect(client.submitAction(123, { type: 'select-unit', unitId: 'wolf-2' })).rejects.toMatchObject({
			kind: 'transport',
			message: "Action 'select-unit' is not supported by the HTTP game transport",
		})
		await expect(client.submitAction(123, { type: 'set-mode', mode: 'combined' })).rejects.toMatchObject({
			kind: 'transport',
			message: "Action 'set-mode' is not supported by the HTTP game transport",
		})
		expect(fetchImpl).toHaveBeenCalledTimes(1)
	})

	it('refreshes authoritative server state without carrying UI-local snapshot fields', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				victoryObjectives: [],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				escapeHexes: [{ q: 9, r: 5 }],
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 48,
				events: [],
				state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 48,
			}))
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				escapeHexes: [{ q: 9, r: 5 }],
				eventSeq: 49,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)
		await client.submitAction(123, { type: 'end-phase' })

		await expect(client.submitAction(123, { type: 'refresh' })).resolves.toEqual({
				authoritativeState: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
			gameId: 123,
			phase: 'DEFENDER_COMBAT',
			scenarioName: "The Siege of Shrek's Swamp",
			escapeHexes: [{ q: 9, r: 5 }],
			scenarioMap: {
				width: 15,
				height: 22,
				cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
				hexes: [{ q: 1, r: 0, t: 1 }],
			},
			turnNumber: 8,
			lastEventSeq: 49,
		})

		expect(fetchImpl).toHaveBeenCalledTimes(3)
	})

	it('maps action winner into the returned snapshot after escape victory', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				victoryObjectives: [],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				escapeHexes: [{ q: 9, r: 5 }],
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 49,
				events: [
					{ seq: 49, type: 'ONION_MOVED', timestamp: '2026-03-26T12:00:00.000Z' },
					{ seq: 50, type: 'GAME_OVER', timestamp: '2026-03-26T12:00:00.000Z', winner: 'onion' },
				],
				state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 50,
				winner: 'onion',
				escapeHexes: [{ q: 9, r: 5 }],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)

		await expect(client.submitAction(123, { type: 'MOVE', movers: ['onion-1'], to: { q: 9, r: 5 } })).resolves.toMatchObject({
			winner: 'onion',
			lastEventSeq: 50,
			escapeHexes: [{ q: 9, r: 5 }],
		})
	})

	it('maps action victory objectives into the current snapshot after Swamp destruction', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'ONION_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 3,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				victoryObjectives: [
					{ id: 'destroy-swamp-1', label: 'Destroy The Swamp', kind: 'destroy-unit', unitId: 'swamp-1', required: true, completed: true },
					{ id: 'escape-off-map', label: 'Escape to the swamp edge hex', kind: 'escape-map', required: true, completed: false },
				],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				escapeHexes: [{ q: 0, r: 9 }],
				eventSeq: 14,
			}))
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'ONION_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 3,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				victoryObjectives: [
					{ id: 'destroy-swamp-1', label: 'Destroy The Swamp', kind: 'destroy-unit', unitId: 'swamp-1', required: true, completed: true },
					{ id: 'escape-off-map', label: 'Escape to the swamp edge hex', kind: 'escape-map', required: true, completed: false },
				],
				escapeHexes: [{ q: 0, r: 9 }],
				events: [{ seq: 14, type: 'FIRE_RESOLVED', timestamp: '2026-03-26T12:00:00.000Z' }],
				eventSeq: 14,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)

		const snapshot = await client.submitAction(123, { type: 'FIRE', attackers: ['main'], targetId: 'swamp-1', onionId: 'onion-1' })

		expect(snapshot.victoryObjectives).toEqual([
			{ id: 'destroy-swamp-1', label: 'Destroy The Swamp', kind: 'destroy-unit', unitId: 'swamp-1', required: true, completed: true },
			{ id: 'escape-off-map', label: 'Escape to the swamp edge hex', kind: 'escape-map', required: true, completed: false },
		])
		expect(fetchImpl).toHaveBeenCalledTimes(2)
	})

	it('sends stack fire actions to the backend as FIRE commands', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				victoryObjectives: [],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 48,
				events: [
					{ seq: 48, type: 'FIRE_RESOLVED', timestamp: '2026-03-26T12:00:00.000Z', attackers: ['wolf-2', 'wolf-3'], targetId: 'onion-1', roll: 4, outcome: 'D', odds: '2:1' },
				],
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 48,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, {
			type: 'FIRE',
			attackers: ['wolf-2', 'wolf-3'],
			targetId: 'onion-1',
			onionId: 'onion-1',
		})).resolves.toMatchObject({
			gameId: 123,
			lastEventSeq: 48,
			combatResolution: {
				actionType: 'FIRE',
				attackers: ['wolf-2', 'wolf-3'],
				targetId: 'onion-1',
				outcome: 'D',
				outcomeLabel: 'Hit',
				roll: 4,
				odds: '2:1',
			},
		})

		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ type: 'FIRE', attackers: ['wolf-2', 'wolf-3'], targetId: 'onion-1', onionId: 'onion-1' }),
			}),
		)
	})

	it('sends MOVE actions to the backend with the mover list payload', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				victoryObjectives: [],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 48,
				events: [
					{ seq: 48, type: 'UNIT_MOVED', timestamp: '2026-03-26T12:00:00.000Z', unitId: 'wolf-2', to: { q: 5, r: 4 } },
				],
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 48,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)
		await client.submitAction(123, {
			type: 'MOVE',
			movers: ['wolf-2'],
			to: { q: 5, r: 4 },
		})

		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({
					type: 'MOVE',
					movers: ['wolf-2'],
					to: { q: 5, r: 4 },
				}),
			}),
		)
	})

	it('sends end phase actions to the backend', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'ONION_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 2,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 12,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 13,
				events: [
					{ seq: 13, type: 'PHASE_CHANGED', timestamp: '2026-03-26T12:00:00.000Z', from: 'ONION_MOVE', to: 'ONION_COMBAT', turnNumber: 2 },
				],
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 2,
				eventSeq: 13,
				phase: 'ONION_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				victoryObjectives: [],
				escapeHexes: [{ q: 9, r: 5 }],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'end-phase' })).resolves.toEqual(
			expect.objectContaining({
				authoritativeState: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				gameId: 123,
				phase: 'ONION_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				escapeHexes: [{ q: 9, r: 5 }],
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				turnNumber: 2,
				lastEventSeq: 13,
				combatResolution: undefined,
			}),
		)

		expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://onion.test/api/games/123')
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					authorization: 'Bearer test.jwt.token',
					'content-type': 'application/json',
				}),
				body: JSON.stringify({ type: 'END_PHASE' }),
			}),
		)
	})

	it('sends MOVE actions to the backend actions endpoint', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 48,
				events: [
					{ seq: 48, type: 'MOVE_RESOLVED', timestamp: '2026-03-26T12:00:00.000Z', unitId: 'onion-1', rammedUnitIds: ['d1'], rammedUnitFriendlyNames: ['The Swamp'], destroyedUnitIds: ['d1'], destroyedUnitFriendlyNames: ['The Swamp'], rammedUnitResults: [{ unitId: 'd1', unitFriendlyName: 'The Swamp', unitType: 'Swamp', outcome: { effect: 'destroyed', roll: 2, treadCost: 1 } }], treadDamage: 1 },
					{ seq: 49, type: 'ONION_TREADS_LOST', timestamp: '2026-03-26T12:00:00.000Z', amount: 1, remaining: 44 },
					{ seq: 50, type: 'UNIT_STATUS_CHANGED', timestamp: '2026-03-26T12:00:00.000Z', unitId: 'd1', from: 'operational', to: 'destroyed' },
				],
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 50,
				phase: 'DEFENDER_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				victoryObjectives: [],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'MOVE', movers: ['onion'], to: { q: 7, r: 6 } })).resolves.toEqual(
			expect.objectContaining({
				gameId: 123,
				phase: 'DEFENDER_MOVE',
				lastEventSeq: 50,
				ramResolution: [
					{
						actionType: 'MOVE',
						unitId: 'onion-1',
						rammedUnitId: 'd1',
						rammedUnitFriendlyName: 'The Swamp',
						destroyedUnitId: 'd1',
						treadDamage: 1,
						details: ['Target: The Swamp', 'Result: destroyed', 'Roll: 2', 'Tread loss: 1'],
					},
				],
			}),
		)

		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					authorization: 'Bearer test.jwt.token',
					'content-type': 'application/json',
				}),
				body: JSON.stringify({ type: 'MOVE', movers: ['onion'], to: { q: 7, r: 6 } }),
			}),
		)
	})

	it('serializes attemptRam when a move request includes it', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'onion',
				phase: 'ONION_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 48,
				events: [],
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 48,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)
		await client.submitAction(123, { type: 'MOVE', movers: ['onion'], to: { q: 7, r: 6 }, attemptRam: false })

		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				body: JSON.stringify({ type: 'MOVE', movers: ['onion'], to: { q: 7, r: 6 }, attemptRam: false }),
			}),
		)
	})

	it('sends FIRE actions and captures combat resolution details', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 48,
				events: [
					{ seq: 48, type: 'FIRE_RESOLVED', timestamp: '2026-03-26T12:00:00.000Z', attackers: ['wolf-2'], targetId: 'onion-1', roll: 6, outcome: 'X', odds: '2:1' },
					{ seq: 49, type: 'ONION_TREADS_LOST', timestamp: '2026-03-26T12:00:00.000Z', amount: 3, remaining: 42 },
				],
				state: { onion: { position: { q: 0, r: 0 }, treads: 42 }, defenders: {}, stackRoster: { groupsById: {} } },
				turnNumber: 8,
				eventSeq: 49,
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				victoryObjectives: [],
				escapeHexes: [{ q: 9, r: 5 }],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'test.jwt.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'FIRE', attackers: ['wolf-2'], targetId: 'onion-1', onionId: 'onion-1' })).resolves.toEqual(
			expect.objectContaining({
				gameId: 123,
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 49,
				combatResolution: {
					actionType: 'FIRE',
					attackers: ['wolf-2'],
					targetId: 'onion-1',
					outcome: 'X',
					outcomeLabel: 'Hit',
					roll: 6,
					odds: '2:1',
					details: ['Treads lost: 3 (remaining 42)'],
				},
			}),
		)

		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					authorization: 'Bearer test.jwt.token',
					'content-type': 'application/json',
				}),
				body: JSON.stringify({ type: 'FIRE', attackers: ['wolf-2'], targetId: 'onion-1', onionId: 'onion-1' }),
			}),
		)
	})

	it('normalizes not found responses', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'missing' })),
		})

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(client.getState(404)).rejects.toMatchObject({
			kind: 'not-found',
		})
	})

	it('rejects game state responses that omit scenario map data', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {},
					stackRoster: { groupsById: {} },
				},
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {},
					stackRoster: { groupsById: {} },
				},
				scenarioMap: {
					width: 15,
					height: 22,
					hexes: [],
				},
				eventSeq: 48,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(client.getState(123)).rejects.toThrow('Missing scenario map in game state response')
		await expect(client.getState(123)).rejects.toThrow('Missing scenario map cells in game state response')
	})

	it('rejects responses that omit or malform the stack roster contract', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {
						'pigs-1': {
							id: 'pigs-1',
							type: 'LittlePigs',
							position: { q: 4, r: 4 },
							state: 'operational',
							friendlyName: 'Little Pigs 1',
						},
					},
					stackRoster: {
						groupsById: {
							bad: {
								groupName: 'Little Pigs group 1',
								unitType: 'LittlePigs',
								position: { q: 4, r: 4 },
								unitIds: ['pigs-1'],
							},
						},
					},
				},
				scenarioMap: {
					width: 15,
					height: 22,
					cells: [{ q: 0, r: 0 }],
					hexes: [],
				},
				eventSeq: 48,
			}))
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_MOVE',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {
						'pigs-1': {
							id: 'pigs-1',
							type: 'LittlePigs',
							position: { q: 4, r: 4 },
							state: 'operational',
							friendlyName: 'Little Pigs 1',
						},
					},
					stackRoster: {
						groupsById: {
							bad: {
								groupName: 'Little Pigs group 1',
								unitType: 'LittlePigs',
								position: { q: 4, r: 4 },
								unitIds: null,
							},
						},
					},
				},
				scenarioMap: {
					width: 15,
					height: 22,
					cells: [{ q: 0, r: 0 }],
					hexes: [],
				},
				eventSeq: 49,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(client.getState(123)).resolves.toMatchObject({
			snapshot: {
				authoritativeState: {
					stackRoster: {
						groupsById: {
							bad: {
								groupName: 'Little Pigs group 1',
							},
						},
					},
				},
			},
		})
		await expect(client.getState(123)).rejects.toThrow('Invalid stack roster group shape for bad')
	})

	it('rejects grouped units absent from defenders in stack roster payload', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({
			gameId: 123,
			role: 'defender',
			phase: 'DEFENDER_MOVE',
			scenarioName: "The Siege of Shrek's Swamp",
			turnNumber: 8,
			state: {
				onion: { position: { q: 0, r: 0 }, treads: 45 },
				defenders: {
					'pigs-1': {
						id: 'pigs-1',
						type: 'LittlePigs',
						position: { q: 4, r: 4 },
							state: 'operational',
						friendlyName: 'Little Pigs 1',
					},
				},
				stackRoster: {
					groupsById: {
						'LittlePigs:4,4': {
							groupName: 'Little Pigs group 1',
							unitType: 'LittlePigs',
							position: { q: 4, r: 4 },
							unitIds: ['pigs-1', 'pigs-2'],
						},
					},
				},
			},
			scenarioMap: {
				width: 15,
				height: 22,
				cells: [{ q: 0, r: 0 }],
				hexes: [],
			},
			eventSeq: 48,
		}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(client.getState(123)).rejects.toThrow(/missing.*pigs-2/i)
	})

	it('accepts stack roster payloads that rely on defenders as canonical unit data', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi.fn().mockResolvedValueOnce(jsonResponse({
			gameId: 123,
			role: 'defender',
			phase: 'DEFENDER_MOVE',
			scenarioName: "The Siege of Shrek's Swamp",
			turnNumber: 8,
			state: {
				onion: { position: { q: 0, r: 0 }, treads: 45 },
				defenders: {
					'pigs-1': {
						id: 'pigs-1',
						type: 'LittlePigs',
						position: { q: 4, r: 4 },
							state: 'operational',
						friendlyName: 'Little Pigs 1',
					},
				},
				stackRoster: {
					groupsById: {
						'LittlePigs:4,4': {
							groupName: 'Little Pigs group 1',
							unitType: 'LittlePigs',
							position: { q: 4, r: 4 },
							unitIds: ['pigs-1'],
						},
					},
				},
			},
			scenarioMap: {
				width: 15,
				height: 22,
				cells: [{ q: 0, r: 0 }],
				hexes: [],
			},
			eventSeq: 48,
		}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(client.getState(123)).resolves.toMatchObject({
			snapshot: {
				authoritativeState: {
					stackRoster: {
						groupsById: {
							'LittlePigs:4,4': {
								groupName: 'Little Pigs group 1',
								unitIds: ['pigs-1'],
							},
						},
					},
				},
			},
		})
	})

	it.each([
		['missing scenario map', { scenarioMap: undefined }, 'Missing scenario map in game state response'],
		['missing scenario map cells', { scenarioMap: { width: 1, height: 1, hexes: [] } }, 'Missing scenario map cells in game state response'],
		['empty scenario map cells', { scenarioMap: { width: 1, height: 1, cells: [], hexes: [] } }, 'Scenario map cells must not be empty in game state response'],
		['missing stack roster', { state: { onions: {}, defenders: {} } }, 'Missing stack roster in game state response'],
		['invalid stack roster group', { state: { onions: {}, defenders: {}, stackRoster: { groupsById: { bad: { unitIds: null } } } } }, 'Invalid stack roster group shape for bad'],
		['missing roster defender', { state: { onions: {}, defenders: {}, stackRoster: { groupsById: { bad: { unitIds: ['missing'] } } } } }, 'Missing stack roster defender missing for bad'],
	] as const)('rejects %s', async (_name, overrides, message) => {
		const fetchImpl = vi.fn().mockResolvedValue(minimalJsonResponse(minimalStateResponse(overrides)))
		const client = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl })

		await expect(client.getState(123)).rejects.toThrow(message)
	})

	it.each([
		[404, 'not-found'],
		[400, 'invalid-action'],
		[422, 'invalid-action'],
		[500, 'transport'],
	] as const)('maps HTTP status %s into the %s error category', async (status, kind) => {
		const fetchImpl = vi.fn().mockResolvedValue(minimalJsonResponse({ error: 'backend rejected request' }, status))
		const client = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl })

		await expect(client.getState(123)).rejects.toMatchObject({
			kind,
			message: 'backend rejected request',
		})
	})

	it('normalizes supported, lowercase, and unknown phases at the HTTP boundary', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse({ phase: 'onion_move' })))
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse({ phase: 'NOT_A_PHASE' })))
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse({ phase: null })))
		const client = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl })

		await expect(client.getState(123)).resolves.toMatchObject({ snapshot: { phase: 'ONION_MOVE' } })
		await expect(client.getState(123)).resolves.toMatchObject({ snapshot: { phase: 'DEFENDER_MOVE' } })
		await expect(client.getState(123)).resolves.toMatchObject({ snapshot: { phase: 'DEFENDER_MOVE' } })
	})

	it('maps every supported action and preserves optional MOVE fields', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse()))
			.mockResolvedValueOnce(minimalJsonResponse(minimalActionResponse({ eventSeq: 2 })))
			.mockResolvedValueOnce(minimalJsonResponse(minimalActionResponse({ eventSeq: 3 })))
			.mockResolvedValueOnce(minimalJsonResponse(minimalActionResponse({ eventSeq: 4 })))
			.mockResolvedValueOnce(minimalJsonResponse(minimalActionResponse({ eventSeq: 5 })))
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse({ eventSeq: 6 })))
		const client = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl })

		await client.getState(123)
		await client.submitAction(123, { type: 'end-phase' })
		await client.submitAction(123, { type: 'MOVE', movers: ['onion-1'], to: { q: 1, r: 0 }, attemptRam: true })
		await client.submitAction(123, { type: 'MOVE', movers: ['onion-1'], to: { q: 0, r: 1 } })
		await client.submitAction(123, { type: 'FIRE', attackers: ['main'], targetId: 'def-1', onionId: 'onion-1' })
		await client.submitAction(123, { type: 'refresh' })

		expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({ type: 'END_PHASE' })
		expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toEqual({
			type: 'MOVE',
			movers: ['onion-1'],
			to: { q: 1, r: 0 },
			attemptRam: true,
		})
		expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body))).toEqual({
			type: 'MOVE',
			movers: ['onion-1'],
			to: { q: 0, r: 1 },
		})
		expect(JSON.parse(String(fetchImpl.mock.calls[4]?.[1]?.body))).toEqual({
			type: 'FIRE',
			attackers: ['main'],
			targetId: 'def-1',
			onionId: 'onion-1',
		})
		expect(fetchImpl.mock.calls[5]?.[0]).toBe('https://onion.test/api/games/123')
		expect(fetchImpl.mock.calls[5]?.[1]?.method).toBe('GET')
	})

	it('returns an empty list when polling omits the events field', async () => {
		const fetchImpl = vi.fn()
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse({ eventSeq: 7 })))
			.mockResolvedValueOnce(minimalJsonResponse({}))
		const client = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl })

		await client.getState(123)
		await expect(client.pollEvents(123, 7)).resolves.toEqual([])
	})

	it('normalizes network failures and unsupported actions', async () => {
		const networkClient = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
		})
		await expect(networkClient.getState(123)).rejects.toMatchObject({ kind: 'transport', message: 'network down' })

		const fetchImpl = vi.fn().mockResolvedValue(minimalJsonResponse(minimalStateResponse()))
		const client = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl })
		await client.getState(123)
		await expect(client.submitAction(123, { type: 'unknown-action' } as never)).rejects.toMatchObject({
			kind: 'transport',
			message: 'Action is not supported by the HTTP game transport',
		})
	})

	it('retries transient read failures but does not retry not-found responses', async () => {
		const recoveredFetch = vi.fn()
			.mockResolvedValueOnce(minimalJsonResponse({ error: 'temporary failure' }, 503))
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse()))
		const recoveredClient = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl: recoveredFetch })

		await expect(recoveredClient.getState(123)).resolves.toMatchObject({ snapshot: { lastEventSeq: 1 } })
		expect(recoveredFetch).toHaveBeenCalledTimes(2)

		const missingFetch = vi.fn().mockResolvedValue(minimalJsonResponse({ error: 'game missing' }, 404))
		const missingClient = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl: missingFetch })

		await expect(missingClient.getState(123)).rejects.toMatchObject({ kind: 'not-found' })
		expect(missingFetch).toHaveBeenCalledTimes(1)
	})

	it('does not retry action or diagnostic POST requests', async () => {
		const actionFetch = vi.fn()
			.mockResolvedValueOnce(minimalJsonResponse(minimalStateResponse()))
			.mockRejectedValueOnce(new Error('action transport failure'))
		const actionClient = createHttpGameClient({ baseUrl: 'https://onion.test/api', fetchImpl: actionFetch })

		await actionClient.getState(123)
		await expect(actionClient.submitAction(123, { type: 'end-phase' })).rejects.toThrow('action transport failure')
		expect(actionFetch).toHaveBeenCalledTimes(2)

		const diagnosticFetch = vi.fn().mockRejectedValue(new Error('diagnostic transport failure'))
		const diagnosticTransport = createHttpGameRequestTransport({ baseUrl: 'https://onion.test/api', fetchImpl: diagnosticFetch })

		await expect(diagnosticTransport.reportDiagnostic!(123, {
			reportId: '550e8400-e29b-41d4-a716-446655440000',
			code: 'CLIENT_SESSION_READY',
			message: 'ready',
			snapshot: {
				gameId: 123,
				scenarioName: 'Contract scenario',
				phase: 'DEFENDER_MOVE',
				turnNumber: 1,
				lastEventSeq: 1,
			},
			client: { build: 'test', userAgent: 'vitest' },
			protocolTraffic: [],
		})).rejects.toThrow('diagnostic transport failure')
		expect(diagnosticFetch).toHaveBeenCalledTimes(1)
	})
})