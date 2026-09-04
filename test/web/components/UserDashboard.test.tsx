// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserDashboard } from '#web/components/UserDashboard'
import { saveAuthSession } from '#web/lib/authSession'

function response(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText: status === 500 ? 'Internal Server Error' : 'OK',
		text: async () => JSON.stringify(body),
	} as Response
}

describe('UserDashboard', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
		vi.restoreAllMocks()
	})

	it('shows the current account and an empty state for a new player', async () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ games: [] }))

		render(<UserDashboard />)

		expect(screen.getByRole('heading', { name: /welcome back, player-1/i })).not.toBeNull()
		await screen.findByText('You have no games yet.')
		expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games', expect.objectContaining({
			headers: { 'content-type': 'application/json', authorization: 'Bearer token-1' },
		}))
		expect(screen.queryByText(/Game 42/)).toBeNull()
		expect(screen.queryByRole('link', { name: 'Create New Game' })).toBeNull()
		expect(screen.getByRole('button', { name: 'Sign Out' })).not.toBeNull()
		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/user/dashboard')
		expect(screen.getByRole('link', { name: 'Create Game' })).toHaveAttribute('href', '/game/create')
		expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/user/create')
	})

	it('renders games returned for the signed-in player', async () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
			games: [{
				gameId: 12,
				scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
				phase: 'ONION_MOVE',
				turnNumber: 1,
				winner: null,
				status: 'active',
				role: 'onion',
			}],
		}))

		render(<UserDashboard />)

		await screen.findByText('Game 12 · Your turn')
		expect(screen.getByText('The Siege of Shrek\'s Swamp')).not.toBeNull()
		expect(screen.getByRole('link', { name: 'Open Game' })).toHaveAttribute('href', '/game/12')
	})

	it('shows a ready game as waiting for the host to start it', async () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
			games: [{
				gameId: 12,
				scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
				phase: 'ONION_MOVE',
				turnNumber: 1,
				winner: null,
				status: 'ready',
				hostUserId: 'user-2',
				role: 'onion',
			}]
		}))

		render(<UserDashboard />)

		await screen.findByText('Game 12 · Ready to start')
		expect(screen.queryByRole('link', { name: 'Open Game' })).toBeNull()
		expect(screen.getByText('Ready')).not.toBeNull()
	})

	it.each([
		{ code: 'GAME_NOT_READY', message: 'Game is no longer ready', status: 'waiting' as const },
		{ code: 'GAME_ALREADY_STARTED', message: 'Game has already started', status: 'active' as const },
	])('surfaces a $code start conflict and refreshes the game row', async ({ code, message, status }) => {
		const user = userEvent.setup()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		let listRequestCount = 0
		let resolveRefresh: ((value: Response) => void) | undefined
		const refreshedList = new Promise<Response>((resolve) => {
			resolveRefresh = resolve
		})
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input)
			if (url.endsWith('/config')) {
				return response({ lobbyPollIntervalMs: 3000 })
			}
			if (url.endsWith('/games/12/start')) {
				return response({ ok: false, error: message, code }, 409)
			}
			listRequestCount += 1
			if (listRequestCount === 1) {
				return response({
					games: [{
						gameId: 12,
						scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
						phase: 'ONION_MOVE',
						turnNumber: 1,
						winner: null,
						status: 'ready',
						hostUserId: 'user-1',
						role: 'onion',
					}],
				})
			}
			return refreshedList
		})

		render(<UserDashboard />)
		await user.click(await screen.findByRole('button', { name: 'Start Game' }))

		await screen.findByText(message)
		expect(resolveRefresh).toBeDefined()
		resolveRefresh!(response({
			games: [{
				gameId: 12,
				scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
				phase: 'ONION_MOVE',
				turnNumber: 1,
				winner: null,
				status,
				hostUserId: 'user-1',
				role: 'onion',
			}],
		}))

		await screen.findByText(status === 'active' ? 'Game 12 · Your turn' : 'Game 12 · Waiting for opponent')
		expect(screen.queryByRole('button', { name: 'Start Game' })).toBeNull()
	})

	it('lets the host start a ready game through the start endpoint', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input)
			if (url.endsWith('/config')) {
				return response({ lobbyPollIntervalMs: 3000 })
			}
			if (url.endsWith('/games/12/start')) {
				return response({ gameId: 12, status: 'active', event: { seq: 2, type: 'STARTED' } })
			}
			return response({
				games: [{
					gameId: 12,
					scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
					phase: 'ONION_MOVE',
					turnNumber: 1,
					winner: null,
					status: 'ready',
					hostUserId: 'user-1',
					role: 'onion',
				}]
			})
		})

		render(<UserDashboard navigate={navigate} />)

		await user.click(await screen.findByRole('button', { name: 'Start Game' }))

		expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games/12/start', expect.objectContaining({
			method: 'POST',
			headers: { 'content-type': 'application/json', authorization: 'Bearer token-1' },
			body: '{}',
		}))
		expect(navigate).toHaveBeenCalledWith('/game/12')
	})

	it('opens the started game in a dedicated window', async () => {
		const user = userEvent.setup()
		const gameWindow = { focus: vi.fn() } as unknown as Window
		const windowOpen = vi.spyOn(window, 'open').mockReturnValue(gameWindow)
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
			const url = String(input)
			if (url.endsWith('/config')) {
				return response({ lobbyPollIntervalMs: 3000 })
			}
			if (url.endsWith('/games/12/start')) {
				return response({ gameId: 12, status: 'active' })
			}
			return response({
				games: [{
					gameId: 12,
					scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
					phase: 'ONION_MOVE',
					turnNumber: 1,
					winner: null,
					status: 'ready',
					hostUserId: 'user-1',
					role: 'onion',
				}]
			})
		})

		render(<UserDashboard />)
		await user.click(await screen.findByRole('button', { name: 'Start Game' }))

		expect(windowOpen).toHaveBeenCalledWith('/game/12', '_blank', 'noopener,noreferrer')
		expect(gameWindow.focus).toHaveBeenCalledTimes(1)
	})

	it.each(['active', 'completed'] as const)('opens a %s game in a dedicated window', async (status) => {
		const user = userEvent.setup()
		const gameWindow = { focus: vi.fn() } as unknown as Window
		const windowOpen = vi.spyOn(window, 'open').mockReturnValue(gameWindow)
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
			games: [{
				gameId: 12,
				scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
				phase: 'ONION_MOVE',
				turnNumber: 1,
				winner: null,
				status,
				hostUserId: 'user-1',
				role: 'onion',
			}]
		}))

		render(<UserDashboard />)
		await user.click(await screen.findByRole('link', { name: 'Open Game' }))

		expect(windowOpen).toHaveBeenCalledWith('/game/12', '_blank', 'noopener,noreferrer')
		expect(gameWindow.focus).toHaveBeenCalledTimes(1)
	})

	it('shows waiting status and does not open an incomplete game', async () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({
			games: [{
				gameId: 12,
				scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
				phase: 'ONION_MOVE',
				turnNumber: 1,
				winner: null,
				status: 'waiting',
				role: 'onion',
			}],
		}))

		render(<UserDashboard />)

		await screen.findByText('Game 12 · Waiting for opponent')
		expect(screen.queryByRole('link', { name: 'Open Game' })).toBeNull()
		expect(screen.getByText('Waiting')).not.toBeNull()
	})

	it('shows a fetch error instead of inventing games', async () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('backend unavailable'))

		render(<UserDashboard />)

		await screen.findByText('backend unavailable')
		expect(screen.queryByText(/Game 42/)).toBeNull()
	})

	it('clears the account session and returns to login', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})

		render(<UserDashboard navigate={navigate} />)
		await user.click(screen.getByRole('button', { name: 'Sign Out' }))

		expect(window.sessionStorage.getItem('onion.auth.session')).toBeNull()
		expect(navigate).toHaveBeenCalledWith('/user/login')
	})
})
