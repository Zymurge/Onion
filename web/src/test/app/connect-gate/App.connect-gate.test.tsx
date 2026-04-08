// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '../../../App'
import type { GameClient, GameSnapshot } from '../../../lib/gameClient'
import type { LiveEventSource } from '../../../lib/gameSessionTypes'

const createHttpGameRequestTransport = vi.hoisted(() => vi.fn())
const createLiveEventSource = vi.hoisted(() => vi.fn())
const requestJson = vi.hoisted(() => vi.fn())
const clearApiProtocolTraffic = vi.hoisted(() => vi.fn())
const getApiProtocolTrafficSnapshot = vi.hoisted(() => vi.fn().mockReturnValue([]))
const formatApiProtocolTrafficEntry = vi.hoisted(() => vi.fn().mockReturnValue([]))
const subscribeApiProtocolTraffic = vi.hoisted(() => vi.fn().mockReturnValue(vi.fn()))

vi.mock('../../../lib/httpGameClient', () => ({
	createHttpGameRequestTransport,
}))

vi.mock('../../../lib/liveEventSource', () => ({
	createLiveEventSource,
}))

vi.mock('../../../../../src/shared/apiProtocol', () => ({
	requestJson,
	clearApiProtocolTraffic,
	getApiProtocolTrafficSnapshot,
	formatApiProtocolTrafficEntry,
	subscribeApiProtocolTraffic,
}))

function createLoadedSnapshot(phase: 'ONION_MOVE' | 'DEFENDER_MOVE'): GameSnapshot {
	const cells = Array.from({ length: 8 }, (_, q) => Array.from({ length: 8 }, (_, r) => ({ q, r }))).flat()

	return {
		gameId: 123,
		phase,
		selectedUnitId: 'wolf-2',
		mode: 'fire',
		scenarioName: 'Test Scenario',
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
			cells,
			hexes: [
				{ q: 0, r: 0, t: 0 },
				{ q: 1, r: 0, t: 0 },
				{ q: 2, r: 0, t: 0 },
				{ q: 3, r: 0, t: 0 },
				{ q: 4, r: 0, t: 0 },
				{ q: 5, r: 0, t: 0 },
				{ q: 6, r: 0, t: 0 },
				{ q: 7, r: 0, t: 0 },
			],
		},
	} satisfies GameSnapshot
}

function createControlledClient(snapshot: GameSnapshot): GameClient {
	return {
		getState: vi.fn().mockResolvedValue({
			snapshot,
			session: { role: 'onion' },
		}),
		submitAction: vi.fn(),
		pollEvents: vi.fn().mockResolvedValue([]),
	}
}

function createControlledLiveEventSource(connectionStatus: 'connected' | 'idle' = 'connected'): LiveEventSource & { disconnect: ReturnType<typeof vi.fn> } {
	return {
		subscribe: vi.fn().mockReturnValue(vi.fn()),
		connect: vi.fn(),
		disconnect: vi.fn() as LiveEventSource['disconnect'],
		getConnectionState: vi.fn().mockReturnValue(connectionStatus),
	}
}

beforeEach(() => {
	vi.clearAllMocks()
})

