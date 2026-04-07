// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../../App'
import { createGameClient, type GameSnapshot } from '../../../lib/gameClient'
import { clearApiProtocolTraffic, requestJson } from '../../../../../src/shared/apiProtocol'
import type { GameState } from '../../../../../src/types/index'

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

function createDefenderMoveSnapshotWithStaleAllowance(): LoadedBattlefieldSnapshot {
	const snapshot = createLoadedBattlefieldSnapshot()

	return {
		...snapshot,
		phase: 'DEFENDER_MOVE',
		selectedUnitId: 'wolf-2',
		authoritativeState: {
			...snapshot.authoritativeState,
			movementSpent: {},
		},
		movementRemainingByUnit: {
			'onion-1': 0,
			'wolf-2': 0,
			'puss-1': 3,
		},
	}
}

function createDefenderMoveSnapshotWithZeroMa(): LoadedBattlefieldSnapshot {
	const snapshot = createLoadedBattlefieldSnapshot()

	return {
		...snapshot,
		phase: 'DEFENDER_MOVE',
		selectedUnitId: 'wolf-2',
		authoritativeState: {
			...snapshot.authoritativeState,
			movementSpent: {},
		},
		movementRemainingByUnit: {
			'onion-1': 0,
			'wolf-2': 0,
			'puss-1': 3,
		},
	}
}

