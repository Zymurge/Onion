// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { createGameClient, type GameSnapshot } from './lib/gameClient'
import type { GameState } from '../../src/types/index'
import { createMoveGameState } from '../../src/shared/moveFixtures'

type AuthoritativeBattlefieldSnapshot = GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: {
		width: number
		height: number
		hexes: Array<{ q: number; r: number; t: number }>
	}
}

function createDeferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((nextResolve) => {
		resolve = nextResolve
	})
	return { promise, resolve }
}

function createAuthoritativeBattlefieldSnapshot(): AuthoritativeBattlefieldSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		selectedUnitId: 'dragon-7',
		mode: 'fire',
		scenarioName: 'Authoritative swamp state',
		turnNumber: 8,
		lastEventSeq: 47,
		authoritativeState: {
			onion: {
				id: 'onion-live',
				type: 'TheOnion',
				position: { q: 1, r: 1 },
				treads: 27,
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
				'dragon-7': {
					id: 'dragon-7',
					type: 'Dragon',
					position: { q: 0, r: 1 },
					status: 'operational',
					weapons: [
						{
							id: 'cannon-1',
							name: 'Dragon Cannon',
							attack: 6,
							range: 3,
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
				'onion-live': 0,
				'dragon-7': 0,
			},
		scenarioMap: {
			width: 2,
			height: 2,
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
	}
}

function createConnectedBattlefieldSnapshot(
	overrides: Partial<AuthoritativeBattlefieldSnapshot> = {},
): AuthoritativeBattlefieldSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		selectedUnitId: 'wolf-2',
		mode: 'fire',
		scenarioName: "The Siege of Shrek's Swamp",
		turnNumber: 8,
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
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
		...overrides,
	}
}

function createSnapshotWithTreads(treads: number, movementRemaining: number): AuthoritativeBattlefieldSnapshot {
	return {
		...createConnectedBattlefieldSnapshot(),
		phase: 'ONION_MOVE',
		authoritativeState: createMoveGameState(treads),
		movementRemainingByUnit: {
			'onion-1': movementRemaining,
			'wolf-2': 4,
			'puss-1': 3,
		},
	}
}

describe('App orchestration (injected game client)', () => {
	it('renders defender roster and inspector details from authoritative game state instead of mock battlefield data', async () => {
		const snapshot = createAuthoritativeBattlefieldSnapshot()
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		expect(await screen.findByRole('button', { name: /dragon-7/i })).not.toBeNull()
		expect(screen.queryByRole('button', { name: /wolf-2/i })).toBeNull()
		expect(screen.getByText(/Selected unit: dragon-7/i)).not.toBeNull()
		expect(screen.getByText(/Dragon · operational · \(0,1\)/i)).not.toBeNull()
	})

	it('renders hex board bounds from the authoritative scenario map instead of the mock map', async () => {
		const snapshot = createAuthoritativeBattlefieldSnapshot()
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByRole('img', { name: /swamp siege hex map/i })
		expect(screen.getByText('1,1')).not.toBeNull()
		expect(screen.queryByText('2,1')).toBeNull()
		expect(screen.queryByText('14,21')).toBeNull()
	})

	it('renders backend-provided onion movement remaining at the first band', async () => {
		const snapshot = createSnapshotWithTreads(15, 2)
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByRole('button', { name: /onion-1/i })
		expect(onionCard.textContent).toContain('Moves 2')
	})

	it('renders backend-provided onion movement remaining at the second band', async () => {
		const snapshot = createSnapshotWithTreads(16, 1)
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByRole('button', { name: /onion-1/i })
		expect(onionCard.textContent).toContain('Moves 1')
	})

	it('selects a unit locally without submitting an action', async () => {
		const user = userEvent.setup()
		const snapshot = createConnectedBattlefieldSnapshot()
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByText(/Selected unit: wolf-2/i)

		await user.click(screen.getByRole('button', { name: /puss-1/i }))

		await screen.findByText(/Selected unit: puss-1/i)
		expect(submitAction).not.toHaveBeenCalled()
	})

	it('surfaces errors from move submission as a banner', async () => {
		const user = userEvent.setup()
		const snapshot = createConnectedBattlefieldSnapshot()
		const session = { role: 'defender' as const }
		const error = new Error('mock transport failure')
		const submitAction = vi.fn().mockRejectedValue(error)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByText(/Selected unit: wolf-2/i)

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))
		await user.click(screen.getByRole('button', { name: /advance phase/i }))

		await screen.findByRole('alert')
		expect(screen.getByRole('alert').textContent).toMatch(/Failed to submit action/i)
		expect(screen.getByRole('alert').textContent).toMatch(/mock transport failure/i)
	})

	it('submits a move when the active player right-clicks an in-range hex', async () => {
		const snapshot = createConnectedBattlefieldSnapshot({
			phase: 'DEFENDER_MOVE',
			selectedUnitId: 'wolf-2',
		})
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByText(/Selected unit: wolf-2/i)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-7-6'))

		expect(submitAction).toHaveBeenCalledWith(123, { type: 'MOVE', unitId: 'wolf-2', to: { q: 7, r: 6 } })
	})

	it('does not submit a move when the player is inactive', async () => {
		const snapshot = createConnectedBattlefieldSnapshot({
			phase: 'DEFENDER_MOVE',
			selectedUnitId: 'wolf-2',
		})
		const session = { role: 'onion' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByText(/Selected unit: wolf-2/i)

		fireEvent.contextMenu(screen.getByTestId('hex-cell-7-6'))

		expect(submitAction).not.toHaveBeenCalled()
	})

	it('renders from the current game snapshot', async () => {
		const snapshot = createConnectedBattlefieldSnapshot({
			selectedUnitId: 'puss-1',
			mode: 'combined',
		})
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		expect(await screen.findByText(/123/i)).not.toBeNull()
		expect(screen.getByText(/Defender/i, { selector: '.role-badge' })).not.toBeNull()
		expect(screen.getByText((_, element) => element?.classList.contains('role-badge-defender') === true)).not.toBeNull()
		expect(screen.getByText((_, element) => element?.classList.contains('phase-chip-state') === true && element?.textContent === 'Defender Combat')).not.toBeNull()
		expect(
			screen.getByText((_, element) => element?.classList.contains('phase-chip-state') === true && element?.classList.contains('phase-chip-active') === true),
		).not.toBeNull()
		expect(screen.getByText(/Selected unit: puss-1/i)).not.toBeNull()
	})

	it('renders the left-rail combat scaffold instead of the action composer', async () => {
		const snapshot = createConnectedBattlefieldSnapshot()
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByText(/Selected unit: wolf-2/i)
		expect(screen.getByText(/Attack from the left rail/i)).not.toBeNull()
		expect(screen.getByText(/Pick one or more attackers/i)).not.toBeNull()
		expect(screen.queryByText(/Defender command stack/i)).toBeNull()
		expect(screen.queryByRole('button', { name: /end phase/i })).toBeNull()
	})

	it('sends end phase through the debug control', async () => {
		const user = userEvent.setup()
		const snapshot = createConnectedBattlefieldSnapshot()
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockResolvedValue({
			...snapshot,
			phase: 'GEV_SECOND_MOVE',
		})

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))
		await user.click(screen.getByRole('button', { name: /advance phase/i }))
		
		expect(submitAction).toHaveBeenCalledWith(123, { type: 'end-phase' })
		expect(await screen.findByText((_, element) => element?.classList.contains('phase-chip-state') === true && element?.textContent === 'GEV Second Move')).not.toBeNull()
	})

	it('keeps a newer phase after a stale initial load resolves', async () => {
		const user = userEvent.setup()
		const initialSnapshotDeferred = createDeferred<{ snapshot: AuthoritativeBattlefieldSnapshot; session: { role: 'onion' } }>()
		const submitAction = vi.fn().mockResolvedValue(
			createConnectedBattlefieldSnapshot({
				phase: 'ONION_COMBAT',
				turnNumber: 2,
				lastEventSeq: 13,
			}),
		)

		const client = createGameClient({
			getState: vi.fn().mockReturnValue(initialSnapshotDeferred.promise),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))
		await user.click(screen.getByRole('button', { name: /advance phase/i }))

		initialSnapshotDeferred.resolve({
			snapshot: createConnectedBattlefieldSnapshot({
				phase: 'ONION_MOVE',
				turnNumber: 2,
				lastEventSeq: 12,
			}),
			session: { role: 'onion' },
		})

		expect(submitAction).toHaveBeenCalledWith(123, { type: 'end-phase' })
		expect(await screen.findByText((_, element) => element?.classList.contains('phase-chip-state') === true && element?.textContent === 'Onion Combat')).not.toBeNull()
	})
})