// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

const createHttpGameClient = vi.hoisted(() => vi.fn())

vi.mock('./lib/httpGameClient', () => ({
	createHttpGameClient,
}))

describe('App connection gate', () => {
	it('renders a connect form when runtime config is seeded but no client is ready', async () => {
		render(<App runtimeConfig={{ apiBaseUrl: 'http://localhost:3000', gameId: 'game-123' }} showConnectionGate />)

		expect(screen.getByRole('heading', { name: /open a live game session/i })).not.toBeNull()
		expect((screen.getByLabelText(/api base url/i) as HTMLInputElement).value).toBe('http://localhost:3000')
		expect((screen.getByLabelText(/game id/i) as HTMLInputElement).value).toBe('game-123')
	})

	it('creates a backend client when the connect form is submitted', async () => {
		const user = userEvent.setup()
		const submitAction = vi.fn().mockResolvedValue({
			gameId: 'game-123',
			phase: 'defender',
			selectedUnitId: 'wolf-2',
			mode: 'fire',
			lastEventSeq: 47,
		})

		createHttpGameClient.mockReturnValue({
			getState: vi.fn().mockResolvedValue({
				gameId: 'game-123',
				phase: 'defender',
				selectedUnitId: 'wolf-2',
				mode: 'fire',
				lastEventSeq: 47,
			}),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App runtimeConfig={{ apiBaseUrl: 'http://localhost:3000', gameId: 'game-123' }} showConnectionGate />)

		await user.type(screen.getByLabelText(/bearer token/i), 'stub.token')
		await user.click(screen.getByRole('button', { name: /connect/i }))

		expect(createHttpGameClient).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token: 'stub.token',
		})
		await screen.findByText(/Selected unit: wolf-2/i)
	})
})