// @vitest-environment jsdom
import { act, fireEvent, render as renderUi, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from '../../../../web/App'
import { createGameClient, type GameSnapshot } from '../../../../web/lib/gameClient'
import type { GameState } from '../../../../shared/types/index'
import { createMoveGameState } from '../../../../shared/moveFixtures'

type AuthoritativeBattlefieldSnapshot = GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: {
		width: number
		height: number
		cells: Array<{ q: number; r: number }>
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
			cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }],
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
					position: { q: 3, r: 6 },
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
					position: { q: 4, r: 4 },
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
			cells: Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, q) => ({ q, r }))).flat(),
			hexes: [{ q: 1, r: 1, t: 1 }],
		},
		...overrides,
	}
}

function createInRangeCombatSnapshot(): AuthoritativeBattlefieldSnapshot {
	return {
		...createConnectedBattlefieldSnapshot(),
		phase: 'DEFENDER_COMBAT' as const,
		authoritativeState: {
			...createConnectedBattlefieldSnapshot().authoritativeState,
			onion: {
				...createConnectedBattlefieldSnapshot().authoritativeState.onion,
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
				...createConnectedBattlefieldSnapshot().authoritativeState.defenders,
				'wolf-2': {
					...createConnectedBattlefieldSnapshot().authoritativeState.defenders['wolf-2'],
					position: { q: 1, r: 1 },
				},
			},
		},
	}
}

