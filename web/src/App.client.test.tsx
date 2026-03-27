// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { createGameClient, type GameSnapshot } from './lib/gameClient'

describe('App with injected game client', () => {
	it('renders from the current game snapshot', async () => {
		const snapshot: GameSnapshot = {
			gameId: 123,
			role: 'defender',
			phase: 'defender',
			selectedUnitId: 'puss-1',
			mode: 'combined',
			scenarioName: "The Siege of Shrek's Swamp",
			turnNumber: 8,
			lastEventSeq: 47,
		}

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue(snapshot),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		expect(await screen.findByText(/123/i)).not.toBeNull()
		expect(screen.getByText(/Selected unit: puss-1/i)).not.toBeNull()
	})

	it('submits actions through the injected client', async () => {
		const user = userEvent.setup()
		const snapshot: GameSnapshot = {
			gameId: 123,
			role: 'defender',
			phase: 'defender',
			selectedUnitId: 'wolf-2',
			mode: 'fire',
			scenarioName: "The Siege of Shrek's Swamp",
			turnNumber: 8,
			lastEventSeq: 47,
		}
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue(snapshot),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByText(/Selected unit: wolf-2/i)

		await user.click(screen.getByRole('button', { name: /end phase/i }))

		expect(submitAction).toHaveBeenCalledWith(123, { type: 'set-mode', mode: 'end-phase' })
	})
})