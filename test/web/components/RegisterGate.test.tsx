// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RegisterGate } from '#web/components/RegisterGate'
import { saveAuthSession } from '#web/lib/authSession'

const useRegistrationGate = vi.hoisted(() => vi.fn())

vi.mock('#web/lib/useRegistrationGate', () => ({
	useRegistrationGate,
}))

describe('RegisterGate', () => {
	beforeEach(() => {
		useRegistrationGate.mockReset()
		window.sessionStorage.clear()
		window.localStorage.clear()
	})

	it('renders only account fields and submits the registration form', async () => {
		const user = userEvent.setup()
		const handleRegistration = vi.fn((event) => event.preventDefault())
		const setRegistrationDraft = vi.fn()
		const setRegistrationError = vi.fn()

		useRegistrationGate.mockReturnValue({
			registrationDraft: {
				apiBaseUrl: 'http://localhost:3000',
				username: '',
				email: '',
				password: '',
			},
			registrationError: null,
			registeredUsername: null,
			handleRegistration,
			setRegistrationDraft,
			setRegistrationError,
		})

		render(<RegisterGate runtimeConfig={{} as never} />)

		expect(screen.getByRole('heading', { name: /create your player account/i })).not.toBeNull()
		expect(screen.getByLabelText(/username/i)).not.toBeNull()
		expect(screen.getByLabelText(/email/i)).not.toBeNull()
		expect(screen.getByLabelText(/password/i)).not.toBeNull()
		expect(screen.queryByLabelText(/game id/i)).toBeNull()
		expect(screen.queryByLabelText(/api base url/i)).toBeNull()
		expect(screen.queryByRole('link', { name: /create a new account/i })).toBeNull()

		await user.click(screen.getByRole('button', { name: /create account/i }))
		expect(handleRegistration).toHaveBeenCalledTimes(1)
	})

	it('shows a separate completion state with a login link', () => {
		useRegistrationGate.mockReturnValue({
			registrationDraft: {
				apiBaseUrl: 'http://localhost:3000',
				username: 'Swamp Walker',
				email: 'player@example.com',
				password: '',
			},
			registrationError: null,
			registeredUsername: 'Swamp Walker',
			handleRegistration: vi.fn(),
			setRegistrationDraft: vi.fn(),
			setRegistrationError: vi.fn(),
		})

		render(<RegisterGate runtimeConfig={{} as never} />)

		expect(screen.getByRole('heading', { name: /welcome, swamp walker/i })).not.toBeNull()
		expect(screen.getByRole('link', { name: /continue to sign in/i })).toHaveAttribute('href', '/user/login')
		expect(screen.queryByRole('button', { name: /create account/i })).toBeNull()
	})

	it('shows the active player and signs out an authenticated user', async () => {
		const user = userEvent.setup()
		const navigate = vi.fn()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'Swamp Walker',
			userId: 'user-1',
			token: 'token-1',
		})
		useRegistrationGate.mockReturnValue({
			registrationDraft: {
				apiBaseUrl: 'http://localhost:3000',
				username: '',
				email: '',
				password: '',
			},
			registrationError: null,
			registeredUsername: null,
			handleRegistration: vi.fn(),
			setRegistrationDraft: vi.fn(),
			setRegistrationError: vi.fn(),
		})

		render(<RegisterGate navigate={navigate} runtimeConfig={{} as never} />)

		expect(screen.getByRole('heading', { name: /signed in as swamp walker/i })).not.toBeNull()
		expect(screen.getByText('Player ID: user-1')).not.toBeNull()
		await user.click(screen.getByRole('button', { name: 'Sign Out' }))

		expect(window.localStorage.getItem('onion.auth.session')).toBeNull()
		expect(navigate).toHaveBeenCalledWith('/user/login')
	})
})