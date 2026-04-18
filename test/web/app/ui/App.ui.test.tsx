// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../../../web/App'
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
		selectedUnitId: 'wolf-2',
		mode: 'fire',
		scenarioName: 'Selection Contract Test',
		turnNumber: 11,
		lastEventSeq: 47,
		authoritativeState: {
			onion: {
				id: 'onion-1',
				type: 'TheOnion',
					friendlyName: 'The Onion 1',
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
					friendlyName: 'Big Bad Wolf 2',
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
					friendlyName: 'Puss 1',
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

	it('renders friendly names on the left and right rail cards', async () => {
		const snapshot = createDefenderMoveSnapshotWithZeroMa()
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		expect(await screen.findByRole('button', { name: /big bad wolf 2/i })).not.toBeNull()
		expect(screen.getByRole('button', { name: /puss 1/i })).not.toBeNull()
		expect(document.querySelector('.rail-right .selection-panel h2')?.textContent).toBe('Big Bad Wolf 2')
	})

	it('renders friendly names for onion weapon cards in combat', async () => {
		const snapshot = createLoadedBattlefieldSnapshot()
		snapshot.phase = 'ONION_COMBAT'
		snapshot.selectedUnitId = 'weapon:main-1'
		snapshot.authoritativeState.onion.weapons = [
			{
				id: 'main-1',
				name: 'Main Battery',
				friendlyName: 'Main Battery 1',
				attack: 4,
				range: 4,
				defense: 4,
				status: 'ready',
				individuallyTargetable: true,
			},
		]
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		expect(await screen.findByRole('button', { name: /main battery 1 attack: 4/i })).not.toBeNull()
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

	it('shows remaining ram capacity in the Onion rail', async () => {
		const snapshot = {
			...createOnionMoveSnapshot('onion-1', 4),
			authoritativeState: {
				...createOnionMoveSnapshot('onion-1', 4).authoritativeState,
				ramsThisTurn: 1,
			},
		}
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents: vi.fn().mockResolvedValue([]),
		})

		render(<App gameClient={client} gameId={123} />)

		const onionCard = await screen.findByRole('button', { name: /the onion 1/i })
		expect(onionCard.textContent).toContain('Rams remaining 1')
		expect(screen.getByText((_, element) => element?.tagName === 'DT' && element?.textContent === 'Rams remaining')).not.toBeNull()
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

	it('opens the inactive-event stream after the turn becomes inactive', async () => {
		const user = userEvent.setup()
		const activeSnapshot = createDefenderMoveSnapshotWithZeroMa()
		const inactiveSnapshot = createOnionMoveSnapshot(null, 4)
		const liveEventSource = createLiveEventSourceStub()
		const getState = vi
			.fn()
			.mockResolvedValueOnce({ snapshot: activeSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValueOnce({ snapshot: inactiveSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValue({ snapshot: inactiveSnapshot, session: { role: 'defender' as const } })
		const pollEvents = vi
			.fn()
			.mockResolvedValueOnce([
				{
					seq: 52,
					type: 'FIRE_RESOLVED',
					timestamp: '2026-04-15T12:02:00.000Z',
					turnNumber: 11,
					attackerFriendlyNames: ['Big Bad Wolf 2'],
					outcome: 'NE',
					targetFriendlyName: 'The Onion 1',
					targetId: 'onion',
				},
			])
			.mockResolvedValue([])
		const client = createGameClient({
			getState,
			submitAction: vi.fn().mockResolvedValue(inactiveSnapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		await screen.findByText((_, element) => element?.classList.contains('phase-chip-state') === true && element.textContent === 'Defender Movement')
		expect(screen.queryByTestId('inactive-event-stream')).toBeNull()

		await user.click(screen.getByRole('button', { name: /refresh/i }))

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByTestId('inactive-event-stream').querySelectorAll('.inactive-event-stream-entry')).toHaveLength(1)
		expect(screen.queryByText(/missed/i)).not.toBeNull()
		expect(screen.queryByText(/^details$/i)).toBeNull()
		expect(screen.getByRole('button', { name: /begin turn/i }).hasAttribute('disabled')).toBe(true)
	})

	it('renders structured inactive-event summaries when summary text is absent', async () => {
		const user = userEvent.setup()
		const snapshot = createOnionMoveSnapshot(null, 4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 52,
				type: 'PHASE_CHANGED',
				timestamp: '2026-04-15T12:02:00.000Z',
					turnNumber: 11,
				from: 'ONION_MOVE',
				to: 'DEFENDER_COMBAT',
			},
			{
				seq: 53,
				type: 'SESSION_CONNECTED',
				timestamp: '2026-04-15T12:02:30.000Z',
					turnNumber: 11,
				summary: 'Defender connected to the session.',
			},
			{
				seq: 54,
				type: 'UNIT_MOVED',
				timestamp: '2026-04-15T12:03:00.000Z',
					turnNumber: 11,
					unitFriendlyName: 'Big Bad Wolf 2',
				unitId: 'wolf-2',
				to: { q: 3, r: 4 },
			},
			{
				seq: 55,
				type: 'MOVE_RESOLVED',
				timestamp: '2026-04-15T12:03:01.000Z',
					turnNumber: 11,
					unitFriendlyName: 'Big Bad Wolf 2',
				unitId: 'wolf-2',
				rammedUnitIds: ['pigs-1'],
					rammedUnitFriendlyNames: ['Little Pigs 1'],
				destroyedUnitIds: ['pigs-1'],
					destroyedUnitFriendlyNames: ['Little Pigs 1'],
				treadDamage: 1,
			},
			{
				seq: 56,
				type: 'FIRE_RESOLVED',
				timestamp: '2026-04-15T12:04:00.000Z',
					turnNumber: 11,
					attackerFriendlyNames: ['Big Bad Wolf 2'],
				attackers: ['wolf-2'],
					targetFriendlyName: 'Little Pigs 1',
				targetId: 'pigs-1',
				roll: 5,
				outcome: 'X',
				odds: '2:1',
			},
			{
				seq: 57,
				type: 'ONION_TREADS_LOST',
				timestamp: '2026-04-15T12:04:01.000Z',
					turnNumber: 11,
				amount: 2,
				remaining: 43,
			},
			{
				seq: 58,
				type: 'UNIT_STATUS_CHANGED',
				timestamp: '2026-04-15T12:04:02.000Z',
					turnNumber: 11,
					unitFriendlyName: 'Little Pigs 1',
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
		await user.click(screen.getByRole('button', { name: /refresh/i }))
		const stream = screen.getByTestId('inactive-event-stream')
		expect(stream.textContent).toContain('Ram attempt')
		expect(stream.textContent).toContain('Fire on Little Pigs 1: destroyed')
		expect(screen.queryByText(/^details$/i)).toBeNull()
		expect(stream.querySelectorAll('.inactive-event-stream-entry').length).toBe(2)
		const entries = Array.from(stream.querySelectorAll('.inactive-event-stream-entry'))
		await user.hover(entries[0] as HTMLElement)
		expect(entries[0].textContent).toContain('Target: Little Pigs 1')
		expect(entries[0].textContent).toContain('Result: destroyed')
		await user.hover(entries[1] as HTMLElement)
		expect(entries[1].textContent).toContain('Attackers: Big Bad Wolf 2')
		expect(entries[1].textContent).toContain('Fire on Little Pigs 1: destroyed')
		expect(entries[1].textContent).toContain('Outcome: destroyed')
		expect(entries[1].textContent).toContain('Unit: Little Pigs 1: operational → destroyed')
	})

	it('renders actual combat outcomes for Little Pigs D results', async () => {
		const snapshot = createOnionMoveSnapshot(null, 4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 91,
				type: 'FIRE_RESOLVED',
				timestamp: '2026-04-15T12:06:00.000Z',
				turnNumber: 11,
				attackerFriendlyNames: ['Big Bad Wolf 2'],
				attackers: ['wolf-2'],
				targetFriendlyName: 'Little Pigs 1',
				targetId: 'pigs-1',
				roll: 3,
				outcome: 'D',
				odds: '1:1',
			},
			{
				seq: 92,
				type: 'UNIT_STATUS_CHANGED',
				timestamp: '2026-04-15T12:06:00.100Z',
				turnNumber: 11,
				unitFriendlyName: 'Little Pigs 1',
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

		const user = userEvent.setup()
		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)
		await user.click(screen.getByRole('button', { name: /refresh/i }))
		const stream = screen.getByTestId('inactive-event-stream')
		expect(stream.textContent).toContain('Fire on Little Pigs 1: destroyed')
		const entry = stream.querySelector('.inactive-event-stream-entry')
		await user.hover(entry as HTMLElement)
		expect(entry?.textContent).toContain('Outcome: destroyed')
		expect(entry?.textContent).toContain('Unit: Little Pigs 1: operational → destroyed')
	})

	it('renders D against Onion weapons as no effect', async () => {
		const snapshot = createOnionMoveSnapshot(null, 4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 72,
				type: 'FIRE_RESOLVED',
				timestamp: '2026-04-15T12:05:00.000Z',
					turnNumber: 11,
					attackerFriendlyNames: ['Big Bad Wolf 2'],
				attackers: ['wolf-2'],
					targetFriendlyName: 'Main Battery',
				targetId: 'main',
				roll: 4,
				outcome: 'D',
				odds: '2:1',
			},
		])
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByText(/fire on main battery: no effect/i)).not.toBeNull()
		expect(screen.queryByText(/disabled/i)).toBeNull()
	})

	it('groups related inactive events by causeId across interleaved noise', async () => {
		const user = userEvent.setup()
		const snapshot = createOnionMoveSnapshot(null, 4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 61,
				type: 'SESSION_CONNECTED',
				timestamp: '2026-04-15T12:03:00.000Z',
					turnNumber: 11,
				summary: 'Defender connected to the session.',
			},
			{
				seq: 62,
				type: 'PHASE_CHANGED',
				timestamp: '2026-04-15T12:03:00.500Z',
					turnNumber: 11,
				from: 'ONION_MOVE',
				to: 'DEFENDER_COMBAT',
				causeId: 'req-1',
			},
			{
				seq: 63,
				type: 'MOVE_RESOLVED',
				timestamp: '2026-04-15T12:03:01.000Z',
					turnNumber: 11,
					unitFriendlyName: 'Big Bad Wolf 2',
				unitId: 'wolf-2',
				rammedUnitIds: ['pigs-1'],
					rammedUnitFriendlyNames: ['Little Pigs 1'],
				destroyedUnitIds: ['pigs-1'],
					destroyedUnitFriendlyNames: ['Little Pigs 1'],
				treadDamage: 1,
				causeId: 'req-1',
			},
			{
				seq: 64,
				type: 'ONION_TREADS_LOST',
				timestamp: '2026-04-15T12:03:01.500Z',
					turnNumber: 11,
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

		expect(await screen.findByText(/ram attempt/i)).not.toBeNull()
		const stream = screen.getByTestId('inactive-event-stream')
		expect(stream.querySelectorAll('.inactive-event-stream-entry').length).toBe(1)
		const entry = stream.querySelector('.inactive-event-stream-entry')
		await user.hover(entry as HTMLElement)
		expect(entry?.textContent).toContain('Target: Little Pigs 1')
		expect(entry?.textContent).toContain('Result: destroyed')
		expect(entry?.textContent).toContain('Treads lost: 1')
	})

	it('surfaces a non-blocking error when inactive-event polling fails', async () => {
		const snapshot = createOnionMoveSnapshot(null, 4)
		const liveEventSource = createLiveEventSourceStub()
		const pollEvents = vi.fn().mockRejectedValue(new Error('network down'))
		const client = createGameClient({
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'defender' as const } }),
			submitAction: vi.fn().mockResolvedValue(snapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(await screen.findByRole('alert')).not.toBeNull()
		expect(screen.getByText(/unable to refresh inactive events/i)).not.toBeNull()
		expect(pollEvents).toHaveBeenCalledWith(123, 0)
	})

	it('keeps the inactive-event stream visible until it is acknowledged after the session becomes active again', async () => {
		const user = userEvent.setup()
		const inactiveSnapshot = createOnionMoveSnapshot(null, 4)
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

		await user.click(screen.getByRole('button', { name: /refresh/i }))

		await waitFor(() => {
			expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()
			expect(screen.getByRole('button', { name: /begin turn/i }).hasAttribute('disabled')).toBe(false)
		})
		await screen.findByText((_, element) => element?.classList.contains('phase-chip-state') === true && element.textContent === 'Defender Movement')
		expect(getState).toHaveBeenCalledWith(123)
	})

	it('keeps active controls locked until Begin Turn is acknowledged', async () => {
		const user = userEvent.setup()
		const inactiveSnapshot = createOnionMoveSnapshot(null, 4)
		const activeSnapshot = createDefenderMoveSnapshotWithZeroMa()
		const liveEventSource = createLiveEventSourceStub()
		const getState = vi
			.fn()
			.mockResolvedValueOnce({ snapshot: inactiveSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValueOnce({ snapshot: activeSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValue({ snapshot: activeSnapshot, session: { role: 'defender' as const } })
		const pollEvents = vi.fn().mockResolvedValueOnce([
			{
				seq: 72,
				type: 'FIRE_RESOLVED',
				timestamp: '2026-04-15T12:05:00.000Z',
				turnNumber: 11,
				attackers: ['wolf-2'],
				targetId: 'onion',
				roll: 4,
				outcome: 'X',
				odds: '2:1',
			},
		]).mockResolvedValue([])
		const submitAction = vi.fn().mockResolvedValue(activeSnapshot)
		const client = createGameClient({
			getState,
			submitAction,
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.getByRole('button', { name: /begin turn/i }).hasAttribute('disabled')).toBe(true)

		await user.click(screen.getByRole('button', { name: /refresh/i }))

		await waitFor(() => {
			expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()
			expect(screen.getByRole('button', { name: /begin turn/i }).hasAttribute('disabled')).toBe(false)
		})
		await screen.findByText((_, element) => element?.classList.contains('phase-chip-state') === true && element.textContent === 'Defender Movement')
		const shell = document.querySelector('.shell') as HTMLElement
		expect(shell.classList.contains('inactive-event-screen-locked')).toBe(true)
		const beginTurnButton = screen.getByRole('button', { name: /begin turn/i })
		expect(beginTurnButton.classList.contains('begin-turn-btn-ready')).toBe(true)
		expect(screen.getByTestId('inactive-event-stream').classList.contains('inactive-event-stream-acknowledgement-pending')).toBe(true)
		const startCombatButton = screen.getByRole('button', { name: /start combat/i })
		expect(startCombatButton.hasAttribute('disabled')).toBe(true)

		await user.click(startCombatButton)

		expect(submitAction).not.toHaveBeenCalled()

		await user.click(screen.getByRole('button', { name: /begin turn/i }))

		await waitFor(() => {
			expect(screen.queryByTestId('inactive-event-stream')).toBeNull()
		})
		expect(screen.queryByRole('button', { name: /begin turn/i })).toBeNull()
		expect(shell.classList.contains('inactive-event-screen-locked')).toBe(false)
		expect(screen.getByRole('button', { name: /start combat/i }).hasAttribute('disabled')).toBe(false)

		await user.click(screen.getByRole('button', { name: /start combat/i }))

		expect(submitAction).toHaveBeenCalledTimes(1)

		await act(async () => {
			fireEvent.contextMenu(screen.getByTestId('hex-cell-4-6'))
		})

		expect(submitAction).toHaveBeenCalledTimes(1)
	})

	it('clears stale inactive-event errors after polling is disabled and resumes cleanly', async () => {
		const user = userEvent.setup()
		const inactiveSnapshot = createOnionMoveSnapshot(null, 4)
		const activeSnapshot = createDefenderMoveSnapshotWithZeroMa()
		const liveEventSource = createLiveEventSourceStub()
		const getState = vi
			.fn()
			.mockResolvedValueOnce({ snapshot: inactiveSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValueOnce({ snapshot: activeSnapshot, session: { role: 'defender' as const } })
			.mockResolvedValue({ snapshot: inactiveSnapshot, session: { role: 'defender' as const } })
		const pollEvents = vi
			.fn()
			.mockRejectedValueOnce(new Error('network down'))
			.mockResolvedValue([])
		const client = createGameClient({
			getState,
			submitAction: vi.fn().mockResolvedValue(activeSnapshot),
			pollEvents,
		})

		render(<App gameClient={client} gameId={123} liveEventSource={liveEventSource as LiveEventSource} />)

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(await screen.findByRole('alert')).not.toBeNull()
		expect(screen.getByText(/unable to refresh inactive events/i)).not.toBeNull()

		await user.click(screen.getByRole('button', { name: /refresh/i }))

		await waitFor(() => {
			expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()
			expect(screen.queryByRole('alert')).toBeNull()
		})
		expect(screen.getByRole('button', { name: /begin turn/i }).hasAttribute('disabled')).toBe(false)

		await user.click(screen.getByRole('button', { name: /refresh/i }))

		expect(await screen.findByTestId('inactive-event-stream')).not.toBeNull()
		expect(screen.queryByRole('alert')).toBeNull()
		expect(pollEvents).toHaveBeenCalledWith(123, 0)
		// The event stream is only dismissed by explicit user action now, so pollEvents may be called more than once
		expect(pollEvents).toHaveBeenCalledTimes(2)
	})

		it('groups related inactive events by causeId across interleaved noise', async () => {
			const user = userEvent.setup()
			const snapshot = createOnionMoveSnapshot(null, 4)
			const liveEventSource = createLiveEventSourceStub()
			const pollEvents = vi.fn().mockResolvedValue([
			{
				seq: 62,
				type: 'PHASE_CHANGED',
				timestamp: '2026-04-15T12:03:00.500Z',
				turnNumber: 11,
				from: 'ONION_MOVE',
				to: 'DEFENDER_COMBAT',
				causeId: 'req-1',
			},
			{
				seq: 63,
				type: 'MOVE_RESOLVED',
				timestamp: '2026-04-15T12:03:01.000Z',
				turnNumber: 11,
				unitFriendlyName: 'Big Bad Wolf 2',
				unitId: 'wolf-2',
				rammedUnitIds: ['pigs-1'],
				rammedUnitFriendlyNames: ['Little Pigs 1'],
				destroyedUnitIds: ['pigs-1'],
				destroyedUnitFriendlyNames: ['Little Pigs 1'],
				treadDamage: 1,
				causeId: 'req-1',
			},
			{
				seq: 64,
				type: 'ONION_TREADS_LOST',
				timestamp: '2026-04-15T12:03:01.500Z',
				turnNumber: 11,
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

		expect(await screen.findByText(/ram attempt/i)).not.toBeNull()
		const stream = screen.getByTestId('inactive-event-stream')
		expect(stream.querySelectorAll('.inactive-event-stream-entry').length).toBe(1)
		const entry = stream.querySelector('.inactive-event-stream-entry')
		await user.hover(entry as HTMLElement)
		expect(entry?.textContent).toContain('Target: Little Pigs 1')
		expect(entry?.textContent).toContain('Result: destroyed')
		expect(entry?.textContent).toContain('Treads lost: 1')
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
