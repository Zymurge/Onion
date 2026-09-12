import { useEffect, useRef } from 'react'

import type { ClientDiagnosticReport, ServerGameSnapshot } from './gameClient'
import type { GameSessionController, GameSessionViewState } from './gameSessionTypes'
import logger from './logger'
import type { SessionBinding } from './sessionBinding'

export type ClientDiagnosticsReporterOptions = {
	binding: SessionBinding | null
	controller: GameSessionController
	sessionState: GameSessionViewState
	snapshotError: string | null
}

function buildSnapshotContext(snapshot: ServerGameSnapshot) {
	return {
		gameId: snapshot.gameId,
		scenarioName: snapshot.scenarioName,
		phase: snapshot.phase,
		turnNumber: snapshot.turnNumber ?? 0,
		lastEventSeq: snapshot.lastEventSeq,
	}
}

function buildClientContext() {
	return {
		build: 'web-client',
		userAgent: navigator.userAgent,
	}
}

export function useClientDiagnosticsReporter({
	binding,
	controller,
	sessionState,
	snapshotError,
}: ClientDiagnosticsReporterOptions): void {
	const reportedSessionDiagnosticGameIdRef = useRef<number | null>(null)
	const reportedSnapshotDiagnosticGameIdRef = useRef<number | null>(null)

	useEffect(() => {
		const reportDiagnostic = binding?.requestTransport.reportDiagnostic
		const snapshot = sessionState.snapshot
		const gameId = binding?.gameId
		if (reportDiagnostic === undefined || snapshot === null || gameId === undefined || sessionState.status !== 'ready') {
			return
		}

		if (reportedSessionDiagnosticGameIdRef.current === gameId) {
			return
		}

		reportedSessionDiagnosticGameIdRef.current = gameId
		const diagnostic: ClientDiagnosticReport = {
			reportId: crypto.randomUUID(),
			code: 'CLIENT_SESSION_READY',
			message: 'Client loaded an authoritative game snapshot',
			snapshot: buildSnapshotContext(snapshot),
			client: buildClientContext(),
			protocolTraffic: [],
		}

		void reportDiagnostic(gameId, diagnostic).catch((error: unknown) => {
			logger.warn('[app] client diagnostic report failed', {
				gameId,
				reportId: diagnostic.reportId,
				error,
			})
		})
	}, [binding, sessionState.snapshot, sessionState.status])

	useEffect(() => {
		const reportDiagnostic = binding?.requestTransport.reportDiagnostic
		const snapshot = sessionState.snapshot
		const gameId = binding?.gameId
		if (snapshotError === null || snapshot === null || gameId === undefined || sessionState.status !== 'ready') {
			return
		}

		if (reportedSnapshotDiagnosticGameIdRef.current === gameId) {
			return
		}

		reportedSnapshotDiagnosticGameIdRef.current = gameId
		controller.abort(snapshotError)
		if (reportDiagnostic === undefined) {
			return
		}

		const diagnostic: ClientDiagnosticReport = {
			reportId: crypto.randomUUID(),
			code: 'SNAPSHOT_INVALID',
			path: 'authoritativeState',
			refreshAttempt: 0,
			message: snapshotError,
			snapshot: buildSnapshotContext(snapshot),
			client: buildClientContext(),
			protocolTraffic: [],
		}

		void reportDiagnostic(gameId, diagnostic).catch((error: unknown) => {
			logger.warn('[app] invalid snapshot diagnostic report failed', {
				gameId,
				reportId: diagnostic.reportId,
				error,
			})
		})
	}, [binding, controller, sessionState.snapshot, sessionState.status, snapshotError])
}