function createOnionMoveSnapshot(selectedUnitId: string | null = null, onionMovesRemaining = 4): LoadedBattlefieldSnapshot {
	const snapshot = createLoadedBattlefieldSnapshot()

	return {
		...snapshot,
		phase: 'ONION_MOVE',
		selectedUnitId,
		authoritativeState: {
			...snapshot.authoritativeState,
			movementSpent: {},
		},
		movementRemainingByUnit: {
			'onion-1': onionMovesRemaining,
			'wolf-2': 4,
			'puss-1': 3,
		},
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	clearApiProtocolTraffic()
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

	it('keeps defender movement collapsed when the live snapshot reports zero allowance', async () => {
		const snapshot = createDefenderMoveSnapshotWithStaleAllowance()
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const wolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('class')).not.toContain('hex-unit-stack-move-ready')
		expect(document.querySelectorAll('.hex-cell-reachable').length).toBe(0)
	})

	it('does not show full move range when a defender has zero MA', async () => {
		const snapshot = createDefenderMoveSnapshotWithZeroMa()
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const wolfUnit = await screen.findByTestId('hex-unit-wolf-2')
		expect(wolfUnit.getAttribute('data-selected')).toBe('true')
		expect(wolfUnit.getAttribute('class')).not.toContain('hex-unit-stack-move-ready')
		expect(document.querySelectorAll('.hex-cell-reachable').length).toBe(0)
	})

	it('keeps Onion MOVE focused on Onion and leaves the inspector empty until a unit is selected', async () => {
		const snapshot = createOnionMoveSnapshot(null, 4)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		expect(await screen.findByTestId('combat-unit-onion-1')).not.toBeNull()
		expect(screen.queryByTestId('combat-unit-wolf-2')).toBeNull()
		expect(screen.queryByTestId('combat-unit-puss-1')).toBeNull()
		expect(screen.queryByText(/unit details/i)).toBeNull()
		expect(screen.getByText('Select a unit on the map or in the rail to inspect it here.')).not.toBeNull()
	})

	it('does not reopen Onion movement range after moves are exhausted', async () => {
		const snapshot = createOnionMoveSnapshot('onion-1', 0)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionUnit = await screen.findByTestId('hex-unit-onion-1')
		expect(screen.getByTestId('combat-unit-onion-1').textContent).toContain('Moves 0')
		expect(onionUnit.getAttribute('class')).not.toContain('hex-unit-stack-move-ready')
		expect(document.querySelectorAll('.hex-cell-reachable').length).toBe(0)
	})

	it('loads initial state under StrictMode', async () => {
		const snapshot = createLoadedBattlefieldSnapshot()
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(
			<StrictMode>
				<App gameClient={client} gameId={123} />
			</StrictMode>,
		)

		expect(await screen.findByText(/Selection Contract Test/i)).not.toBeNull()
		expect(screen.getByTestId('hex-unit-wolf-2')).not.toBeNull()
	})

	it('toggles the debug diagnostics popup', async () => {
		const user = userEvent.setup()
		render(<App />)

		expect(screen.queryByText(/Debug Diagnostics/i)).toBeNull()

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))

		expect(screen.queryByText(/Debug Diagnostics/i)).not.toBeNull()
		expect(screen.queryByText(/No protocol traffic yet/i)).not.toBeNull()

		await user.click(screen.getByRole('button', { name: /^×$/ }))

		expect(screen.queryByText(/Debug Diagnostics/i)).toBeNull()
	})

	it('streams live protocol traffic into the debug popup', async () => {
		const user = userEvent.setup()
		render(<App />)

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))

		expect(screen.getByText(/No protocol traffic yet/i)).not.toBeNull()

		await act(async () => {
			await requestJson({
				baseUrl: 'http://example.com',
				path: 'auth/login',
				method: 'POST',
				body: {
					username: 'player-1',
					password: 'secret',
				},
				fetchImpl: vi.fn().mockResolvedValue(
					new Response(JSON.stringify({ userId: 'user-123', token: 'stub.token' }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
				),
			})

			await requestJson({
				baseUrl: 'http://example.com',
				path: 'games/123',
				method: 'GET',
				fetchImpl: vi.fn().mockResolvedValue(
					new Response(JSON.stringify({ ok: true }), {
						status: 200,
						headers: { 'content-type': 'application/json' },
					}),
				),
			})
		})

		const debugEntrySummaries = await screen.findAllByText(
			(_, element) => element?.classList.contains('debug-entry-summary') === true,
		)
		const debugEntryTexts = debugEntrySummaries.map((entry) => entry.textContent ?? '')
		expect(debugEntryTexts.some((text) => /games\/123/i.test(text))).toBe(true)
		expect(screen.getAllByText('request').length).toBeGreaterThan(0)
		expect(screen.getAllByText('response').length).toBeGreaterThan(0)
		expect(screen.getAllByText('(redacted)').length).toBeGreaterThan(0)
		expect(screen.getByText('player-1')).not.toBeNull()
		expect(screen.getByText('username')).not.toBeNull()
	})

	it('preserves debug popup position and size when toggled closed and reopened', async () => {
		const user = userEvent.setup()
		render(<App />)

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))

		const getPopup = () => screen.getByText(/Debug Diagnostics/i).closest('.debug-popup') as HTMLElement
		const initialPopup = getPopup()
		const initialLeft = initialPopup.style.left
		const initialTop = initialPopup.style.top
		const initialWidth = initialPopup.style.width
		const initialHeight = initialPopup.style.height

		const header = screen.getByText(/Debug Diagnostics/i).parentElement as HTMLElement
		fireEvent.mouseDown(header, { clientX: 650, clientY: 100 })
		await waitFor(() => {
			fireEvent.mouseMove(window, { clientX: 720, clientY: 160 })
			expect(getPopup().style.left).not.toBe(initialLeft)
		})
		fireEvent.mouseUp(window)

		const popupAfterDrag = getPopup()
		const resizeHandle = popupAfterDrag.querySelector('.debug-popup-resize') as HTMLElement
		fireEvent.mouseDown(resizeHandle, { clientX: 984, clientY: 490 })
		await waitFor(() => {
			fireEvent.mouseMove(window, { clientX: 1044, clientY: 530 })
			expect(getPopup().style.width).not.toBe(initialWidth)
		})
		fireEvent.mouseUp(window)

		await waitFor(() => {
			expect(getPopup().style.left).not.toBe(initialLeft)
			expect(getPopup().style.top).not.toBe(initialTop)
			expect(getPopup().style.width).not.toBe(initialWidth)
			expect(getPopup().style.height).not.toBe(initialHeight)
		})

		await user.click(screen.getByRole('button', { name: /^×$/ }))
		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))

		const reopenedPopup = getPopup()
		await waitFor(() => {
			expect(reopenedPopup.style.left).toBe(getPopup().style.left)
			expect(reopenedPopup.style.top).toBe(getPopup().style.top)
			expect(reopenedPopup.style.width).toBe(getPopup().style.width)
			expect(reopenedPopup.style.height).toBe(getPopup().style.height)
		})
	})
})
