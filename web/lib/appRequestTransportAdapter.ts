import type { GameAction, GameClient } from './gameClient'
import logger from './logger'
import type { GameRequestTransport } from './gameSessionTypes'

export function createRequestTransportFromGameClient(
	gameClient: GameClient,
): GameRequestTransport {
	return {
		async getState(gameId: number) {
			const startedAt = Date.now()
			logger.debug('[app-debug] transport getState start', {
				ts: startedAt,
				gameId,
			})

			try {
				const result = await gameClient.getState(gameId)
				logger.debug('[app-debug] transport getState success', {
					durationMs: Date.now() - startedAt,
					ts: Date.now(),
					gameId,
					phase: result.snapshot.phase,
					lastEventSeq: result.snapshot.lastEventSeq,
					sessionRole: result.session.role,
				})
				return result
			} catch (error) {
				logger.warn('[app-debug] transport getState failure', {
					durationMs: Date.now() - startedAt,
					ts: Date.now(),
					gameId,
					error,
				})
				throw error
			}
		},
		async submitAction(gameId: number, action: GameAction) {
			const startedAt = Date.now()
			logger.debug('[app-debug] transport submitAction start', {
				ts: startedAt,
				action,
				gameId,
			})

			try {
				const result = await gameClient.submitAction(gameId, action)
				logger.debug('[app-debug] transport submitAction success', {
					ts: Date.now(),
					action,
					durationMs: Date.now() - startedAt,
					gameId,
					phase: result.phase,
					lastEventSeq: result.lastEventSeq,
					sessionRole: null,
				})
				return result
			} catch (error) {
				logger.warn('[app-debug] transport submitAction failure', {
					ts: Date.now(),
					action,
					durationMs: Date.now() - startedAt,
					gameId,
					error,
				})
				throw error
			}
		},
		async pollEvents(gameId: number, afterSeq: number) {
			const startedAt = Date.now()
			logger.debug('[app-debug] transport pollEvents start', {
				ts: startedAt,
				afterSeq,
				gameId,
			})

			try {
				const result = await gameClient.pollEvents(gameId, afterSeq)
				logger.debug('[app-debug] transport pollEvents success', {
					ts: Date.now(),
					afterSeq,
					durationMs: Date.now() - startedAt,
					gameId,
					eventCount: result.length,
					lastSeq: result.length > 0 ? result[result.length - 1]?.seq ?? null : null,
				})
				return result
			} catch (error) {
				logger.warn('[app-debug] transport pollEvents failure', {
					ts: Date.now(),
					afterSeq,
					durationMs: Date.now() - startedAt,
					gameId,
					error,
				})
				throw error
			}
		},
		...(gameClient.reportDiagnostic === undefined ? {} : { reportDiagnostic: gameClient.reportDiagnostic }),
	}
}