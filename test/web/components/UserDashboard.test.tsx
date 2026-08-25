// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { UserDashboard } from '#web/components/UserDashboard'
import { saveAuthSession } from '#web/lib/authSession'

describe('UserDashboard', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
	})

	it('shows the current account, reusable menu links, and placeholder games', () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})

		render(<UserDashboard />)

		expect(screen.getByRole('heading', { name: /welcome back, player-1/i })).not.toBeNull()
		expect(screen.getByText('Game 42 · Waiting for opponent')).not.toBeNull()
		expect(screen.queryByRole('link', { name: 'Create New Game' })).toBeNull()
		expect(screen.getByRole('button', { name: 'Sign Out' })).not.toBeNull()
		expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/user/dashboard')
		expect(screen.getByRole('link', { name: 'Create Game' })).toHaveAttribute('href', '/game/create')
		expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute('href', '/user/create')
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