function createGroupedInRangeCombatSnapshot(): AuthoritativeBattlefieldSnapshot {
	const snapshot = createInRangeCombatSnapshot()

	return {
		...snapshot,
		authoritativeState: {
			...snapshot.authoritativeState,
			defenders: {
				...snapshot.authoritativeState.defenders,
				'puss-1': {
					...snapshot.authoritativeState.defenders['puss-1'],
					position: { q: 0, r: 2 },
				},
			},
		},
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

function render(...args: Parameters<typeof renderUi>) {
	const result = renderUi(...args)
	void (async () => {
		try {
			const beginTurnButton = await screen.findByRole('button', { name: /begin turn/i })
			fireEvent.click(beginTurnButton)
		} catch {
			return
		}
	})()
	return result
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
		await userEvent.click(dragonButton)
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
		const session = { role: 'onion' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByTestId('combat-unit-onion-1')
		expect(onionCard.textContent).toContain('Moves 2')
	})

	it('renders backend-provided onion movement remaining at the second band', async () => {
		const snapshot = createSnapshotWithTreads(16, 1)
		const session = { role: 'onion' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByTestId('combat-unit-onion-1')
		expect(onionCard.textContent).toContain('Moves 1')
	})

	it('does not multiply Little Pigs combat attack by stack size', async () => {
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'DEFENDER_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				defenders: {
					...baseSnapshot.authoritativeState.defenders,
					'pigs-1': {
						id: 'pigs-1',
						type: 'LittlePigs',
						position: { q: 4, r: 4 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Rifle',
								attack: 1,
								range: 1,
								defense: 1,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
					'pigs-2': {
						id: 'pigs-2',
						type: 'LittlePigs',
						position: { q: 4, r: 4 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Rifle',
								attack: 1,
								range: 1,
								defense: 1,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
				stackRoster: {
					groupsById: {
						'LittlePigs:4,4': {
							groupName: 'Little Pigs group 1',
							unitType: 'LittlePigs',
							position: { q: 4, r: 4 },
							unitIds: ['pigs-1', 'pigs-2'],
						},
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

		fireEvent.click(await screen.findByTestId('combat-unit-pigs-1'))
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 2')
	})

	it('shows stacked defender targets as a canonical group in onion combat', async () => {
		const user = userEvent.setup()
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'ONION_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				onion: {
					...baseSnapshot.authoritativeState.onion,
					position: { q: 1, r: 2 },
					weapons: [
						{
							id: 'main-1',
							name: 'Main Battery',
							attack: 4,
							range: 2,
							defense: 4,
							status: 'ready' as const,
							individuallyTargetable: true,
						},
					],
				},
				defenders: {
					...baseSnapshot.authoritativeState.defenders,
					'pigs-1': {
						id: 'pigs-1',
						type: 'LittlePigs',
						position: { q: 2, r: 2 },
						status: 'operational' as const,
						squads: 1,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 1,
								range: 1,
								defense: 1,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
					'pigs-2': {
						id: 'pigs-2',
						type: 'LittlePigs',
						position: { q: 2, r: 2 },
						status: 'operational' as const,
						squads: 1,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 1,
								range: 1,
								defense: 1,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
				stackRoster: {
					groupsById: {
						'LittlePigs:2,2': {
							groupName: 'Little Pigs group 1',
							unitType: 'LittlePigs',
							position: { q: 2, r: 2 },
							unitIds: ['pigs-1', 'pigs-2'],
						},
					},
				},
			},
			scenarioMap: {
				...baseSnapshot.scenarioMap,
				hexes: [{ q: 2, r: 2, t: 1 }],
			},
		}
		const session = { role: 'onion' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await user.click(await screen.findByTestId('combat-weapon-main-1'))
		const targetList = await screen.findByTestId('combat-target-list')
		expect(targetList.textContent).toContain('Little Pigs group 1')
		expect(screen.getByTestId('combat-target-pigs-1').getAttribute('data-selected')).toBe('false')
		expect(screen.queryByTestId('combat-target-pigs-2')).toBeNull()
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

		const onionCard = await screen.findByTestId('combat-unit-onion-1')
		expect(onionCard.textContent).toContain('Moves 2')
		await userEvent.click(onionCard)
		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-0-2'))
		})
		await screen.findByTestId('combat-unit-onion-1')
		expect(submitAction).toHaveBeenCalledWith(123, { type: 'MOVE', movers: ['onion-1'], to: { q: 0, r: 2 } })
	})

	it('prompts before a ram-capable Onion move and can skip the ram', async () => {
		const snapshot = createSnapshotWithTreads(45, 3)
		snapshot.phase = 'ONION_MOVE'
		snapshot.scenarioName = 'Ram prompt scenario'
		snapshot.turnNumber = 1
		snapshot.lastEventSeq = 0
		snapshot.authoritativeState.onion.position = { q: 0, r: 0 }
		snapshot.authoritativeState.defenders = {
			'd1': {
				id: 'd1',
				type: 'Puss',
				position: { q: 0, r: 1 },
				status: 'operational',
				weapons: [],
			},
		}
		snapshot.movementRemainingByUnit = { 'onion-1': 3 }

		const submitAction = vi.fn().mockResolvedValue(snapshot)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await userEvent.click(await screen.findByTestId('combat-unit-onion-1'))
		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-0-2'))
		})

		expect(await screen.findByTestId('ram-confirmation-view')).not.toBeNull()
		expect(submitAction).not.toHaveBeenCalled()
		await userEvent.click(screen.getByRole('button', { name: /attempt ram/i }))
		expect(submitAction).toHaveBeenCalledWith(123, { type: 'MOVE', movers: ['onion-1'], to: { q: 0, r: 2 }, attemptRam: true })
	})

	it('renders one ram toast per resolved target', async () => {
		const user = userEvent.setup()
		const snapshot = createSnapshotWithTreads(45, 3)
		snapshot.phase = 'ONION_MOVE'
		snapshot.scenarioName = 'Ram toast scenario'
		snapshot.turnNumber = 1
		snapshot.lastEventSeq = 0
		snapshot.authoritativeState.onion.position = { q: 0, r: 0 }
		snapshot.authoritativeState.defenders = {
			'd1': {
				id: 'd1',
				type: 'Puss',
				position: { q: 0, r: 1 },
				status: 'operational',
				weapons: [],
			},
			'd2': {
				id: 'd2',
				type: 'BigBadWolf',
				position: { q: 1, r: 1 },
				status: 'operational',
				weapons: [],
			},
		}
		snapshot.movementRemainingByUnit = { 'onion-1': 3 }

		const ramSnapshot = {
			...snapshot,
			ramResolution: [
				{
					actionType: 'MOVE' as const,
					unitId: 'onion-1',
					rammedUnitId: 'd1',
					rammedUnitFriendlyName: 'Puss 1',
					destroyedUnitId: 'd1',
					treadDamage: 1,
					details: ['Target: Puss 1', 'Result: destroyed'],
				},
				{
					actionType: 'MOVE' as const,
					unitId: 'onion-1',
					rammedUnitId: 'd2',
					rammedUnitFriendlyName: 'Big Bad Wolf 2',
					destroyedUnitId: '',
					treadDamage: 1,
					details: ['Target: Big Bad Wolf 2', 'Result: survived'],
				},
			],
		}

		const submitAction = vi.fn().mockResolvedValue(ramSnapshot)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await user.click(await screen.findByTestId('combat-unit-onion-1'))
		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-0-1'))
		})
		await user.click(await screen.findByRole('button', { name: /attempt ram/i }))

		expect(await screen.findAllByTestId('ram-resolution-toast')).toHaveLength(2)
		expect(screen.getByText('Ram on Puss 1: destroyed')).not.toBeNull()
		expect(screen.getByText('Ram on Big Bad Wolf 2: survived')).not.toBeNull()
	})

	it('renders ram toast fallback details and dismisses it from the app shell', async () => {
		const user = userEvent.setup()
		const snapshot = createSnapshotWithTreads(45, 3)
		snapshot.phase = 'ONION_MOVE'
		snapshot.scenarioName = 'Ram toast fallback scenario'
		snapshot.turnNumber = 1
		snapshot.lastEventSeq = 0
		snapshot.authoritativeState.onion.position = { q: 0, r: 0 }
		snapshot.authoritativeState.defenders = {
			'd1': {
				id: 'd1',
				type: 'Puss',
				position: { q: 0, r: 1 },
				status: 'operational',
				weapons: [],
			},
		}
		snapshot.movementRemainingByUnit = { 'onion-1': 3 }

		const ramSnapshot = {
			...snapshot,
			ramResolution: [
				{
					actionType: 'MOVE' as const,
					unitId: 'onion-1',
					rammedUnitId: 'd1',
					rammedUnitFriendlyName: 'Puss 1',
					destroyedUnitId: '',
					details: [],
				},
			],
		}

		const submitAction = vi.fn().mockResolvedValue(ramSnapshot)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await user.click(await screen.findByTestId('combat-unit-onion-1'))
		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-0-1'))
		})
		await user.click(await screen.findByRole('button', { name: /attempt ram/i }))

		const toast = await screen.findByTestId('ram-resolution-toast')
		expect(toast.textContent).toContain('Ram on Puss 1: survived')
		expect(toast.textContent).toContain('No additional effects.')
		expect(toast.textContent).toContain('Destroyed')
		expect(within(toast).queryByText(/tread loss/i)).toBeNull()

		await user.click(within(toast).getByRole('button', { name: /dismiss/i }))
		expect(screen.queryByTestId('ram-resolution-toast')).toBeNull()
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
		await user.click(wolfButton)
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
		await user.click(wolfButton)
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))
		await user.click(screen.getByRole('button', { name: /advance phase/i }))

		await screen.findByRole('alert')
		expect(screen.getByRole('alert').classList.contains('error-overlay')).toBe(true)
		expect(screen.getByRole('alert').classList.contains('error-overlay-app')).toBe(true)
		expect(screen.getByRole('alert').closest('.shell')).not.toBeNull()
		expect(screen.getByRole('alert').textContent).toMatch(/Failed to submit action/i)
		expect(screen.getByRole('alert').textContent).toMatch(/mock transport failure/i)
		expect(screen.getByRole('button', { name: /dismiss error/i })).not.toBeNull()

		await user.click(screen.getByRole('button', { name: /dismiss error/i }))
		expect(screen.queryByRole('alert')).toBeNull()
	})

	it('clears combat selection and refreshes state after a rejected combat submit', async () => {
		const user = userEvent.setup()
		const snapshot = createInRangeCombatSnapshot()
		const refreshedSnapshot = {
			...snapshot,
			authoritativeState: {
				...snapshot.authoritativeState,
				onion: {
					...snapshot.authoritativeState.onion,
					treads: 29,
				},
			},
		}
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockRejectedValue(new Error('stale combat state'))

		const client = createGameClient({
			getState: vi.fn()
				.mockResolvedValueOnce({ snapshot, session })
				.mockResolvedValueOnce({ snapshot: refreshedSnapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const attacker = await screen.findByTestId('combat-unit-wolf-2')
		await user.click(attacker)
		const targetList = await screen.findByTestId('combat-target-list')
		await user.click(within(targetList).getAllByRole('button')[0])
		await user.click(screen.getByRole('button', { name: /resolve combat/i }))

		expect(submitAction).toHaveBeenCalledWith(123, { type: 'FIRE', attackers: ['wolf-2'], targetId: 'onion-1' })
		expect(screen.getByRole('alert').textContent).toMatch(/stale combat state/i)
		expect(screen.queryByTestId('combat-resolution-toast')).toBeNull()
		expect(screen.queryByTestId('combat-confirmation-view')).toBeNull()
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 0')
		expect(screen.queryByTestId('combat-target-list')).toBeNull()
		expect(screen.getByText(/No valid targets are currently in range/i)).not.toBeNull()
	})

	it('does not resurrect the previous combat toast when replaying the same attack after clearing selection', async () => {
		const user = userEvent.setup()
		const snapshot = createInRangeCombatSnapshot()
		const resolvedSnapshot = {
			...snapshot,
			combatResolution: {
				actionType: 'FIRE' as const,
				attackers: ['wolf-2'],
				attackerFriendlyNames: ['Big Bad Wolf 2'],
				targetId: 'onion-1',
				targetFriendlyName: 'The Onion 1',
				outcome: 'X' as const,
				outcomeLabel: 'Hit' as const,
				roll: 6,
				odds: '2:1',
				details: ['Squads lost: Little Pigs 1: -1'],
			},
		}
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockResolvedValue(resolvedSnapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByTestId('combat-unit-wolf-2')
		await user.click(screen.getByTestId('combat-unit-wolf-2'))
		await user.click(within(await screen.findByTestId('combat-target-list')).getAllByRole('button')[0])
		await user.click(screen.getByRole('button', { name: /resolve combat/i }))

		const toast = await screen.findByTestId('combat-resolution-toast')
		expect(toast).not.toBeNull()
		expect(toast.textContent).toContain('Little Pigs 1')

		await user.click(screen.getByTestId('hex-cell-0-0'))
		expect(screen.queryByTestId('combat-resolution-toast')).toBeNull()

		await user.click(screen.getByTestId('combat-unit-wolf-2'))
		await user.click(within(await screen.findByTestId('combat-target-list')).getAllByRole('button')[0])

		expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Confirm attack on Treads')
		expect(screen.queryByTestId('combat-resolution-toast')).toBeNull()

		await user.click(screen.getByRole('button', { name: /resolve combat/i }))
		expect(await screen.findByTestId('combat-resolution-toast')).not.toBeNull()
	})

	it('submits a move when the active player right-clicks an in-range hex', async () => {
		const snapshot = createConnectedBattlefieldSnapshot({
			phase: 'DEFENDER_MOVE',
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
		fireEvent.click(wolfButton)
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')

		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-4-6'))
		})

		expect(submitAction).toHaveBeenCalledWith(123, { type: 'MOVE', movers: ['wolf-2'], to: { q: 4, r: 6 } })
	})

	it('keeps rejected move reasons local to the board', async () => {
		const snapshot = createConnectedBattlefieldSnapshot({
			phase: 'DEFENDER_MOVE',
		})
		const session = { role: 'defender' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		fireEvent.click(await screen.findByTestId('combat-unit-wolf-2'))

		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-4-4'))
		})

		expect(submitAction).not.toHaveBeenCalled()
		expect(screen.queryByRole('alert')).toBeNull()
		expect(screen.getByText(/destination hex is occupied/i)).not.toBeNull()
	})

	it('does not submit a move when the player is inactive', async () => {
		const snapshot = createConnectedBattlefieldSnapshot({
			phase: 'DEFENDER_MOVE',
		})
		const session = { role: 'onion' as const }
		const submitAction = vi.fn().mockResolvedValue(snapshot)

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction,
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const moveWolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		fireEvent.click(screen.getByTestId('combat-unit-wolf-2'))
		expect(moveWolfUnit.getAttribute('data-selected')).toBe('true')

		fireEvent.contextMenu(screen.getByTestId('hex-cell-4-6'))

		expect(submitAction).not.toHaveBeenCalled()
	})

	it('renders from the current game snapshot', async () => {
		const snapshot = createConnectedBattlefieldSnapshot()
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
		fireEvent.click(await screen.findByTestId('combat-unit-puss-1'))
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

	it('sorts destroyed defenders to the bottom and marks them as disabled in the roster', async () => {
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				defenders: {
					'no-ready-1': {
						id: 'no-ready-1',
						type: 'Witch',
						position: { q: 2, r: 5 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 3,
								range: 2,
								defense: 2,
								status: 'spent' as const,
								individuallyTargetable: false,
							},
						],
					},
					'active-1': {
						id: 'active-1',
						type: 'BigBadWolf',
						position: { q: 3, r: 5 },
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
					'dead-1': {
						id: 'dead-1',
						type: 'Puss',
						position: { q: 4, r: 5 },
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

		const activeButton = await screen.findByTestId('combat-unit-active-1')
		const noReadyButton = await screen.findByTestId('combat-unit-no-ready-1')
		const deadButton = await screen.findByTestId('combat-unit-dead-1')
		const noReadyCombatButton = noReadyButton as HTMLButtonElement
		const deadCombatButton = deadButton as HTMLButtonElement

		expect(activeButton.compareDocumentPosition(deadButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
		expect(noReadyCombatButton.disabled).toBe(true)
		expect(noReadyButton.getAttribute('class')).toContain('is-disabled')
		expect(noReadyButton.getAttribute('title')).toBe('This unit is not eligible to attack.')
		expect(deadCombatButton.disabled).toBe(true)
		expect(deadButton.getAttribute('class')).toContain('is-disabled')
		expect(deadButton.getAttribute('class')).toContain('tone-destroyed')
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

	it('keeps the onion combat target rail visible when the active player clicks an enemy unit', async () => {
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
					],
				},
				defenders: {
					...baseSnapshot.authoritativeState.defenders,
					'puss-1': {
						...baseSnapshot.authoritativeState.defenders['puss-1'],
						position: { q: 2, r: 1 },
					},
				},
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
		expect(screen.getByRole('heading', { name: /valid targets/i })).not.toBeNull()

		await user.click(screen.getByTestId('hex-unit-puss-1'))

		expect(screen.getByRole('heading', { name: /valid targets/i })).not.toBeNull()
		expect(screen.queryByText(/Inspector/i)).toBeNull()
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
						position: { q: 1, r: 2 },
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
						position: { q: 2, r: 2 },
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
						position: { q: 4, r: 7 },
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
		expect(targetRail.textContent).not.toContain('far-1')
		expect(targetRail.textContent).toContain('Puss')
		expect(targetRail.textContent).toContain('Defense: 3')

		await user.click(screen.getByTestId('combat-target-near-1'))
		expect(screen.getByTestId('combat-target-near-1').getAttribute('data-selected')).toBe('true')
	})

	it('shows the shared combat confirmation view for the selected target', async () => {
		const user = userEvent.setup()
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'ONION_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				onion: {
					...baseSnapshot.authoritativeState.onion,
						position: { q: 1, r: 2 },
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
						type: 'LittlePigs',
						position: { q: 2, r: 2 },
						status: 'operational' as const,
						squads: 1,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 3,
								range: 2,
								defense: 2,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
			},
			scenarioMap: {
				...baseSnapshot.scenarioMap,
					hexes: [{ q: 2, r: 2, t: 1 }],
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
		await user.click(screen.getByTestId('combat-target-near-1'))

		const confirmationView = await screen.findByTestId('combat-confirmation-view')
		expect(confirmationView.textContent).toContain('Attack:Defense ratio')
		expect(confirmationView.textContent).toContain('2:1')
		expect(confirmationView.textContent).toContain('Ridgeline cover: +1 defense')
	})

	it('renders onion weapon targets in defender combat', async () => {
		const user = userEvent.setup()
		const snapshot = createInRangeCombatSnapshot()
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await user.click(await screen.findByTestId('combat-unit-wolf-2'))
		const targetList = await screen.findByTestId('combat-target-list')
		expect(targetList.textContent).toContain('Main Battery')
		expect(targetList.textContent).toContain('Secondary Battery')
		expect(targetList.textContent).toContain('Treads')

		await user.click(screen.getByTestId('combat-target-weapon:main-1'))
		expect(screen.getByTestId('combat-target-weapon:main-1').getAttribute('data-selected')).toBe('true')
	})

	it('shows defender combat readiness on the Onion client by defender attack eligibility', async () => {
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'DEFENDER_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				defenders: {
					...baseSnapshot.authoritativeState.defenders,
					'wolf-2': {
						...baseSnapshot.authoritativeState.defenders['wolf-2'],
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
					'puss-1': {
						...baseSnapshot.authoritativeState.defenders['puss-1'],
						id: 'puss-1',
						position: { q: 4, r: 6 },
						weapons: [
							{
								id: 'spent',
								name: 'Spare Gun',
								attack: 2,
								range: 2,
								defense: 2,
								status: 'spent' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
			},
		}
		const session = { role: 'onion' as const }
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByTestId('combat-unit-wolf-2')
		expect(screen.queryByTestId('combat-target-list')).toBeNull()
		expect(screen.getByTestId('combat-unit-wolf-2').getAttribute('class')).toContain('is-actionable')
		expect(screen.getByTestId('combat-unit-puss-1').getAttribute('class')).toContain('is-disabled')
		expect(screen.getByTestId('hex-unit-wolf-2').querySelector('rect')?.getAttribute('class')).toContain('hex-unit-rect-combat-eligible')
		expect(screen.getByTestId('hex-unit-puss-1').querySelector('rect')?.getAttribute('class')).toContain('hex-unit-rect-combat-ineligible')
		expect(screen.getByTestId('hex-unit-onion-1').querySelector('rect')?.getAttribute('class')).toContain('hex-unit-rect-combat-inspectable')

		fireEvent.click(screen.getByTestId('combat-unit-wolf-2'))
		fireEvent.click(screen.getByTestId('hex-unit-onion-1'))
		const inspectorPanel = document.querySelector('.selection-panel-header')
		expect(inspectorPanel?.textContent).toContain('Inspector')
	})

	it('selects a combat target from the rail on right click', async () => {
		const snapshot = createInRangeCombatSnapshot()
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		fireEvent.click(await screen.findByTestId('combat-unit-wolf-2'))
		const target = await screen.findByTestId('combat-target-weapon:main-1')
		fireEvent.contextMenu(target)

		expect(target.getAttribute('data-selected')).toBe('true')
		const confirmationView = await screen.findByTestId('combat-confirmation-view')
		expect(confirmationView.textContent).toContain('Confirm attack on Main Battery')
	})

	it('blocks treads when multiple defender groups are selected', async () => {
		const snapshot = createGroupedInRangeCombatSnapshot()
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		fireEvent.click(await screen.findByTestId('combat-unit-wolf-2'))
		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })

		const treadsTarget = within(await screen.findByTestId('combat-target-list')).getAllByRole('button')[0]
		const treadsButton = treadsTarget as HTMLButtonElement
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 8')
		expect(treadsButton.disabled).toBe(true)
		expect(treadsTarget.getAttribute('aria-disabled')).toBe('true')
		expect(treadsTarget.getAttribute('title')).toContain('one defender stack')

		fireEvent.contextMenu(treadsTarget)
		expect(treadsTarget.getAttribute('data-selected')).toBe('false')
		expect(screen.queryByTestId('combat-confirmation-view')).toBeNull()
	})

	it('shows the defender inspector for a selected stack during combat', async () => {
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'DEFENDER_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				defenders: {
					...baseSnapshot.authoritativeState.defenders,
					'pigs-1': {
						id: 'pigs-1',
						type: 'LittlePigs',
						position: { q: 4, r: 4 },
						status: 'operational' as const,
						squads: 1,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 1,
								range: 1,
								defense: 2,
								status: 'spent' as const,
								individuallyTargetable: false,
							},
						],
					},
					'pigs-2': {
						id: 'pigs-2',
						type: 'LittlePigs',
						position: { q: 4, r: 4 },
						status: 'operational' as const,
						squads: 1,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 1,
								range: 1,
								defense: 2,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
				},
					stackRoster: {
						groupsById: {
							'LittlePigs:4,4': {
								groupName: 'Little Pigs group 1',
								unitType: 'LittlePigs',
								position: { q: 4, r: 4 },
								unitIds: ['pigs-1', 'pigs-2'],
							},
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
		fireEvent.click(await screen.findByTestId('combat-unit-pigs-1'))

		expect(screen.getByText('Inspector')).not.toBeNull()
		expect(screen.getByText('LittlePigs group 1')).not.toBeNull()
		expect(screen.getByText('Stack').parentElement?.querySelector('dd')?.textContent).toBe('2')
		expect(screen.queryByTestId('combat-stack-member-pigs-1')).toBeNull()
		expect(screen.queryByTestId('combat-stack-member-pigs-2')).toBeNull()
	})

	it('bases defender combat range on ready weapons rather than display summaries', async () => {
		const baseSnapshot = createConnectedBattlefieldSnapshot()
		const snapshot = {
			...baseSnapshot,
			phase: 'DEFENDER_COMBAT' as const,
			authoritativeState: {
				...baseSnapshot.authoritativeState,
				defenders: {
					'long-range-spent': {
						id: 'long-range-spent',
						type: 'Dragon',
						position: { q: 2, r: 4 },
						status: 'operational' as const,
						weapons: [
							{
								id: 'main',
								name: 'Main Gun',
								attack: 4,
								range: 6,
								defense: 3,
								status: 'spent' as const,
								individuallyTargetable: false,
							},
							{
								id: 'secondary',
								name: 'Secondary Gun',
								attack: 2,
								range: 2,
								defense: 2,
								status: 'ready' as const,
								individuallyTargetable: false,
							},
						],
					},
					'near-1': {
						id: 'near-1',
						type: 'Puss',
						position: { q: 4, r: 4 },
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
				},
			},
			onion: {
				...baseSnapshot.authoritativeState.onion,
					position: { q: 5, r: 4 },
			},
		}
		const session = { role: 'defender' as const }

		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		fireEvent.click(await screen.findByTestId('combat-unit-long-range-spent'))
		const selectedUnit = await screen.findByTestId('combat-unit-long-range-spent')
		expect(selectedUnit.getAttribute('data-selected')).toBe('true')
		expect(screen.queryByTestId('combat-target-list')).toBeNull()
		expect(screen.getByText(/No valid targets are currently in range/i)).not.toBeNull()
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
		fireEvent.click(groupedWolfButton)
		expect(groupedWolfButton.getAttribute('data-selected')).toBe('true')
		expect(groupedWolfUnit.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 4')

		const pussButton = screen.getByTestId('combat-unit-puss-1')
		const wolfButton = screen.getByTestId('combat-unit-wolf-2')

		await userEvent.click(pussButton)
		expect(pussButton.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 4')

		fireEvent.click(screen.getByTestId('hex-unit-wolf-2'), { ctrlKey: true })
		expect(wolfButton.getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 8')

		fireEvent.click(screen.getByTestId('hex-unit-puss-1'), { ctrlKey: true })
		expect(pussButton.getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('true')
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 4')

		fireEvent.click(screen.getByTestId('hex-cell-4-7'))
		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('false')
		expect(wolfButton.getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('combat-attack-total').textContent).toBe('Attack 0')
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
