// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ConnectGate } from '#web/components/ConnectGate'

const useConnectionGate = vi.hoisted(() => vi.fn())

vi.mock('#web/lib/useConnectionGate', () => ({
  useConnectionGate,
}))

describe('ConnectGate', () => {
	beforeEach(() => {
		useConnectionGate.mockReset()
	})

	it('renders the connect form, error overlay, and submits the current draft', async () => {
		const user = userEvent.setup()
		const handleConnect = vi.fn((event) => event.preventDefault())
		const setConnectDraft = vi.fn()
		const setConnectError = vi.fn()
		const submitConnectDraft = vi.fn()

		useConnectionGate.mockReturnValue({
			connectDraft: {
				apiBaseUrl: 'http://localhost:3000',
				username: 'player-1',
				password: 'secret',
				gameId: '123',
			},
			connectError: 'Unable to connect to the backend.',
			handleConnect,
			setConnectDraft,
			setConnectError,
			submitConnectDraft,
		})

		render(<ConnectGate onConnectedSession={vi.fn()} />)

		expect(screen.getByRole('heading', { name: /open a live game session/i })).not.toBeNull()
		expect(screen.getByRole('alert').textContent).toContain('Unable to connect to the backend.')
		expect((screen.getByLabelText(/api base url/i) as HTMLInputElement).value).toBe('http://localhost:3000')
		expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe('player-1')
		expect((screen.getByLabelText(/password/i) as HTMLInputElement).value).toBe('secret')
		expect((screen.getByLabelText(/game id/i) as HTMLInputElement).value).toBe('123')

		await user.click(screen.getByRole('button', { name: /load game/i }))
		expect(handleConnect).toHaveBeenCalledTimes(1)
		expect(setConnectError).not.toHaveBeenCalled()
		expect(submitConnectDraft).not.toHaveBeenCalled()
	})

	it('updates and submits the quick-login drafts', async () => {
		const user = userEvent.setup()
		const handleConnect = vi.fn()
		const setConnectDraft = vi.fn()
		const setConnectError = vi.fn()
		const submitConnectDraft = vi.fn()

		useConnectionGate.mockReturnValue({
			connectDraft: {
				apiBaseUrl: 'http://localhost:3000',
				username: '',
				password: '',
				gameId: '123',
			},
			connectError: null,
			handleConnect,
			setConnectDraft,
			setConnectError,
			submitConnectDraft,
		})

		render(<ConnectGate onConnectedSession={vi.fn()} />)

		await user.click(screen.getByRole('button', { name: /login as test user 1/i }))
		expect(setConnectDraft).toHaveBeenCalledWith({
			apiBaseUrl: 'http://localhost:3000',
			username: 'user1',
			password: 'user1P4ss',
			gameId: '123',
		})
		expect(submitConnectDraft).toHaveBeenCalledWith({
			apiBaseUrl: 'http://localhost:3000',
			username: 'user1',
			password: 'user1P4ss',
			gameId: '123',
		})

		await user.click(screen.getByRole('button', { name: /login as test user 2/i }))
		expect(submitConnectDraft).toHaveBeenCalledWith({
			apiBaseUrl: 'http://localhost:3000',
			username: 'user2',
			password: 'user2P4ss',
			gameId: '123',
		})
	})
})