// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RequireAuth } from '#web/components/RequireAuth'
import { saveAuthSession } from '#web/lib/authSession'

describe('RequireAuth', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
		window.history.replaceState({}, '', '/game/create?scenario=swamp-siege-01')
	})

	it('redirects unauthenticated users to login with an internal return path', async () => {
		const navigate = vi.fn()

		render(
			<RequireAuth navigate={navigate}>
				<div>Protected lobby</div>
			</RequireAuth>,
		)

		expect(screen.getByTestId('auth-redirecting')).not.toBeNull()
		await waitFor(() => expect(navigate).toHaveBeenCalledWith(
			'/user/login?returnTo=%2Fgame%2Fcreate%3Fscenario%3Dswamp-siege-01',
		))
		expect(screen.queryByText('Protected lobby')).toBeNull()
	})

	it('renders protected children for an active session', () => {
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		const navigate = vi.fn()

		render(
			<RequireAuth navigate={navigate}>
				<div>Protected lobby</div>
			</RequireAuth>,
		)

		expect(screen.getByText('Protected lobby')).not.toBeNull()
		expect(navigate).not.toHaveBeenCalled()
	})

	it('sends an unknown unauthenticated URL to login with the dashboard return path', async () => {
		window.history.replaceState({}, '', '/hey')
		const navigate = vi.fn()

		render(
			<RequireAuth navigate={navigate} returnTo="/user/dashboard">
				<div>Dashboard</div>
			</RequireAuth>,
		)

		await waitFor(() => expect(navigate).toHaveBeenCalledWith('/user/login?returnTo=%2Fuser%2Fdashboard'))
	})

	it('canonicalizes an unknown authenticated URL to the dashboard', async () => {
		window.history.replaceState({}, '', '/hey')
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
		const navigate = vi.fn()

		render(
			<RequireAuth navigate={navigate} authenticatedRedirectTo="/user/dashboard">
				<div>Dashboard</div>
			</RequireAuth>,
		)

		expect(screen.getByText('Dashboard')).not.toBeNull()
		await waitFor(() => expect(navigate).toHaveBeenCalledWith('/user/dashboard'))
	})
})
