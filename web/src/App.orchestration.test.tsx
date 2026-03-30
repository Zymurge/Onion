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

		const dragonButton = await screen.findByTestId('combat-unit-dragon-7')
		const dragonUnit = await screen.findByTestId('hex-unit-dragon-7')
		expect(dragonButton.getAttribute('data-selected')).toBe('true')
		expect(dragonUnit.getAttribute('data-selected')).toBe('true')
		expect(screen.queryByTestId('combat-unit-wolf-2')).toBeNull()
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

	it('falls back to onion tread allowance when remaining movement is not provided', async () => {
		const snapshot = {
			...createConnectedBattlefieldSnapshot(),
			phase: 'ONION_MOVE' as const,
			authoritativeState: createMoveGameState(16),
			movementRemainingByUnit: undefined,
		}
		const session = { role: 'onion' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByRole('button', { name: /onion-1/i })
		expect(onionCard.textContent).toContain('Moves 2')
		await userEvent.click(onionCard)
		fireEvent.contextMenu(screen.getByTestId('hex-cell-1-2'))
		expect(submitAction).toHaveBeenCalledWith(123, { type: 'MOVE', unitId: 'onion-1', to: { q: 1, r: 2 } })
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

		const wolfButton = await screen.findByTestId('combat-unit-wolf-2')
		const wolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')

		await user.click(screen.getByTestId('combat-unit-puss-1'))

		const snapshotPussButton = await screen.findByTestId('combat-unit-puss-1')
		const snapshotPussUnit = await screen.findByTestId('hex-unit-puss-1')
		expect(snapshotPussButton.getAttribute('data-selected')).toBe('true')
		expect(snapshotPussUnit.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('combat-unit-wolf-2').getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('false')
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

		const wolfButton = await screen.findByTestId('combat-unit-wolf-2')
		const wolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')

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

		const wolfButton = await screen.findByTestId('combat-unit-wolf-2')
		const wolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')

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

		const moveWolfButton = await screen.findByTestId('combat-unit-wolf-2')
		const moveWolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(moveWolfButton.getAttribute('data-selected')).toBe('true')
		expect(moveWolfUnit.getAttribute('data-selected')).toBe('true')

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
		expect(screen.getByTestId('combat-unit-puss-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')
	})

	it('renders attacker selection weapons during onion combat', async () => {
		const user = userEvent.setup()
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'ONION_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				onion: {
					...baseSnapshot.authoritativeState.onion,
					weapons: [
						{
							id: 'main-1',
							name: 'Main Battery',
							attack: 4,
							range: 4,
							defense: 4,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
						{
							id: 'secondary-1',
							name: 'Secondary Battery',
							attack: 3,
							range: 2,
							defense: 3,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
					],
				},
			},
		}
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByTestId('combat-weapon-main-1')
		await screen.findByTestId('combat-weapon-secondary-1')
		expect(screen.getByText(/Attacker Selection/i)).not.toBeNull()
		expect(screen.getByTestId('combat-weapon-main-1')).not.toBeNull()
		expect(screen.getByTestId('combat-weapon-secondary-1')).not.toBeNull()
		expect(screen.queryByText(/Defender command stack/i)).toBeNull()

		await user.click(screen.getByTestId('combat-weapon-main-1'))
		expect(screen.getByTestId('hex-unit-onion-1').getAttribute('data-selected')).toBe('true')
	})

	it('sorts destroyed defenders to the bottom and disables them in the roster', async () => {
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				defenders: {
					'dead-1': {
						id: 'dead-1',
						type: 'Puss',
						position: { q: 6, r: 5 },
						status: 'destroyed' as const,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 4,
								range: 2,
								defense: 3,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
					'alive-1': {
						id: 'alive-1',
						type: 'BigBadWolf',
						position: { q: 5, r: 5 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 4,
								range: 2,
								defense: 2,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
			},
			selectedUnitId: 'alive-1',
		}
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const aliveButton = await screen.findByTestId('combat-unit-alive-1')
		const deadButton = await screen.findByTestId('combat-unit-dead-1')

		expect(aliveButton.compareDocumentPosition(deadButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
		expect((deadButton as HTMLButtonElement).disabled).toBe(true)
		expect(deadButton.getAttribute('class')).toContain('tone-destroyed')

		await userEvent.click(screen.getByTestId('combat-unit-dead-1'))
		expect(screen.getByTestId('combat-unit-alive-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-alive-1').getAttribute('data-selected')).toBe('true')
	})

	it('renders a shared combat range overlay for selected onion weapons', async () => {
		const user = userEvent.setup()
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'ONION_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				onion: {
					...baseSnapshot.authoritativeState.onion,
					position: { q: 1, r: 1 },
					weapons: [
						{
							id: 'main-1',
							name: 'Main Battery',
							attack: 4,
							range: 4,
							defense: 4,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
						{
							id: 'secondary-1',
							name: 'Secondary Battery',
							attack: 3,
							range: 2,
							defense: 3,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
					],
				},
				defenders: baseSnapshot.authoritativeState.defenders,
			},
		}
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByTestId('combat-weapon-main-1')
		await screen.findByTestId('combat-weapon-secondary-1')

		await user.click(screen.getByTestId('combat-weapon-main-1'))
		fireEvent.click(screen.getByTestId('combat-weapon-secondary-1'), { ctrlKey: true })

		expect(screen.getByTestId('hex-cell-3-1').getAttribute('class')).toContain('hex-cell-combat-range')
		expect(screen.getByTestId('hex-cell-4-1').getAttribute('class')).not.toContain('hex-cell-combat-range')
	})

	it('renders a right-rail target list filtered to the active combat range', async () => {
		const user = userEvent.setup()
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'ONION_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				onion: {
					...baseSnapshot.authoritativeState.onion,
					position: { q: 2, r: 2 },
					weapons: [
						{
							id: 'main-1',
							name: 'Main Battery',
							attack: 4,
							range: 1,
							defense: 4,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
					],
				},
				defenders: {
					'near-1': {
						id: 'near-1',
						type: 'Puss',
						position: { q: 3, r: 2 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 4,
								range: 2,
								defense: 3,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
					'far-1': {
						id: 'far-1',
						type: 'BigBadWolf',
						position: { q: 7, r: 7 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 4,
								range: 2,
								defense: 2,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
			},
			movementRemainingByUnit: {
				...baseSnapshot.movementRemainingByUnit,
			},
		}
		const session = { role: 'onion' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByTestId('combat-weapon-main-1')
		await user.click(screen.getByTestId('combat-weapon-main-1'))

		const targetRail = screen.getByTestId('combat-target-list')
		expect(targetRail.textContent).toContain('near-1')
		expect(targetRail.textContent).not.toContain('far-1')

		await user.click(screen.getByTestId('combat-target-near-1'))
		expect(screen.getByTestId('combat-target-near-1').getAttribute('data-selected')).toBe('true')
	})

	it('renders onion weapon targets in defender combat', async () => {
		const user = userEvent.setup()
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'DEFENDER_COMBAT' as const,
			selectedUnitId: 'wolf-2',
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				onion: {
					...baseSnapshot.authoritativeState.onion,
					weapons: [
						{
							id: 'main-1',
							name: 'Main Battery',
							attack: 4,
							range: 4,
							defense: 4,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
						{
							id: 'secondary-1',
							name: 'Secondary Battery',
							attack: 3,
							range: 2,
							defense: 3,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
					],
				},
				defenders: {
					...baseSnapshot.authoritativeState.defenders,
					'wolf-2': {
						...baseSnapshot.authoritativeState.defenders['wolf-2'],
						position: { q: 1, r: 1 },
					},
				},
			},
		}
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const targetList = await screen.findByTestId('combat-target-list')
		expect(targetList.textContent).toContain('Main Battery')
		expect(targetList.textContent).toContain('Secondary Battery')
		expect(targetList.textContent).toContain('Treads')

		await user.click(screen.getByTestId('combat-target-weapon:main-1'))
		expect(screen.getByTestId('combat-target-weapon:main-1').getAttribute('data-selected')).toBe('true')
	})

	it('supports grouped selection from the rail and map, ctrl-removal, and empty-space deselection', async () => {
		const snapshot = createConnectedBattlefieldSnapshot()
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const groupedWolfButton = await screen.findByTestId('combat-unit-wolf-2')
		const groupedWolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(groupedWolfButton.getAttribute('data-selected')).toBe('true')
		expect(groupedWolfUnit.getAttribute('data-selected')).toBe('true')

		const pussButton = screen.getByTestId('combat-unit-puss-1')
		const wolfButton = screen.getByTestId('combat-unit-wolf-2')

		await userEvent.click(pussButton)
		expect(pussButton.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')

		fireEvent.click(screen.getByTestId('hex-unit-wolf-2'), { ctrlKey: true })
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })
		expect(pussButton.getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('true')

		fireEvent.click(screen.getByTestId('hex-cell-7-7'))
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('false')
		expect(wolfButton.getAttribute('data-selected')).toBe('false')
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