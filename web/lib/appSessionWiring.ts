import { useMemo, useState } from 'react'

import type { TurnPhase } from '../../shared/types/index.js'
import type { WebRuntimeConfig } from './appBootstrap'
import { getAuthSession, type AuthSession } from './authSession'
import type { GameClient } from './gameClient'
import { createGameSessionController } from './gameSessionController'
import type { GameSessionController, GameSessionViewState, LiveEventSource } from './gameSessionTypes'
import { createHttpGameRequestTransport } from './httpGameClient'
import { createLiveEventSource } from './liveEventSource'
import logger from './logger'
import { getPhaseOwner } from './battlefieldViewBuilders'
import { idleLiveEventSource, idleSessionController } from './appIdleSessionFallbacks'
import { createRequestTransportFromGameClient } from './appRequestTransportAdapter'
import type { SessionBinding } from './sessionBinding'
import { useGameSession } from './useGameSession'

/** Inputs used to resolve an injected, connected, persisted, or idle session. */
export type AppSessionWiringOptions = {
	gameClient?: GameClient
	gameId?: number
	liveEventSource?: LiveEventSource
	runtimeConfig?: WebRuntimeConfig
}

/** Derived turn identity used by handoff gating and battlefield display. */
export type AppSessionTurnState = {
	phase: TurnPhase | null
	number: number | null
	role: 'onion' | 'defender' | null
	activeOwner: 'onion' | 'defender' | null
	isKnown: boolean
	isLifecycleActive: boolean
	isActive: boolean
}

/**
 * Complete session boundary returned to App orchestration.
 * The binding selects one game; the controller owns its authoritative state.
 */
export type AppSessionWiring = {
	authSession: AuthSession | null
	binding: SessionBinding | null
	controller: GameSessionController
	state: GameSessionViewState
	turn: AppSessionTurnState
	activeGameId: number | null
	isControlled: boolean
	setConnectedSession: (binding: SessionBinding | null) => void
}

/**
 * Resolves session ownership and creates exactly one controller for the active
 * game, preferring an injected client over persisted HTTP session wiring.
 */
export function useAppSessionWiring({
	gameClient,
	gameId,
	liveEventSource,
	runtimeConfig,
}: AppSessionWiringOptions): AppSessionWiring {
	const [authSession] = useState<AuthSession | null>(() => getAuthSession())
	const [connectedSession, setConnectedSession] = useState<SessionBinding | null>(null)

	const providedRequestTransport = useMemo(() => {
		if (gameClient === undefined) {
			return null
		}

		return createRequestTransportFromGameClient(gameClient)
	}, [gameClient])

	const persistedSessionBinding = useMemo<SessionBinding | null>(() => {
		if (providedRequestTransport !== null || authSession === null || gameId === undefined) {
			return null
		}

		return {
			requestTransport: createHttpGameRequestTransport({
				baseUrl: authSession.apiBaseUrl,
				token: authSession.token,
			}),
			liveEventSource: createLiveEventSource({
				baseUrl: authSession.apiBaseUrl,
				token: authSession.token,
			}),
			gameId,
		}
	}, [authSession, gameId, providedRequestTransport])

	const binding = useMemo<SessionBinding | null>(() => {
		if (providedRequestTransport !== null && gameId !== undefined) {
			if (typeof window !== 'undefined') {
				logger.debug('[app] using provided request transport', {
					gameId,
					hasLiveEventSource: liveEventSource !== undefined,
				})
			}

			return {
				gameId,
				requestTransport: providedRequestTransport,
				liveEventSource: liveEventSource ?? idleLiveEventSource,
			}
		}

		if (typeof window !== 'undefined') {
			logger.debug('[app] using connected session binding', {
				hasConnectedSession: connectedSession !== null,
				connectedGameId: connectedSession?.gameId ?? null,
			})
		}

		return connectedSession ?? persistedSessionBinding
	}, [connectedSession, gameId, liveEventSource, persistedSessionBinding, providedRequestTransport])

	const liveRefreshQuietWindowMs = runtimeConfig?.liveRefreshQuietWindowMs ?? 500
	const activeController = useMemo<GameSessionController | null>(() => {
		if (binding === null) {
			return null
		}

		return createGameSessionController({
			gameId: binding.gameId,
			requestTransport: binding.requestTransport,
			liveEventSource: binding.liveEventSource,
			liveRefreshQuietWindowMs,
		})
	}, [binding, liveRefreshQuietWindowMs])

	const controller = activeController ?? idleSessionController
	const state = useGameSession(controller, { autoLoad: activeController !== null, disposeOnUnmount: true })

	const phase = state.snapshot?.phase ?? null
	const role = state.session?.role ?? null
	const number = state.snapshot?.turnNumber ?? null
	const activeOwner = getPhaseOwner(phase)
	const isKnown = state.snapshot !== null && role !== null
	const isLifecycleActive = state.snapshot?.status === undefined || state.snapshot?.status === 'active'
	const isActive = isLifecycleActive && state.snapshot !== null && role !== null && activeOwner === role

	return {
		authSession,
		binding,
		controller,
		state,
		turn: {
			phase,
			number,
			role,
			activeOwner,
			isKnown,
			isLifecycleActive,
			isActive,
		},
		activeGameId: binding?.gameId ?? null,
		isControlled: binding !== null,
		setConnectedSession,
	}
}