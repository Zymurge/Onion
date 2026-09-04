// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import App from '#web/App'
import { GameClientSeamError, type GameClient, type GameSnapshot } from '#web/lib/gameClient'
import { clearAuthSession, saveAuthSession } from '#web/lib/authSession'
import { makeScenarioSnapshot, type TestScenarioSnapshot } from '#test/utils/gameStateUtils'
import { WebRuntimeConfig } from '#web/lib/appBootstrap'

const createHttpGameRequestTransport = vi.hoisted(() => vi.fn())
const createLiveEventSource = vi.hoisted(() => vi.fn())
const requestJson = vi.hoisted(() => vi.fn())
const clearApiProtocolTraffic = vi.hoisted(() => vi.fn())
const getApiProtocolTrafficSnapshot = vi.hoisted(() => vi.fn().mockReturnValue([]))
const formatApiProtocolTrafficEntry = vi.hoisted(() => vi.fn().mockReturnValue([]))
const subscribeApiProtocolTraffic = vi.hoisted(() => vi.fn().mockReturnValue(vi.fn()))
const runtimeConfig = { apiBaseUrl: 'http://localhost:3000', gameId: 123, userRoute: 'login', liveRefreshQuietWindowMs: 5, clientLogLevel: 'info' } as WebRuntimeConfig

vi.mock('#web/lib/httpGameClient', () => ({
	createHttpGameRequestTransport,
}))

vi.mock('#web/lib/liveEventSource', () => ({
	createLiveEventSource,
}))

vi.mock('#shared/apiProtocol', () => ({
	requestJson,
	clearApiProtocolTraffic,
	getApiProtocolTrafficSnapshot,
	formatApiProtocolTrafficEntry,
	subscribeApiProtocolTraffic,
}))

function createLoadedSnapshot(phase: 'ONION_MOVE' | 'DEFENDER_MOVE'): TestScenarioSnapshot {
	return makeScenarioSnapshot({
		phase,
		scenarioName: 'Test Scenario',
		scenarioMap: {
			hexes: Array.from({ length: 8 }, (_, q) => ({ q, r: 0, t: 0 })),
		},
	})
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

function createControlledLiveEventSource(connectionStatus: 'connected' | 'idle' = 'connected') {
	const disconnect = vi.fn()
	return {
		subscribe: vi.fn().mockReturnValue(vi.fn()),
		connect: vi.fn(),
		disconnect,
		getConnectionState: vi.fn().mockReturnValue(connectionStatus),
	}
}

function createToken(expirySeconds = Math.floor(Date.now() / 1_000) + 3_600): string {
	return `eyJhbGciOiJub25lIn0.${btoa(JSON.stringify({ exp: expirySeconds })).replace(/=/g, '')}.signature`
}

function mockAuthenticatedSession(snapshot: GameSnapshot): void {
	requestJson.mockResolvedValue({
		ok: true,
		status: 200,
		data: { username: 'player-1', token: 'test.jwt.token' },
	})
	createHttpGameRequestTransport.mockReturnValue({
		getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' } }),
		submitAction: vi.fn(),
	})
	createLiveEventSource.mockReturnValue(createControlledLiveEventSource())
}

async function submitConnectForm(): Promise<void> {
	const user = userEvent.setup()
	await user.type(screen.getByLabelText(/username/i), 'player-1')
	await user.type(screen.getByLabelText(/password/i), 'secret')
	await user.click(screen.getByRole('button', { name: /load game/i }))
}

beforeEach(() => {
	vi.clearAllMocks()
	clearAuthSession()
})

describe('App connect gate', () => {
	it('logs in and loads an existing game when the form is submitted', async () => {
		const timeSpy = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('01:14:15 PM')
		mockAuthenticatedSession(createLoadedSnapshot('ONION_MOVE'))

		render(<App runtimeConfig={runtimeConfig} showConnectionGate />)
		await submitConnectForm()

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
			token: 'test.jwt.token',
		})
		expect(createLiveEventSource).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token: 'test.jwt.token',
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

		expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('false')
		timeSpy.mockRestore()
	})

	it('renders the role badge as inactive when it is not that role’s turn', async () => {
		const timeSpy = vi.spyOn(Date.prototype, 'toLocaleTimeString').mockReturnValue('01:14:15 PM')
		mockAuthenticatedSession(createLoadedSnapshot('DEFENDER_MOVE'))

		render(<App runtimeConfig={runtimeConfig} showConnectionGate />)
		await submitConnectForm()

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

	it('creates authenticated transports from a persisted session', async () => {
		const snapshot = createLoadedSnapshot('ONION_MOVE')
		const token = createToken()
		const liveSource = createControlledLiveEventSource()
		const requestTransport = {
			getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' } }),
			submitAction: vi.fn(),
		}
		createHttpGameRequestTransport.mockReturnValue(requestTransport)
		createLiveEventSource.mockReturnValue(liveSource)
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token,
		})

		render(<App gameId={123} />)

		await waitFor(() => {
			expect(createHttpGameRequestTransport).toHaveBeenCalledWith({
				baseUrl: 'http://localhost:3000',
				token: expect.any(String),
			})
		})
		expect(createLiveEventSource).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token,
		})
	})

	it('redirects and clears storage when the persisted JWT expires', async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date(1_000_000))
		const navigate = vi.fn()
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'eyJhbGciOiJub25lIn0.eyJleHAiOjEwMDF9.signature',
		})

		render(<App gameId={123} navigate={navigate} />)

		await act(async () => {
			vi.advanceTimersByTime(1_001)
		})
		expect(navigate).toHaveBeenCalledWith('/user/login?returnTo=%2F')
		expect(window.localStorage.getItem('onion.auth.session')).toBeNull()
		vi.useRealTimers()
	})

	it('redirects and clears storage after a game request returns 401', async () => {
		const navigate = vi.fn()
		const client: GameClient = {
			getState: vi.fn().mockRejectedValue(new GameClientSeamError('transport', 'Unauthorized', undefined, 401)),
			submitAction: vi.fn(),
			pollEvents: vi.fn().mockResolvedValue([]),
		}
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: createToken(),
		})

		render(<App gameClient={client} gameId={123} navigate={navigate} />)

		await waitFor(() => {
			expect(navigate).toHaveBeenCalledWith('/user/login?returnTo=%2F')
		})
		expect(window.localStorage.getItem('onion.auth.session')).toBeNull()
	})
})