// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../../../web/App'
import { buildAcknowledgementTurnKey } from '../../../../web/lib/turnKey'
import { createGameClient, type GameSnapshot } from '../../../../web/lib/gameClient'
import { clearApiProtocolTraffic, requestJson } from '../../../../shared/apiProtocol'
import type { GameState } from '../../../../shared/types/index'
import type { LiveEventSource, LiveSessionSignal } from '../../../../web/lib/gameSessionTypes'

type LoadedBattlefieldSnapshot = GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: {
		width: number
		height: number
		cells: Array<{ q: number; r: number }>
		hexes: Array<{ q: number; r: number; t: number }>
	}
}

function createLoadedBattlefieldSnapshot(): LoadedBattlefieldSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
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
			hexes: [],
		},
	}
}

function createDefenderMoveSnapshotWithStaleAllowance(): LoadedBattlefieldSnapshot {
	const snapshot = createLoadedBattlefieldSnapshot()

	return {
		...snapshot,
		phase: 'DEFENDER_MOVE',
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

function createOnionMoveSnapshot(onionMovesRemaining = 4): LoadedBattlefieldSnapshot {
	const snapshot = createLoadedBattlefieldSnapshot()

	return {
		...snapshot,
		phase: 'ONION_MOVE',
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

function createLiveEventSourceStub() {
	const listeners = new Set<(signal: LiveSessionSignal) => void>()
	let connectionStatus: 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' = 'idle'

	return {
		subscribe(listener: (signal: LiveSessionSignal) => void) {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		connect(gameId: number) {
			connectionStatus = 'connected'
			for (const listener of listeners) {
				listener({ kind: 'connection', gameId, status: 'connected' })
			}
		},
		disconnect(gameId: number) {
			connectionStatus = 'disconnected'
			for (const listener of listeners) {
				listener({ kind: 'connection', gameId, status: 'disconnected' })
			}
		},
		getConnectionState() {
			return connectionStatus
		},
		emit(signal: LiveSessionSignal) {
			for (const listener of listeners) {
				listener(signal)
			}
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
		expect(wolfButton.getAttribute('data-selected')).toBe('false')
		expect(wolfUnit.getAttribute('data-selected')).toBe('false')

		const pussButton = screen.getByTestId('combat-unit-puss-1')
		await user.click(pussButton)
		expect(pussButton.getAttribute('data-selected')).toBe('false')
		expect(screen.getByTestId('hex-unit-puss-1').getAttribute('data-selected')).toBe('false')
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
		expect(wolfUnit.getAttribute('data-selected')).toBe('false')
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
		expect(wolfUnit.getAttribute('data-selected')).toBe('false')
		expect(wolfUnit.getAttribute('class')).not.toContain('hex-unit-stack-move-ready')
		expect(document.querySelectorAll('.hex-cell-reachable').length).toBe(0)
	})

	it('keeps Onion MOVE focused on Onion and leaves the inspector empty until a unit is selected', async () => {
		const snapshot = createOnionMoveSnapshot(4)
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
		const snapshot = createOnionMoveSnapshot(0)
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

	it('shows remaining ram capacity in the Onion rail', async () => {
		const snapshot = {
			...createOnionMoveSnapshot(4),
			authoritativeState: {
				...createOnionMoveSnapshot(4).authoritativeState,
				ramsThisTurn: 1,
			},
		}
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByTestId('combat-unit-onion-1')
		expect(onionCard.textContent).toContain('Rams remaining 1')
		expect(onionCard.textContent).toContain('Rams remaining')
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
		const jsonPrintText = screen
			.getAllByTestId('react-json-print-mock')
			.map((entry) => entry.textContent ?? '')
			.join('\n')
		expect(debugEntryTexts.some((text) => /games\/123/i.test(text))).toBe(true)
		expect(jsonPrintText).toContain('request')
		expect(jsonPrintText).toContain('response')
		expect(jsonPrintText).toContain('(redacted)')
		expect(jsonPrintText).toContain('player-1')
		expect(jsonPrintText).toContain('username')
		expect(screen.getAllByTestId('react-json-print-mock').every((entry) => entry.getAttribute('data-depth') === '0')).toBe(true)
	})

	it('shows a ram resolution toast after a successful MOVE with ramming', async () => {
		const user = userEvent.setup()
		const snapshot = createOnionMoveSnapshot(4)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue({
				...snapshot,
				authoritativeState: {
					...snapshot.authoritativeState,
					defenders: {
						...snapshot.authoritativeState.defenders,
						'puss-1': {
							...snapshot.authoritativeState.defenders['puss-1'],
							status: 'operational',
						},
					},
				},
				ramResolution: {
					actionType: 'MOVE',
					unitId: 'onion-1',
					rammedUnitIds: ['puss-1'],
					destroyedUnitIds: [],
					treadDamage: 1,
					details: ['Rammed units: puss-1', 'Treads lost: 1 (remaining 32)'],
				},
			}),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		await screen.findByTestId('hex-unit-onion-1')
		await user.click(screen.getByTestId('hex-unit-onion-1'))
		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-0-2'))
		})

		expect(screen.queryByTestId('ram-resolution-toast')).toBeNull()
	})

	it('shows a dismissible inactive-event stream for remote combat events', async () => {
		const user = userEvent.setup()
		const snapshot = createOnionMoveSnapshot(4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockImplementation(async (_gameId: number, afterSeq: number) => {
			if (afterSeq === 0) {
				return [
					{
						seq: 48,
						type: 'FIRE_RESOLVED',
						summary: 'Wolf-2 fired at the Onion and missed.',
						timestamp: '2026-04-15T12:00:00.000Z',
					},
				]
			}

			return [
				{
					seq: 49,
					type: 'MOVE_RESOLVED',
					summary: 'Puss-1 rammed the Onion and retreated.',
					timestamp: '2026-04-15T12:01:00.000Z',
				},
			]
		})
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		await screen.findByRole('button', { name: /toggle debug diagnostics/i })
		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByText(/Wolf-2 fired at the Onion and missed\./i)).not.toBeNull()
		expect(pollEvents).toHaveBeenCalledWith(123, 0)
		expect(screen.getByTestId('inactive-event-stream').closest('.rail-right')).not.toBeNull()

		act(() => {
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 48, eventType: 'FIRE_RESOLVED' })
		})

		await user.click(screen.getByRole('button', { name: /dismiss inactive event stream/i }))
		expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()

		act(() => {
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 49, eventType: 'MOVE_RESOLVED' })
		})

		expect(await screen.findByText(/Puss-1 rammed the Onion and retreated\./i)).not.toBeNull()
		expect(screen.getByText(/Wolf-2 fired at the Onion and missed\./i)).not.toBeNull()
	})

	it('loads historical inactive events on initial defender login', async () => {
		const snapshot = createOnionMoveSnapshot(4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 48,
				type: 'FIRE_RESOLVED',
				summary: 'Wolf-2 fired at the Onion and missed.',
				timestamp: '2026-04-15T12:00:00.000Z',
			},
		])
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByText(/Wolf-2 fired at the Onion and missed\./i)).not.toBeNull()
		expect(pollEvents).toHaveBeenCalledWith(123, 0)
	})

	it('shows Begin Turn for the active player until the turn is acknowledged', async () => {
		const user = userEvent.setup()
		const snapshot = createOnionMoveSnapshot(4)
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const beginTurnButton = await screen.findByRole('button', { name: /begin turn/i })
		expect(beginTurnButton).not.toBeNull()

		await user.click(beginTurnButton)
		expect(screen.queryByRole('button', { name: /begin turn/i })).toBeNull()
	})

	it('builds the Begin Turn acknowledgement key without phase data', () => {
		expect(
			buildAcknowledgementTurnKey({
				activeGameId: 123,
				currentTurnNumber: 11,
				sessionRole: 'onion',
				sessionTurnActive: true,
			}),
		).toBe('123:11:onion')
		expect(
			buildAcknowledgementTurnKey({
				activeGameId: 123,
				currentTurnNumber: 11,
				sessionRole: 'defender',
				sessionTurnActive: false,
			}),
		).toBeNull()
	})

	it('keeps dismissed inactive events hidden when later polls include older seqs again', async () => {
		const user = userEvent.setup()
		const snapshot = createOnionMoveSnapshot(4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockImplementation(async (_gameId: number, afterSeq: number) => {
			if (afterSeq === 0) {
				return [
					{
						seq: 48,
						type: 'FIRE_RESOLVED',
						summary: 'Wolf-2 fired at the Onion and missed.',
						timestamp: '2026-04-15T12:00:00.000Z',
					},
				]
			}

			return [
				{
					seq: 48,
					type: 'FIRE_RESOLVED',
					summary: 'Wolf-2 fired at the Onion and missed.',
					timestamp: '2026-04-15T12:00:00.000Z',
				},
				{
					seq: 49,
					type: 'MOVE_RESOLVED',
					summary: 'Puss-1 rammed the Onion and retreated.',
					timestamp: '2026-04-15T12:01:00.000Z',
				},
			]
		})
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByText(/Wolf-2 fired at the Onion and missed\./i)).not.toBeNull()

		await user.click(screen.getByRole('button', { name: /dismiss inactive event stream/i }))
		expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()

		act(() => {
			liveEventSource.emit({ kind: 'event', gameId: 123, eventSeq: 49, eventType: 'MOVE_RESOLVED' })
		})

		expect(await screen.findByText(/Puss-1 rammed the Onion and retreated\./i)).not.toBeNull()
		expect(screen.getByText(/Wolf-2 fired at the Onion and missed\./i)).not.toBeNull()
		expect(pollEvents).toHaveBeenCalledWith(123, 0)
		expect(pollEvents).toHaveBeenCalledWith(123, 48)
	})

	it('surfaces a non-blocking error when inactive-event polling fails', async () => {
		const snapshot = createOnionMoveSnapshot(4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockRejectedValue(new Error('network down'))
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByRole('alert')).not.toBeNull()
		expect(screen.getByText(/unable to refresh inactive events/i)).not.toBeNull()
		expect(pollEvents).toHaveBeenCalledWith(123, 0)
	})

	it('hides the inactive-event stream after the session becomes active again', async () => {
		const user = userEvent.setup()
		const inactiveSnapshot = createOnionMoveSnapshot(4)
		const activeSnapshot = createDefenderMoveSnapshotWithZeroMa()
		const liveEventSource = createLiveEventSourceStub()
		const getState = vi
			.fn()
			.mockResolvedValueOnce({ snapshot: inactiveSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValue({ snapshot: activeSnapshot, session: { role: 'defender' as const } })
		const client = createGameClient({
			getState,
			submitAction: vi.fn().mockResolvedValue(activeSnapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByText(/Waiting for remote actions\./i)).not.toBeNull()

		await user.click(screen.getByRole('button', { name: /refresh/i }))

		await waitFor(() => {
			expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()
		})
		expect(getState).toHaveBeenCalledWith(123)
	})

	it('renders structured inactive-event summaries when summary text is absent', async () => {
		const snapshot = createOnionMoveSnapshot(4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 52,
				type: 'PHASE_CHANGED',
				timestamp: '2026-04-15T12:02:00.000Z',
				from: 'ONION_MOVE',
				to: 'DEFENDER_COMBAT',
			},
			{
				seq: 53,
				type: 'SESSION_CONNECTED',
				timestamp: '2026-04-15T12:02:30.000Z',
				summary: 'Defender connected to the session.',
			},
			{
				seq: 54,
				type: 'UNIT_MOVED',
				timestamp: '2026-04-15T12:03:00.000Z',
				unitId: 'wolf-2',
				to: { q: 3, r: 4 },
			},
			{
				seq: 55,
				type: 'MOVE_RESOLVED',
				timestamp: '2026-04-15T12:03:01.000Z',
				unitId: 'wolf-2',
				rammedUnitIds: ['pigs-1'],
				destroyedUnitIds: ['pigs-1'],
				treadDamage: 1,
			},
			{
				seq: 56,
				type: 'FIRE_RESOLVED',
				timestamp: '2026-04-15T12:04:00.000Z',
				attackers: ['wolf-2'],
				targetId: 'pigs-1',
				roll: 5,
				outcome: 'X',
				odds: '2:1',
			},
			{
				seq: 57,
				type: 'ONION_TREADS_LOST',
				timestamp: '2026-04-15T12:04:01.000Z',
				amount: 2,
				remaining: 43,
			},
			{
				seq: 58,
				type: 'UNIT_STATUS_CHANGED',
				timestamp: '2026-04-15T12:04:02.000Z',
				unitId: 'pigs-1',
				from: 'operational',
				to: 'destroyed',
			},
		])
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.queryByText(/phase changed/i)).toBeNull()
		expect(screen.queryByText(/defender connected to the session/i)).toBeNull()

		const stream = screen.getByTestId('inactive-event-stream')
		expect(stream.querySelectorAll('.inactive-event-stream-entry').length).toBe(2)
		const entries = Array.from(stream.querySelectorAll('.inactive-event-stream-entry'))
		expect(entries[0].getAttribute('title')).toContain('Unit: wolf-2')
		expect(entries[0].getAttribute('title')).toContain('Target: pigs-1')
		expect(entries[0].getAttribute('title')).toContain('Tread loss: 1')
		expect(entries[1].getAttribute('title')).toContain('Attackers: wolf-2')
		expect(entries[1].getAttribute('title')).toContain('Outcome: destroyed')
		expect(entries[1].getAttribute('title')).toContain('Treads lost: 2')
		expect(entries[1].getAttribute('title')).toContain('Unit: pigs-1: operational → destroyed')
	})

	it('groups related inactive events by causeId across interleaved noise', async () => {
		const snapshot = createOnionMoveSnapshot(4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 61,
				type: 'UNIT_MOVED',
				timestamp: '2026-04-15T12:03:00.000Z',
				unitId: 'wolf-2',
				to: { q: 3, r: 4 },
				causeId: 'req-1',
			},
			{
				seq: 62,
				type: 'PHASE_CHANGED',
				timestamp: '2026-04-15T12:03:00.500Z',
				from: 'ONION_MOVE',
				to: 'DEFENDER_COMBAT',
				causeId: 'req-1',
			},
			{
				seq: 63,
				type: 'MOVE_RESOLVED',
				timestamp: '2026-04-15T12:03:01.000Z',
				unitId: 'wolf-2',
				rammedUnitIds: ['pigs-1'],
				destroyedUnitIds: ['pigs-1'],
				treadDamage: 1,
				causeId: 'req-1',
			},
			{
				seq: 64,
				type: 'ONION_TREADS_LOST',
				timestamp: '2026-04-15T12:03:01.500Z',
				amount: 1,
				remaining: 44,
				causeId: 'req-1',
			},
		])
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		const stream = screen.getByTestId('inactive-event-stream')
		expect(stream.querySelectorAll('.inactive-event-stream-entry').length).toBe(1)
		expect(stream.querySelector('.inactive-event-stream-entry')?.getAttribute('title')).toContain('Target: pigs-1')
		expect(stream.querySelector('.inactive-event-stream-entry')?.getAttribute('title')).toContain('Treads lost: 1')
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
