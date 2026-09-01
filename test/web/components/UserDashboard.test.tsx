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
				status: 'ready',
				role: 'onion',
			}],
		}))

		render(<UserDashboard />)

		await screen.findByText('Game 12 · Your turn')
		expect(screen.getByText('The Siege of Shrek\'s Swamp')).not.toBeNull()
		expect(screen.getByRole('link', { name: 'Open Game' })).toHaveAttribute('href', '/game/12')
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
