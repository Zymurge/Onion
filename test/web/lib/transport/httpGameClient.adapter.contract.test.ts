import { describe, expect, it, vi } from 'vitest'

import { createHttpGameClient } from '#web/lib/httpGameClient'

describe('http game client adapter contract', () => {
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
				role: 'defender',
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
							status: 'operational',
							weapons: [],
						},
					},
					stackRoster: {
						groupsById: {
							'BigBadWolf:3,6': {
								groupName: 'Big Bad Wolf 2',
								unitType: 'BigBadWolf',
								position: { q: 3, r: 6 },
								units: [{ id: 'wolf-2', status: 'operational', friendlyName: 'Big Bad Wolf 2' }],
							},
						},
					},
				},
				movementRemainingByUnit: {
					'onion-1': 0,
					'wolf-2': 0,
				},
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
			token: 'stub.token',
		})

		await expect(client.getState(123)).resolves.toEqual({
			snapshot: {
				authoritativeState: {
					onion: { position: { q: 0, r: 0 }, treads: 45 },
					defenders: {
						'wolf-2': {
							id: 'wolf-2',
							type: 'BigBadWolf',
							position: { q: 3, r: 6 },
							status: 'operational',
							weapons: [],
						},
					},
					stackRoster: {
						groupsById: {
							'BigBadWolf:3,6': {
								groupName: 'Big Bad Wolf 2',
								unitType: 'BigBadWolf',
								position: { q: 3, r: 6 },
								units: [{ id: 'wolf-2', status: 'operational', friendlyName: 'Big Bad Wolf 2' }],
							},
						},
					},
				},
					movementRemainingByUnit: {
						'onion-1': 0,
						'wolf-2': 0,
					},
				gameId: 123,
				phase: 'DEFENDER_COMBAT',
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				lastEventSeq: 47,
			},
			session: { role: 'defender' },
		})

		await expect(client.pollEvents(123, 47)).resolves.toEqual([
			{ seq: 48, type: 'TURN_CONTEXT', summary: 'ready', timestamp: '2026-03-26T12:00:00.000Z' },
		])

		expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://onion.test/api/games/123')
		expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: 'Bearer stub.token',
					'content-type': 'application/json',
				}),
			}),
		)
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/events?after=47')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: 'Bearer stub.token',
					'content-type': 'application/json',
				}),
			}),
		)
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
					movementRemainingByUnit: {
						'onion-1': 0,
					},
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
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
					movementRemainingByUnit: {
						'onion-1': 0,
					},
				scenarioMap: {
					width: 15,
					height: 22,
					cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
					hexes: [{ q: 1, r: 0, t: 1 }],
				},
				eventSeq: 49,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState(123)
		await client.submitAction(123, { type: 'select-unit', unitId: 'wolf-2' })
		await client.submitAction(123, { type: 'set-mode', mode: 'combined' })

		await expect(client.submitAction(123, { type: 'refresh' })).resolves.toEqual({
				authoritativeState: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
			movementRemainingByUnit: { 'onion-1': 0 },
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

		expect(fetchImpl).toHaveBeenCalledTimes(2)
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
				ok: true,
				seq: 49,
				events: [
					{ seq: 49, type: 'ONION_MOVED', timestamp: '2026-03-26T12:00:00.000Z' },
					{ seq: 50, type: 'GAME_OVER', timestamp: '2026-03-26T12:00:00.000Z', winner: 'onion' },
				],
				state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {}, stackRoster: { groupsById: {} } },
				movementRemainingByUnit: { 'onion-1': 0 },
				turnNumber: 8,
				eventSeq: 50,
				winner: 'onion',
				escapeHexes: [{ q: 9, r: 5 }],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(client.submitAction(123, { type: 'MOVE', unitId: 'onion-1', to: { q: 9, r: 5 } })).resolves.toMatchObject({
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
				movementRemainingByUnit: { 'onion-1': 0 },
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

		const snapshot = await client.submitAction(123, { type: 'FIRE', attackers: ['main'], targetId: 'swamp-1' })

		expect(snapshot.victoryObjectives).toEqual([
			{ id: 'destroy-swamp-1', label: 'Destroy The Swamp', kind: 'destroy-unit', unitId: 'swamp-1', required: true, completed: true },
			{ id: 'escape-off-map', label: 'Escape to the swamp edge hex', kind: 'escape-map', required: true, completed: false },
		])
		expect(fetchImpl).toHaveBeenCalledTimes(1)
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
				movementRemainingByUnit: { 'onion-1': 3 },
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
				movementRemainingByUnit: { 'onion-1': 0 },
				turnNumber: 2,
				eventSeq: 13,
				escapeHexes: [{ q: 9, r: 5 }],
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'end-phase' })).resolves.toEqual({
				authoritativeState: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {}, stackRoster: { groupsById: {} } },
			movementRemainingByUnit: { 'onion-1': 0 },
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
		})

		expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://onion.test/api/games/123')
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/123/actions')
		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					authorization: 'Bearer stub.token',
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
				movementRemainingByUnit: { 'wolf-2': 4 },
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
				movementRemainingByUnit: { 'wolf-2': 3 },
				turnNumber: 8,
				eventSeq: 50,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'MOVE', unitId: 'onion', to: { q: 7, r: 6 } })).resolves.toEqual(
			expect.objectContaining({
				gameId: 123,
				phase: 'DEFENDER_MOVE',
				lastEventSeq: 50,
				movementRemainingByUnit: { 'wolf-2': 3 },
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
					authorization: 'Bearer stub.token',
					'content-type': 'application/json',
				}),
				body: JSON.stringify({ type: 'MOVE', unitId: 'onion', to: { q: 7, r: 6 } }),
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
				movementRemainingByUnit: { 'onion-1': 3 },
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
				movementRemainingByUnit: { 'onion-1': 2 },
				turnNumber: 8,
				eventSeq: 48,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await client.getState(123)
		await client.submitAction(123, { type: 'MOVE', unitId: 'onion', to: { q: 7, r: 6 }, attemptRam: false })

		expect(fetchImpl.mock.calls[1]?.[1]).toEqual(
			expect.objectContaining({
				body: JSON.stringify({ type: 'MOVE', unitId: 'onion', to: { q: 7, r: 6 }, attemptRam: false }),
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
				movementRemainingByUnit: { 'wolf-2': 4 },
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
				movementRemainingByUnit: { 'wolf-2': 4 },
				turnNumber: 8,
				eventSeq: 49,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'FIRE', attackers: ['wolf-2'], targetId: 'onion-1' })).resolves.toEqual(
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
					authorization: 'Bearer stub.token',
					'content-type': 'application/json',
				}),
				body: JSON.stringify({ type: 'FIRE', attackers: ['wolf-2'], targetId: 'onion-1' }),
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
				movementRemainingByUnit: {},
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
				movementRemainingByUnit: {},
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
							status: 'operational',
							friendlyName: 'Little Pigs 1',
						},
					},
				},
				movementRemainingByUnit: {},
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
							status: 'operational',
							friendlyName: 'Little Pigs 1',
						},
					},
					stackRoster: {
						groupsById: {
							bad: {
								groupName: 'Little Pigs group 1',
								unitType: 'LittlePigs',
								position: { q: 4, r: 4 },
								units: null,
							},
						},
					},
				},
				movementRemainingByUnit: {},
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

		await expect(client.getState(123)).rejects.toThrow('Missing stack roster in game state response')
		await expect(client.getState(123)).rejects.toThrow('Invalid stack roster group shape for bad')
	})
})