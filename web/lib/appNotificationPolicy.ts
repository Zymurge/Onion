import { useCallback, useState } from 'react'

import type { GameClientSeamError, ServerGameSnapshot } from './gameClient'

export type AppNotificationPolicyOptions = {
	activeGameId: number | null
	actionError: string | null
	sessionError: GameClientSeamError | null
	snapshot: ServerGameSnapshot | null
	snapshotError?: string | null
}

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

type DismissedSessionError = {
	error: GameClientSeamError
	key: string
}

function buildSessionErrorKey(activeGameId: number | null, sessionError: GameClientSeamError | null): string | null {
	if (sessionError === null) {
		return null
	}

	return `${activeGameId ?? 'unknown'}:${sessionError.kind}:${sessionError.status ?? ''}:${sessionError.message}`
}

export function useAppNotificationPolicy({
	activeGameId,
	actionError,
	sessionError,
	snapshot,
	snapshotError = null,
}: AppNotificationPolicyOptions): AppNotificationPolicy {
	const [dismissedSessionError, setDismissedSessionError] = useState<DismissedSessionError | null>(null)
	const [dismissedGameOverToastKey, setDismissedGameOverToastKey] = useState<string | null>(null)

	const sessionErrorKey = buildSessionErrorKey(activeGameId, sessionError)
	const sessionWinner = snapshot?.winner ?? null
	const sessionWinnerToastKey = snapshot === null ? null : `${snapshot.gameId}:${snapshot.lastEventSeq}`

	const dismissSessionError = useCallback(() => {
		if (sessionError !== null && sessionErrorKey !== null) {
			setDismissedSessionError({ error: sessionError, key: sessionErrorKey })
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
			&& (dismissedSessionError === null
				|| dismissedSessionError.key !== sessionErrorKey
				|| dismissedSessionError.error !== sessionError),
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