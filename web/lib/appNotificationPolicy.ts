import { useCallback, useEffect, useState } from 'react'

import type { GameClientSeamError, ServerGameSnapshot } from './gameClient'

/** Inputs used to derive visible errors and terminal game notifications. */
export type AppNotificationPolicyOptions = {
	activeGameId: number | null
	actionError: string | null
	sessionError: GameClientSeamError | null
	snapshot: ServerGameSnapshot | null
	snapshotError?: string | null
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
	snapshotError: string | null
	snapshotErrorDismissible: false
	shouldShowSnapshotError: boolean
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
}: AppNotificationPolicyOptions): AppNotificationPolicy {
	const [dismissedSessionErrorKey, setDismissedSessionErrorKey] = useState<string | null>(null)
	const [dismissedGameOverToastKey, setDismissedGameOverToastKey] = useState<string | null>(null)

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
		snapshotError,
		snapshotErrorDismissible: false,
		shouldShowSnapshotError: snapshotError !== null,
	}
}