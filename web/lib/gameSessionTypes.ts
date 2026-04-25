/**
 * Canonical contract for the web session controller refactor.
 *
 * Rules:
 * - One app instance maps to exactly one game session.
 * - This file is the source of truth for the controller, transport, and live-signal contract.
 * - Live events are sync hints; the controller keeps server snapshots authoritative.
 * - Keep the contract small, explicit, and stable for consumers and test doubles.
 *
 * Intended usage:
 * - `GameRequestTransport` is the request seam for loading state and submitting actions.
 * - `LiveEventSource` is the push seam for connection diagnostics and live hints.
 * - `GameSessionController` owns orchestration, sequencing, retry, and stale-result handling.
 * - `GameSessionViewState` is the snapshot consumed by React and test helpers.
 */

import type { GameAction, GameClientSeamError, GameEvent, GameSessionContext, ServerGameSnapshot } from './gameClient'

/**
 * Live connection state reported to the session controller and UI.
 */
export type LiveConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected'

/**
 * Live signal emitted by the transport boundary.
 *
 * The controller treats these signals as hints for refresh and lifecycle updates.
 */
export type LiveSessionSignal =
	| { kind: 'connection'; status: LiveConnectionStatus; gameId: number }
	| { kind: 'snapshot'; gameId: number; eventSeq: number | null }
	| { kind: 'event'; gameId: number; eventSeq: number; eventType: string }
	| { kind: 'error'; gameId: number; message: string }

/**
 * The stable state shape exposed by the session controller.
 *
 * Keep this snapshot-driven and free of transport-specific details.
 */
export type GameSessionViewState = {
	status: 'idle' | 'loading' | 'ready' | 'refreshing' | 'error'
	snapshot: ServerGameSnapshot | null
	session: GameSessionContext | null
	liveConnection: LiveConnectionStatus
	lastAppliedEventSeq: number | null
	lastAppliedEventType: string | null
	lastUpdatedAt: Date | null
	error: GameClientSeamError | null
}

/**
 * Reason codes for refresh requests.
 *
 * Use these to keep controller tests precise without embedding policy in the app shell.
 */
export type GameSessionRefreshReason = 'manual' | 'live-event' | 'phase-retry'

/**
 * Listener shape for observing controller state updates.
 */
export type GameSessionListener = (state: GameSessionViewState) => void

/**
 * Construction options for the session controller.
 */
export type GameSessionControllerOptions = {
	gameId: number
	requestTransport: GameRequestTransport
	liveEventSource: LiveEventSource
	liveRefreshQuietWindowMs?: number
}

/**
 * The orchestration boundary above transport.
 *
 * The controller owns load, refresh, submit, sequencing, quiet-window handling,
 * stale-result rejection, and cleanup.
 */
export type GameSessionController = {
	subscribe(listener: GameSessionListener): () => void
	getSnapshot(): GameSessionViewState
	load(): Promise<void>
	refresh(reason?: GameSessionRefreshReason): Promise<void>
	submitAction(action: GameAction): Promise<ServerGameSnapshot | null>
	dispose(): void
}

/**
 * Thin React adapter options for consuming a controller.
 */
export type UseGameSessionOptions = {
	autoLoad?: boolean
	disposeOnUnmount?: boolean
}

/**
 * Request transport contract for authoritative server interactions.
 *
 * This seam loads session state and submits actions. It does not own live timing,
 * refresh policy, or local projection.
 */
export type GameRequestTransport = {
	getState(gameId: number): Promise<{ snapshot: ServerGameSnapshot; session: GameSessionContext }>
	submitAction(gameId: number, action: GameAction): Promise<ServerGameSnapshot>
	pollEvents?(gameId: number, afterSeq: number): Promise<ReadonlyArray<GameEvent>>
}

/**
 * Push transport contract for live connection and event hints.
 *
 * This seam reports connection status and live hints only; it does not decide
 * when to refresh or how to apply events to a local projection.
 */
export type LiveEventSource = {
	subscribe(listener: (signal: LiveSessionSignal) => void): () => void
	connect(gameId: number): void
	disconnect(gameId: number): void
	getConnectionState(gameId: number): LiveConnectionStatus
}
