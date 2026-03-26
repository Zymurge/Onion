import { describe, expect, it, vi } from 'vitest'

import { createHttpGameClient } from './httpGameClient'

describe('http game client', () => {
	it('loads state and polls events over HTTP', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					gameId: 'game-123',
					phase: 'DEFENDER_COMBAT',
					eventSeq: 47,
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					events: [
						{ seq: 48, type: 'TURN_CONTEXT', summary: 'ready', timestamp: '2026-03-26T12:00:00.000Z' },
					],
				}),
			})

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

		expect(fetchImpl).toHaveBeenNthCalledWith(
			1,
			'https://onion.test/api/games/game-123',
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: 'Bearer stub.token',
				}),
			}),
		)
		expect(fetchImpl).toHaveBeenNthCalledWith(
			2,
			'https://onion.test/api/games/game-123/events?after=47',
			expect.objectContaining({
				headers: expect.objectContaining({
					Authorization: 'Bearer stub.token',
				}),
			}),
		)
	})

	it('keeps selection and mode local while refreshing server state', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					gameId: 'game-123',
					phase: 'DEFENDER_COMBAT',
					eventSeq: 47,
				}),
			})
			.mockResolvedValueOnce({
				ok: true,
				status: 200,
				json: vi.fn().mockResolvedValue({
					gameId: 'game-123',
					phase: 'DEFENDER_COMBAT',
					eventSeq: 49,
				}),
			})

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
			json: vi.fn().mockResolvedValue({ error: 'missing' }),
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