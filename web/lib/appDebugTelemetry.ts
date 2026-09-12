import { useEffect, useRef } from 'react'

import logger from './logger'

type DebugSessionInput = {
	activeGameId: number | null
	state: {
		lastAppliedEventSeq: number | null
		lastAppliedEventType: string | null
		liveConnection: string
	}
	turn: {
		phase: string | null
		role: 'onion' | 'defender' | null
		activeOwner: 'onion' | 'defender' | null
		isActive: boolean
	}
}

type DebugGateInput = {
	controlsLocked: boolean
	screenLocked: boolean
	inactiveEventWindowVisible: boolean
}

type DebugDisplayInput = {
	phaseAdvanceLabel: string | null
}

type DebugInactiveEventStreamInput = {
	entries: ReadonlyArray<unknown>
	isDismissed: boolean
}

export type AppDebugTelemetryOptions = {
	display: DebugDisplayInput
	gate: DebugGateInput
	inactiveEventStream: DebugInactiveEventStreamInput
	session: DebugSessionInput
}

type SessionReloadState = {
	activeGameId: number | null
	lastAppliedEventSeq: number | null
	lastAppliedEventType: string | null
	liveConnection: string
	loggedAtMs: number
	sessionPhase: string | null
	sessionRole: 'onion' | 'defender' | null
	sessionTurnActive: boolean
}

type TurnState = {
	activeGameId: number | null
	activeTurnOwner: 'onion' | 'defender' | null
	inactiveEventControlsLocked: boolean
	inactiveEventScreenLocked: boolean
	inactiveEventWindowVisible: boolean
	phaseAdvanceLabel: string | null
	sessionPhase: string | null
	sessionRole: 'onion' | 'defender' | null
	sessionTurnActive: boolean
	loggedAtMs: number
}

function hasStateChanged<T extends Record<string, unknown>>(previousState: T | null, currentState: T): boolean {
	return previousState === null || Object.entries(currentState).some(([key, value]) => previousState[key as keyof T] !== value)
}

export function useAppDebugTelemetry({
	display,
	gate,
	inactiveEventStream,
	session,
}: AppDebugTelemetryOptions): void {
	const previousSessionReloadRef = useRef<SessionReloadState | null>(null)
	const previousTurnStateRef = useRef<TurnState | null>(null)

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}

		const currentState: SessionReloadState = {
			activeGameId: session.activeGameId,
			lastAppliedEventSeq: session.state.lastAppliedEventSeq,
			lastAppliedEventType: session.state.lastAppliedEventType,
			liveConnection: session.state.liveConnection,
			loggedAtMs: Date.now(),
			sessionPhase: session.turn.phase,
			sessionRole: session.turn.role,
			sessionTurnActive: session.turn.isActive,
		}
		const previousState = previousSessionReloadRef.current
		if (!hasStateChanged(previousState, currentState)) {
			return
		}

		logger.debug('[app-debug] session reload', {
			ts: currentState.loggedAtMs,
			deltaMs: previousState === null ? null : currentState.loggedAtMs - previousState.loggedAtMs,
			previous: previousState,
			current: currentState,
		})

		previousSessionReloadRef.current = currentState
	}, [
		session.activeGameId,
		session.state.lastAppliedEventSeq,
		session.state.lastAppliedEventType,
		session.state.liveConnection,
		session.turn.isActive,
		session.turn.phase,
		session.turn.role,
	])

	useEffect(() => {
		if (typeof window === 'undefined') {
			return
		}

		const currentState: TurnState = {
			activeGameId: session.activeGameId,
			activeTurnOwner: session.turn.activeOwner,
			inactiveEventControlsLocked: gate.controlsLocked,
			inactiveEventScreenLocked: gate.screenLocked,
			inactiveEventWindowVisible: gate.inactiveEventWindowVisible,
			phaseAdvanceLabel: display.phaseAdvanceLabel,
			sessionPhase: session.turn.phase,
			sessionRole: session.turn.role,
			sessionTurnActive: session.turn.isActive,
			loggedAtMs: Date.now(),
		}
		const previousState = previousTurnStateRef.current
		if (!hasStateChanged(previousState, currentState)) {
			return
		}

		logger.debug('[app-debug] turn state transition', {
			ts: currentState.loggedAtMs,
			deltaMs: previousState === null ? null : currentState.loggedAtMs - previousState.loggedAtMs,
			previous: previousState,
			current: {
				activeGameId: currentState.activeGameId,
				activeTurnOwner: currentState.activeTurnOwner,
				inactiveEntryCount: inactiveEventStream.entries.length,
				inactiveDismissed: inactiveEventStream.isDismissed,
				inactiveEventControlsLocked: currentState.inactiveEventControlsLocked,
				inactiveEventScreenLocked: currentState.inactiveEventScreenLocked,
				inactiveEventWindowVisible: currentState.inactiveEventWindowVisible,
				lastAppliedEventSeq: session.state.lastAppliedEventSeq,
				phaseAdvanceLabel: currentState.phaseAdvanceLabel,
				sessionPhase: currentState.sessionPhase,
				sessionRole: currentState.sessionRole,
				sessionTurnActive: currentState.sessionTurnActive,
			},
		})

		previousTurnStateRef.current = currentState
	}, [
		display.phaseAdvanceLabel,
		gate.controlsLocked,
		gate.inactiveEventWindowVisible,
		gate.screenLocked,
		inactiveEventStream.entries.length,
		inactiveEventStream.isDismissed,
		session.activeGameId,
		session.state.lastAppliedEventSeq,
		session.turn.activeOwner,
		session.turn.isActive,
		session.turn.phase,
		session.turn.role,
	])
}