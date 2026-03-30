// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import { createGameClient, type GameSnapshot } from './lib/gameClient'
import type { GameState } from '../../src/types/index'

type LoadedBattlefieldSnapshot = GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: {
		width: number
		height: number
		hexes: Array<{ q: number; r: number; t: number }>
	}
}

function createLoadedBattlefieldSnapshot(): LoadedBattlefieldSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		selectedUnitId: 'wolf-2',
		mode: 'fire',
		scenarioName: 'Selection Contract Test',
		turnNumber: 11,
		lastEventSeq: 47,
		authoritativeState: {
			onion: {
				id: 'onion-1',
				type: 'TheOnion',
				position: { q: 0, r: 1 },
				treads: 33,
				status: 'operational',
				weapons: [
					{
						id: 'main-1',
						name: 'Main Battery',
						attack: 4,
						range: 4,
						defense: 4,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
				batteries: {
					main: 1,
					secondary: 0,
					ap: 0,
				},
			},
			defenders: {
				'wolf-2': {
					id: 'wolf-2',
					type: 'BigBadWolf',
					position: { q: 6, r: 6 },
					status: 'operational',
					weapons: [
						{
							id: 'main',
							name: 'Main Gun',
							attack: 4,
							range: 2,
							defense: 2,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
				'puss-1': {
					id: 'puss-1',
					type: 'Puss',
					position: { q: 6, r: 4 },
					status: 'operational',
					weapons: [
						{
							id: 'main',
							name: 'Main Gun',
							attack: 4,
							range: 2,
							defense: 3,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
			},
			ramsThisTurn: 0,
		},
		movementRemainingByUnit: {
			'onion-1': 0,
			'wolf-2': 4,
			'puss-1': 3,
		},
		scenarioMap: {
			width: 8,
			height: 8,
			hexes: [],
		},
	}
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe('App UI', () => {
	it('renders a waiting state instead of mock battlefield data before game state loads', () => {
		render(<App />)

		expect(screen.queryByRole('img', { name: /swamp siege hex map/i })).toBeNull()
		expect(screen.queryByText(/defender command stack/i)).toBeNull()
		expect(screen.queryByRole('button', { name: /refresh/i })).not.toBeNull()
		expect(screen.queryByText(/^Waiting$/i, { selector: '.role-badge' })).not.toBeNull()
		expect(
			screen.getByText((_, element) => element?.classList.contains('phase-chip-state') === true && element.textContent === 'WAITING'),
		).not.toBeNull()
		expect(screen.queryByText(/Turn waiting/i)).not.toBeNull()
		expect(screen.queryByText(/waiting for game state/i)).not.toBeNull()
		expect(screen.queryByRole('button', { name: /puss-1/i })).toBeNull()
		expect(screen.queryByText(/battlefield will appear once the game state loads/i)).not.toBeNull()
		expect(screen.queryByTestId('hex-unit-wolf-2')).toBeNull()
	})

	it('keeps selection state on the rail and map in sync when loaded', async () => {
		const user = userEvent.setup()
		const snapshot = createLoadedBattlefieldSnapshot()
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const wolfButton = await screen.findByTestId('combat-unit-wolf-2')
		const wolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')

		const pussButton = screen.getByTestId('combat-unit-puss-1')
		await user.click(pussButton)
		expect(pussButton.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')
		expect(wolfButton.getAttribute('data-selected')).toBe('false')
		expect(wolfUnit.getAttribute('data-selected')).toBe('false')

		await user.click(screen.getByTestId('hex-cell-0-0'))
		expect(pussButton.getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
	})

	it('toggles the debug diagnostics popup', async () => {
		const user = userEvent.setup()
		render(<App />)

		expect(screen.queryByText(/Debug Diagnostics/i)).toBeNull()

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))

		expect(screen.queryByText(/Debug Diagnostics/i)).not.toBeNull()
		expect(screen.queryByText(/Game state loaded/i)).not.toBeNull()

		await user.click(screen.getByRole('button', { name: /^×$/ }))

		expect(screen.queryByText(/Debug Diagnostics/i)).toBeNull()
	})
})
