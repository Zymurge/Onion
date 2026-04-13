import { describe, expect, it, vi } from 'vitest'

import { bootstrapTestGame } from './test-game-helper.js'

describe('bootstrapTestGame', () => {
	it('logs in user1, creates the onion game, logs in user2, and joins the game', async () => {
		const calls: Array<{ kind: string; username?: string; password?: string; scenarioId?: string; role?: string; gameId?: string }> = []
		const session = { baseUrl: 'http://example.test', token: null, userId: null, username: null, gameId: null, role: null, lastEventSeq: null, scenarioId: null, phase: null, turnNumber: null, winner: null, gameState: null, scenario: null, events: [] }

		const login = vi.fn(async (_session, username: string, password: string) => {
			calls.push({ kind: 'login', username, password })
			return { ok: true as const, status: 200, data: { userId: `${username}-id`, token: `${username}.token` } }
		})
		const create = vi.fn(async (_session, scenarioId: string, role: 'onion' | 'defender') => {
			calls.push({ kind: 'create', scenarioId, role })
			return { ok: true as const, status: 200, data: { gameId: 777, role } }
		})
		const join = vi.fn(async (_session, gameId: string) => {
			calls.push({ kind: 'join', gameId })
			return { ok: true as const, status: 200, data: { gameId: Number(gameId), role: 'defender' as const } }
		})

		await expect(
			bootstrapTestGame({
				session,
				login,
				create,
				join,
			}),
		).resolves.toBe(777)

		expect(calls).toEqual([
			{ kind: 'login', username: 'user1', password: 'user1P4ss' },
			{ kind: 'create', scenarioId: 'swamp-siege-01', role: 'onion' },
			{ kind: 'login', username: 'user2', password: 'user2P4ss' },
			{ kind: 'join', gameId: '777' },
		])
		expect(session.baseUrl).toBe('http://example.test')
		expect(session.gameId).toBe('777')
	})
})