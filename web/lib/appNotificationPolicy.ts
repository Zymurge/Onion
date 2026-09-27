import { useCallback, useEffect, useRef, useState } from 'react'

import type { GameClientSeamError, ServerGameSnapshot } from './gameClient'
import type { PlayerConnectionStatus, PlayerPresence } from '../../shared/websocketProtocol.js'

/** Inputs used to derive visible errors and terminal game notifications. */
export type AppNotificationPolicyOptions = {
	activeGameId: number | null
	actionError: string | null
	sessionError: GameClientSeamError | null
	snapshot: ServerGameSnapshot | null
	snapshotError?: string | null
	presence?: PlayerPresence | null
	localRole?: 'onion' | 'defender' | null
}

/**
 * Notification state and dismissal commands consumed by the overlay layer.
 * Snapshot validation errors are deliberately exposed as non-dismissible.
 */
export type AppNotificationPolicy = {
	actionError: string | null
	shouldShowActionError: boolean
	sessionError: GameClientSeamError | null
	sessionErrorKey: string | null
	shouldShowSessionError: boolean
	dismissSessionError: () => void
	sessionWinner: NonNullable<ServerGameSnapshot['winner']> | null
	sessionWinnerToastKey: string | null
	shouldShowGameOverToast: boolean
	dismissGameOverToast: () => void
	playerPresenceNotification: { role: 'onion' | 'defender'; status: PlayerConnectionStatus } | null
	dismissPlayerPresenceNotification: () => void
	snapshotError: string | null
	snapshotErrorDismissible: false
	shouldShowSnapshotError: boolean
}

type StoredPresenceNotification = {
	gameId: number
	role: 'onion' | 'defender'
	status: PlayerConnectionStatus
}

function buildSessionErrorKey(activeGameId: number | null, sessionError: GameClientSeamError | null): string | null {
	if (sessionError === null) {
		return null
	}

	return `${activeGameId ?? 'unknown'}:${sessionError.kind}:${sessionError.status ?? ''}:${sessionError.message}`
}

/**
 * Applies notification precedence and per-game dismissal semantics.
 * Action errors suppress recoverable session errors while terminal snapshot
 * errors remain visible for the lifetime of the invalid session.
 */
export function useAppNotificationPolicy({
	activeGameId,
	actionError,
	sessionError,
	snapshot,
	snapshotError = null,
	presence = null,
	localRole = null,
}: AppNotificationPolicyOptions): AppNotificationPolicy {
	const [dismissedSessionErrorKey, setDismissedSessionErrorKey] = useState<string | null>(null)
	const [dismissedGameOverToastKey, setDismissedGameOverToastKey] = useState<string | null>(null)
	const [storedPresenceNotification, setStoredPresenceNotification] = useState<StoredPresenceNotification | null>(null)
	const previousOpponentPresence = useRef<{ gameId: number; role: 'onion' | 'defender'; status: PlayerConnectionStatus } | null>(null)

	const sessionErrorKey = buildSessionErrorKey(activeGameId, sessionError)
	const sessionWinner = snapshot?.winner ?? null
	const sessionWinnerToastKey = snapshot === null ? null : `${snapshot.gameId}:${snapshot.lastEventSeq}`

	useEffect(() => {
		return () => {
			if (sessionErrorKey !== null) {
				setDismissedSessionErrorKey(null)
			}
		}
	}, [sessionErrorKey])

	const dismissSessionError = useCallback(() => {
		if (sessionError !== null && sessionErrorKey !== null) {
			setDismissedSessionErrorKey(sessionErrorKey)
		}
	}, [sessionError, sessionErrorKey])

	const dismissGameOverToast = useCallback(() => {
		if (sessionWinnerToastKey !== null) {
			setDismissedGameOverToastKey(sessionWinnerToastKey)
		}
	}, [sessionWinnerToastKey])

	const opponentRole = localRole === null ? null : localRole === 'onion' ? 'defender' : 'onion'
	const opponentStatus = opponentRole === null || presence === null ? null : presence[opponentRole]

	useEffect(() => {
		if (activeGameId === null || opponentRole === null || presence === null) {
			previousOpponentPresence.current = null
			return
		}

		const observedStatus: PlayerConnectionStatus = opponentStatus === 'connected' ? 'connected' : 'disconnected'
		const previous = previousOpponentPresence.current
		if (previous !== null && previous.gameId === activeGameId && previous.role === opponentRole && previous.status !== observedStatus) {
			setStoredPresenceNotification({ gameId: activeGameId, role: opponentRole, status: observedStatus })
		}
		previousOpponentPresence.current = { gameId: activeGameId, role: opponentRole, status: observedStatus }
	}, [activeGameId, opponentRole, opponentStatus, presence])

	const dismissPlayerPresenceNotification = useCallback(() => {
		setStoredPresenceNotification(null)
	}, [])

	const playerPresenceNotification = storedPresenceNotification !== null
		&& storedPresenceNotification.gameId === activeGameId
		&& storedPresenceNotification.role === opponentRole
		? { role: storedPresenceNotification.role, status: storedPresenceNotification.status }
		: null

	return {
		actionError,
		shouldShowActionError: actionError !== null,
		sessionError,
		sessionErrorKey,
		shouldShowSessionError: actionError === null
			&& sessionErrorKey !== null
			&& dismissedSessionErrorKey !== sessionErrorKey,
		dismissSessionError,
		sessionWinner,
		sessionWinnerToastKey,
		shouldShowGameOverToast: sessionWinner !== null && sessionWinnerToastKey !== null && dismissedGameOverToastKey !== sessionWinnerToastKey,
		dismissGameOverToast,
		playerPresenceNotification,
		dismissPlayerPresenceNotification,
		snapshotError,
		snapshotErrorDismissible: false,
		shouldShowSnapshotError: snapshotError !== null,
	}
}