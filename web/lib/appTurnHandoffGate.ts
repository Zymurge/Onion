import { useCallback, useEffect, useState } from 'react'

import { buildAcknowledgementTurnKey } from './turnKey'
import type { GameSessionController, GameSessionViewState } from './gameSessionTypes'

export type TurnHandoffGateTurn = {
	phase: GameSessionViewState['snapshot'] extends infer Snapshot
		? Snapshot extends { phase: infer Phase } ? Phase | null : never
		: never
	number: number | null
	role: 'onion' | 'defender' | null
	isKnown: boolean
	isLifecycleActive: boolean
	isActive: boolean
}

export type InactiveEventStreamForGate = {
	entries: ReadonlyArray<{ type: string }>
	clearEntries: () => void
}

export type TurnHandoffGateOptions = {
	activeGameId: number | null
	controller: GameSessionController
	inactiveEventStream: InactiveEventStreamForGate
	sessionStatus: GameSessionViewState['status']
	turn: TurnHandoffGateTurn
}

export type TurnHandoffGate = {
	currentActiveTurnKey: string | null
	acknowledgementPending: boolean
	inactiveEventWindowVisible: boolean
	controlsLocked: boolean
	screenLocked: boolean
	acknowledgeCurrentTurn: () => void
}

const REMOTE_ABORT_MESSAGE = 'The game was aborted because a client reported an invalid snapshot.'

export function useTurnHandoffGate({
	activeGameId,
	controller,
	inactiveEventStream,
	sessionStatus,
	turn,
}: TurnHandoffGateOptions): TurnHandoffGate {
	const [acknowledgedActiveTurnKey, setAcknowledgedActiveTurnKey] = useState<string | null>(null)

	const currentActiveTurnKey = buildAcknowledgementTurnKey({
		activeGameId,
		currentTurnNumber: turn.number,
		sessionRole: turn.role,
		sessionTurnActive: turn.isKnown && turn.isActive,
	})
	const acknowledgementPending =
		currentActiveTurnKey !== null && acknowledgedActiveTurnKey !== currentActiveTurnKey
	const inactiveEventWindowVisible =
		turn.isLifecycleActive && turn.isKnown && (!turn.isActive || acknowledgementPending)
	const controlsLocked = !turn.isLifecycleActive || inactiveEventWindowVisible
	const screenLocked = turn.isLifecycleActive && acknowledgementPending

	const acknowledgeCurrentTurn = useCallback(() => {
		inactiveEventStream.clearEntries()
		setAcknowledgedActiveTurnKey(currentActiveTurnKey)
	}, [currentActiveTurnKey, inactiveEventStream])

	const hasRemoteGameAbort = inactiveEventStream.entries.some((entry) => entry.type === 'GAME_ABORTED')
	useEffect(() => {
		if (!hasRemoteGameAbort || activeGameId === null || sessionStatus === 'aborted') {
			return
		}

		controller.abort(REMOTE_ABORT_MESSAGE)
	}, [activeGameId, controller, hasRemoteGameAbort, sessionStatus])

	return {
		currentActiveTurnKey,
		acknowledgementPending,
		inactiveEventWindowVisible,
		controlsLocked,
		screenLocked,
		acknowledgeCurrentTurn,
	}
}