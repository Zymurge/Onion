// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameClient, GameSnapshot } from '#web/lib/gameClient'
import { clearAuthSession, saveAuthSession } from '#web/lib/authSession'
import type { WebRuntimeConfig } from '#web/lib/appBootstrap'
import { useAppSessionWiring } from '#web/lib/appSessionWiring'
import type { LiveEventSource } from '#web/lib/gameSessionTypes'
import type { SessionBinding } from '#web/lib/sessionBinding'

const createHttpGameRequestTransport = vi.hoisted(() => vi.fn())
const createLiveEventSource = vi.hoisted(() => vi.fn())

vi.mock('#web/lib/httpGameClient', () => ({
	createHttpGameRequestTransport,
}))

vi.mock('#web/lib/liveEventSource', () => ({
	createLiveEventSource,
}))

const runtimeConfig: WebRuntimeConfig = {
	apiBaseUrl: 'http://localhost:3000',
	gameId: 123,
	userRoute: 'games',
	liveRefreshQuietWindowMs: 5,
	clientLogLevel: 'info',
}

const snapshot: GameSnapshot = {
	gameId: 123,
	phase: 'ONION_MOVE',
	scenarioName: 'Session wiring test scenario',
	turnNumber: 3,
	lastEventSeq: 12,
	victoryObjectives: [],
}

function createLiveSource(): LiveEventSource & { disconnect: ReturnType<typeof vi.fn> } {
	return {
		subscribe: vi.fn().mockReturnValue(() => undefined),
		connect: vi.fn(),
		disconnect: vi.fn(),
		getConnectionState: vi.fn().mockReturnValue('idle'),
	}
}

function createTransport() {
	return {
		getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
		submitAction: vi.fn().mockResolvedValue(snapshot),
		pollEvents: vi.fn().mockResolvedValue([]),
	}
}

function createClient(overrides: Partial<GameClient> = {}): GameClient {
	return {
		getState: vi.fn().mockResolvedValue({ snapshot, session: { role: 'onion' as const } }),
		submitAction: vi.fn().mockResolvedValue(snapshot),
		pollEvents: vi.fn().mockResolvedValue([]),
		...overrides,
	}
}

function createBinding(gameId = 123): SessionBinding & { liveEventSource: ReturnType<typeof createLiveSource> } {
	return {
		gameId,
		requestTransport: createTransport(),
		liveEventSource: createLiveSource(),
	}
}

beforeEach(() => {
	vi.clearAllMocks()
	clearAuthSession()
	createHttpGameRequestTransport.mockImplementation(() => createTransport())
	createLiveEventSource.mockImplementation(() => createLiveSource())
})

describe('useAppSessionWiring', () => {
	it('returns idle state without creating a session controller', () => {
		const { result } = renderHook(() => useAppSessionWiring({}))

		expect(result.current.isControlled).toBe(false)
		expect(result.current.activeGameId).toBeNull()
		expect(result.current.binding).toBeNull()
		expect(result.current.state.status).toBe('idle')
		expect(result.current.state.snapshot).toBeNull()
		expect(result.current.turn).toEqual(expect.objectContaining({
		phase: null,
		number: null,
		isLifecycleActive: true,
		isActive: false,
	}))
	})

	it('uses an injected game client when a game ID is provided', async () => {
		const client = createClient()
		const { result } = renderHook(() => useAppSessionWiring({ gameClient: client, gameId: 123 }))

		await waitFor(() => {
			expect(result.current.state.status).toBe('ready')
		})

		expect(client.getState).toHaveBeenCalledWith(123)
		expect(result.current.isControlled).toBe(true)
		expect(result.current.activeGameId).toBe(123)
		expect(result.current.turn).toEqual(expect.objectContaining({
		phase: 'ONION_MOVE',
		number: 3,
		isLifecycleActive: true,
		isActive: true,
	}))
		expect(createHttpGameRequestTransport).not.toHaveBeenCalled()
	})

	it('binds a connected session after the gate supplies it', async () => {
		const connectedBinding = createBinding(456)
		const { result } = renderHook(() => useAppSessionWiring({}))

		act(() => {
			result.current.setConnectedSession(connectedBinding)
		})

		await waitFor(() => {
			expect(result.current.activeGameId).toBe(456)
			expect(result.current.state.status).toBe('ready')
		})

		expect(connectedBinding.requestTransport.getState).toHaveBeenCalledWith(456)
		expect(result.current.binding).toBe(connectedBinding)
	})

	it('creates authenticated transports from a persisted auth session', async () => {
		const persistedSource = createLiveSource()
		const persistedTransport = createTransport()
		createHttpGameRequestTransport.mockReturnValue(persistedTransport)
		createLiveEventSource.mockReturnValue(persistedSource)
		saveAuthSession({
			apiBaseUrl: 'http://localhost:3000',
			username: 'player-1',
			userId: 'user-1',
			token: 'legacy-token',
		})

		const { result } = renderHook(() => useAppSessionWiring({ gameId: 123 }))

		await waitFor(() => {
			expect(result.current.state.status).toBe('ready')
		})

		expect(createHttpGameRequestTransport).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token: 'legacy-token',
		})
		expect(createLiveEventSource).toHaveBeenCalledWith({
			baseUrl: 'http://localhost:3000',
			token: 'legacy-token',
		})
		expect(result.current.authSession?.username).toBe('player-1')
	})

	it('disposes the active controller and disconnects live events on unmount', async () => {
		const liveEventSource = createLiveSource()
		const client = createClient()
		const { result, unmount } = renderHook(() => useAppSessionWiring({
			gameClient: client,
			gameId: 123,
			liveEventSource,
			runtimeConfig,
		}))

		await waitFor(() => {
			expect(result.current.state.status).toBe('ready')
		})

		unmount()
		await waitFor(() => {
			expect(liveEventSource.disconnect).toHaveBeenCalledWith(123)
		})
	})
})