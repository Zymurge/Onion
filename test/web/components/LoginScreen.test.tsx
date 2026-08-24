// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LoginScreen } from '#web/components/LoginScreen'
import { getAuthSession } from '#web/lib/authSession'

function response(body: unknown, status = 200): Response {
	return {
		ok: status >= 200 && status < 300,
		status,
		text: async () => JSON.stringify(body),
	} as Response
}

describe('LoginScreen', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
		window.history.replaceState({}, '', '/')
		vi.restoreAllMocks()
	})

	it('stores the authenticated session and returns to the requested route', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		window.history.replaceState({}, '', '/user/login?returnTo=%2Fgame%2Fcreate%3Fscenario%3Dswamp-siege-01')
		const fetchMock = vi.fn().mockResolvedValue(response({ userId: 'user-1', token: 'token-1' }))
		vi.stubGlobal('fetch', fetchMock)

		render(<LoginScreen navigate={navigate} runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)
		await user.type(screen.getByLabelText(/username/i), 'player-1')
		await user.type(screen.getByLabelText(/password/i), 'secret')
		await user.click(screen.getByRole('button', { name: /sign in/i }))

		await waitFor(() => expect(navigate).toHaveBeenCalledWith('/game/create?scenario=swamp-siege-01'))
		expect(fetchMock).toHaveBeenCalledWith(
			'http://localhost:3000/auth/login',
			expect.objectContaining({
				method: 'POST',
				body: JSON.stringify({ username: 'player-1', password: 'secret' }),
			}),
		)
		expect(getAuthSession()).toEqual({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		})
	})

	it('rejects an external return path and uses the lobby default', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		window.history.replaceState({}, '', '/user/login?returnTo=https%3A%2F%2Fevil.example')
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ userId: 'user-1', token: 'token-1' })))

		render(<LoginScreen navigate={navigate} runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)
		await user.type(screen.getByLabelText(/username/i), 'player-1')
		await user.type(screen.getByLabelText(/password/i), 'secret')
		await user.click(screen.getByRole('button', { name: /sign in/i }))

		await waitFor(() => expect(navigate).toHaveBeenCalledWith('/game/create'))
	})

	it('shows the server error without storing a session', async () => {
		const user = userEvent.setup()
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ error: 'Invalid credentials' }, 401)))

		render(<LoginScreen runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)
		await user.type(screen.getByLabelText(/username/i), 'player-1')
		await user.type(screen.getByLabelText(/password/i), 'wrong')
		await user.click(screen.getByRole('button', { name: /sign in/i }))

		expect((await screen.findByRole('alert')).textContent).toContain('Invalid credentials')
		expect(getAuthSession()).toBeNull()
	})

	it('returns an already-authenticated user to the requested route', async () => {
		const navigate = vi.fn()
		window.history.replaceState({}, '', '/user/login?returnTo=%2Fgame%2F42')
		const session = {
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'token-1',
		}
		window.sessionStorage.setItem('onion.auth.session', JSON.stringify(session))

		render(<LoginScreen navigate={navigate} runtimeConfig={{ apiBaseUrl: 'http://localhost:3000' } as never} />)

		await waitFor(() => expect(navigate).toHaveBeenCalledWith('/game/42'))
		expect(screen.getByTestId('auth-redirecting')).not.toBeNull()
	})
})
