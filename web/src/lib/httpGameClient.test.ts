import { describe, expect, it, vi } from 'vitest'

import { createHttpGameClient } from './httpGameClient'

describe('http game client', () => {
	it('loads state and polls events over HTTP', async () => {
		const jsonResponse = (body: unknown, status = 200) => ({
			ok: true,
			status,
			text: vi.fn().mockResolvedValue(JSON.stringify(body)),
		})

		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(jsonResponse({
				gameId: 'game-123',
				phase: 'DEFENDER_COMBAT',
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

		await expect(client.getState('game-123')).resolves.toEqual({
			gameId: 'game-123',
			phase: 'defender',
			selectedUnitId: null,
			mode: 'fire',
			lastEventSeq: 47,
		})

		await expect(client.pollEvents('game-123', 47)).resolves.toEqual([
			{ seq: 48, type: 'TURN_CONTEXT', summary: 'ready', timestamp: '2026-03-26T12:00:00.000Z' },
		])

		expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://onion.test/api/games/game-123')
		expect(fetchImpl.mock.calls[0]?.[1]).toEqual(
			expect.objectContaining({
				headers: expect.objectContaining({
					authorization: 'Bearer stub.token',
					'content-type': 'application/json',
				}),
			}),
		)
		expect(fetchImpl.mock.calls[1]?.[0]).toBe('https://onion.test/api/games/game-123/events?after=47')
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
				gameId: 'game-123',
				phase: 'DEFENDER_COMBAT',
				eventSeq: 47,
			}))
			.mockResolvedValueOnce(jsonResponse({
				gameId: 'game-123',
				phase: 'DEFENDER_COMBAT',
				eventSeq: 49,
			}))

		const client = createHttpGameClient({
			baseUrl: 'https://onion.test/api',
			fetchImpl,
		})

		await client.getState('game-123')
		await client.submitAction('game-123', { type: 'select-unit', unitId: 'wolf-2' })
		await client.submitAction('game-123', { type: 'set-mode', mode: 'combined' })

		await expect(client.submitAction('game-123', { type: 'refresh' })).resolves.toEqual({
			gameId: 'game-123',
			phase: 'defender',
			selectedUnitId: 'wolf-2',
			mode: 'combined',
			lastEventSeq: 49,
		})

		expect(fetchImpl).toHaveBeenCalledTimes(2)
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

		await expect(client.getState('game-404')).rejects.toMatchObject({
			kind: 'not-found',
		})
	})
})