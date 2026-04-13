import { describe, expect, it, vi } from 'vitest'

import { createHttpGameRequestTransport } from '#web/lib/httpGameClient'

describe('http game request transport contract', () => {
	it('loads state over HTTP through the request transport seam', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi.fn().mockResolvedValueOnce(
			jsonResponse({
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
			}),
		)

		const transport = createHttpGameRequestTransport({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await expect(transport.getState(123)).resolves.toEqual({
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
				},
				movementRemainingByUnit: {
					'onion-1': 0,
					'wolf-2': 0,
				},
				gameId: 123,
				phase: 'DEFENDER_COMBAT',
				selectedUnitId: null,
				mode: 'fire',
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

		expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://onion.test/api/games/123')
		expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: 'Bearer stub.token',
					'content-type': 'application/json',
				}),
			}),
		)
	})

	it('submits actions over HTTP through the request transport seam', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				jsonResponse({
					gameId: 123,
					role: 'defender',
					phase: 'DEFENDER_MOVE',
					scenarioName: "The Siege of Shrek's Swamp",
					turnNumber: 8,
					state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
					movementRemainingByUnit: { 'wolf-2': 4 },
					scenarioMap: {
						width: 15,
						height: 22,
						cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
						hexes: [{ q: 1, r: 0, t: 1 }],
					},
					eventSeq: 47,
				}),
			)
			.mockResolvedValueOnce(
				jsonResponse({
					ok: true,
					seq: 48,
					events: [{ seq: 48, type: 'UNIT_MOVED', timestamp: '2026-03-26T12:00:00.000Z', unitId: 'wolf-2', to: { q: 7, r: 6 } }],
					state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
					movementRemainingByUnit: { 'wolf-2': 3 },
					scenarioMap: {
						width: 15,
						height: 22,
						cells: Array.from({ length: 22 }, (_, r) => Array.from({ length: 15 }, (_, q) => ({ q, r }))).flat(),
						hexes: [{ q: 1, r: 0, t: 1 }],
					},
					turnNumber: 8,
					eventSeq: 48,
				}),
			)

		const transport = createHttpGameRequestTransport({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await transport.getState(123)
		await expect(transport.submitAction(123, { type: 'MOVE', unitId: 'wolf-2', to: { q: 7, r: 6 } })).resolves.toEqual(
			expect.objectContaining({
				gameId: 123,
				phase: 'DEFENDER_MOVE',
				lastEventSeq: 48,
				movementRemainingByUnit: { 'wolf-2': 3 },
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
				body: JSON.stringify({ type: 'MOVE', unitId: 'wolf-2', to: { q: 7, r: 6 } }),
			}),
		)
	})

	it('normalizes not found failures from the request transport seam', async () => {
		const fetchImpl = vi.fn().mockResolvedValue({
			ok: false,
			status: 404,
			text: vi.fn().mockResolvedValue(JSON.stringify({ error: 'missing' })),
		})

		const transport = createHttpGameRequestTransport({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await expect(transport.getState(404)).rejects.toMatchObject({
			kind: 'not-found',
		})
	})
})