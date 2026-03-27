import { describe, expect, it, vi } from 'vitest'

import { createHttpGameClient } from './httpGameClient'

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
							position: { q: 6, r: 6 },
							status: 'operational',
							weapons: [],
						},
					},
				},
				scenarioMap: {
					width: 15,
					height: 22,
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
							position: { q: 6, r: 6 },
							status: 'operational',
							weapons: [],
						},
					},
				},
				gameId: 123,
				phase: 'DEFENDER_COMBAT',
				selectedUnitId: null,
				mode: 'fire',
				scenarioMap: {
					width: 15,
					height: 22,
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

	it('keeps selection and mode local while refreshing server state', async () => {
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
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				gameId: 123,
				role: 'defender',
				phase: 'DEFENDER_COMBAT',
				scenarioName: "The Siege of Shrek's Swamp",
				turnNumber: 8,
				state: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {} },
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
			authoritativeState: { onion: { position: { q: 0, r: 1 }, treads: 43 }, defenders: {} },
			gameId: 123,
			phase: 'DEFENDER_COMBAT',
			selectedUnitId: 'wolf-2',
			mode: 'combined',
			scenarioName: "The Siege of Shrek's Swamp",
			turnNumber: 8,
			lastEventSeq: 49,
		})

		expect(fetchImpl).toHaveBeenCalledTimes(2)
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
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
				eventSeq: 12,
			}))
			.mockResolvedValueOnce(jsonResponse({
				ok: true,
				seq: 13,
				events: [
					{ seq: 13, type: 'PHASE_CHANGED', timestamp: '2026-03-26T12:00:00.000Z', from: 'ONION_MOVE', to: 'ONION_COMBAT', turnNumber: 2 },
				],
				state: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
				turnNumber: 2,
				eventSeq: 13,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
			token: 'stub.token',
		})

		await client.getState(123)
		await expect(client.submitAction(123, { type: 'end-phase' })).resolves.toEqual({
			authoritativeState: { onion: { position: { q: 0, r: 0 }, treads: 45 }, defenders: {} },
			gameId: 123,
			phase: 'ONION_COMBAT',
			selectedUnitId: null,
			mode: 'fire',
			scenarioName: "The Siege of Shrek's Swamp",
			turnNumber: 2,
			lastEventSeq: 13,
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
})