describe('App connect gate', () => {
	it('renders a connect form when runtime config is seeded but no client is ready', async () => {
		render(<App runtimeConfig={{ apiBaseUrl: 'http://localhost:3000', gameId: 123, liveRefreshQuietWindowMs: 5 }} showConnectionGate />)

		expect(screen.getByRole('heading', { name: /open a live game session/i })).not.toBeNull()
		expect((screen.getByLabelText(/api base url/i) as HTMLInputElement).value).toBe('http://localhost:3000')
		expect((screen.getByLabelText(/username/i) as HTMLInputElement).value).toBe('')
		expect((screen.getByLabelText(/game id/i) as HTMLInputElement).value).toBe('123')
	})

	it('logs in and loads an existing game when the form is submitted', async () => {
		const user = userEvent.setup()
		const timeSpy = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('01:14:15 PM')
		const submitAction = vi.fn().mockResolvedValue({
			gameId: 123,
			phase: 'ONION_MOVE',
			selectedUnitId: 'wolf-2',
			mode: 'fire',
			scenarioName: 'Test Scenario',
			turnNumber: 11,
			lastEventSeq: 47,
		})
		requestJson.mockResolvedValue({
			ok: true,
			status: 200,
			data: { userId: 'user-123', token: 'stub.token' },
		})

		createHttpGameRequestTransport.mockReturnValue({
			getState: vi.fn().mockResolvedValue({
				snapshot: createLoadedSnapshot('ONION_MOVE'),
				session: { role: 'onion' },
			}),
			submitAction,
		})
		createLiveEventSource.mockReturnValue({
			subscribe: vi.fn().mockReturnValue(vi.fn()),
			connect: vi.fn(),
			disconnect: vi.fn(),
			getConnectionState: vi.fn().mockReturnValue('connected'),
		})

		render(<App runtimeConfig={{ apiBaseUrl: 'http://localhost:3000', gameId: 123, liveRefreshQuietWindowMs: 5 }} showConnectionGate />)

		await user.type(screen.getByLabelText(/username/i), 'player-1')
		await user.type(screen.getByLabelText(/password/i), 'secret')
		await user.click(screen.getByRole('button', { name: /load game/i }))

		expect(requestJson).toHaveBeenCalledWith(
			expect.objectContaining({
				baseUrl: 'http://localhost:3000',
				path: 'auth/login',
				method: 'POST',
				body: {
					username: 'player-1',
					password: 'secret',
				},
			}),
		)
		expect(createHttpGameRequestTransport).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token: 'stub.token',
		})
		expect(createLiveEventSource).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token: 'stub.token',
		})

		await screen.findByText(/Turn 11/i)
		await screen.findByText(/Test Scenario/i)
		const roleBadge = await screen.findByText(/^Onion$/i, { selector: '.role-badge' })
		expect(roleBadge.classList.contains('role-badge-onion')).toBe(true)
		expect(screen.getByText('Connected').classList.contains('connection-status-connected')).toBe(true)
		expect(screen.getByText('01:14:15 PM')).not.toBeNull()
		expect(screen.getByText((_, element) => element?.classList.contains('phase-chip-state') === true && element?.textContent === 'Onion Movement')).not.toBeNull()
		expect(
			screen.getByText((_, element) => element?.classList.contains('phase-chip-state') === true && element?.classList.contains('phase-chip-active') === true),
		).not.toBeNull()

		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('true')
		timeSpy.mockRestore()
	})

	it('renders the role badge as inactive when it is not that role’s turn', async () => {
		const user = userEvent.setup()
		const timeSpy = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('01:14:15 PM')

		requestJson.mockResolvedValue({
			ok: true,
			status: 200,
			data: { userId: 'user-123', token: 'stub.token' },
		})

		createHttpGameRequestTransport.mockReturnValue({
			getState: vi.fn().mockResolvedValue({
				snapshot: createLoadedSnapshot('DEFENDER_MOVE'),
				session: { role: 'onion' },
			}),
			submitAction: vi.fn(),
		})
		createLiveEventSource.mockReturnValue({
			subscribe: vi.fn().mockReturnValue(vi.fn()),
			connect: vi.fn(),
			disconnect: vi.fn(),
			getConnectionState: vi.fn().mockReturnValue('connected'),
		})

		render(<App runtimeConfig={{ apiBaseUrl: 'http://localhost:3000', gameId: 123, liveRefreshQuietWindowMs: 5 }} showConnectionGate />)

		await user.type(screen.getByLabelText(/username/i), 'player-1')
		await user.type(screen.getByLabelText(/password/i), 'secret')
		await user.click(screen.getByRole('button', { name: /load game/i }))

		const roleBadge = await screen.findByText(/^Onion$/i, { selector: '.role-badge' })
		expect(roleBadge.classList.contains('role-badge-inactive')).toBe(true)
		expect(roleBadge.classList.contains('role-badge-active')).toBe(false)
		timeSpy.mockRestore()
	})

	it('disposes the previous session controller when the bound session changes', async () => {
		const firstClient = createControlledClient(createLoadedSnapshot('ONION_MOVE'))
		const secondClient = createControlledClient({
			...createLoadedSnapshot('DEFENDER_MOVE'),
			gameId: 456,
			turnNumber: 12,
		})
		const firstLiveEventSource = createControlledLiveEventSource()
		const secondLiveEventSource = createControlledLiveEventSource()

		const view = render(
			<App
				gameClient={firstClient}
				gameId={123}
				liveEventSource={firstLiveEventSource}
			/>,
		)

		await waitFor(() => {
			expect(firstClient.getState).toHaveBeenCalledTimes(1)
		})

		view.rerender(
			<App
				gameClient={secondClient}
				gameId={456}
				liveEventSource={secondLiveEventSource}
			/>,
		)

		await waitFor(() => {
			expect(firstLiveEventSource.disconnect).toHaveBeenCalledWith(123)
		})
	})
})