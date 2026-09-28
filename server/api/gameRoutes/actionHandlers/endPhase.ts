import logger from '#server/logger'
import { advancePhaseWithEvents } from '#server/engine/game'
import { buildActionResponse } from '#server/api/gameHelpers/actionResponses'
import { computeWinnerUserId } from '#server/api/gameHelpers/victory'
import { logSentEvents } from '#server/api/gameHelpers/logging'
import type { ActionHandlerContext, ActionHandlerResponse } from './types.js'

/**
 * Executes END_PHASE, persists phase advancement, broadcasts events, and builds the response.
 *
 * @param context Match, sequencing, persistence, broadcast, and event-adaptation dependencies.
 * @returns HTTP 200 response containing the advanced phase state and events.
 * @throws Errors from phase advancement or persistence for the dispatcher to classify.
 */
export async function handleEndPhase(context: ActionHandlerContext): Promise<ActionHandlerResponse> {
  const { db, match, causeId, expectedLastEventSeq, attachCauseId, broadcastGameEvents } = context
  logger.info({ gameId: match.gameId, phase: match.phase }, 'Advancing phase')
  const result = advancePhaseWithEvents(match)
  const newEvents = attachCauseId(result.newEvents, causeId)
  const winner = computeWinnerUserId(match, result.state, result.phase, result.turnNumber) ?? match.winner
  const status = winner !== null ? 'completed' : match.status

  await db.persistMatchProgress({
    gameId: match.gameId,
    expectedLastEventSeq,
    phase: result.phase,
    turnNumber: result.turnNumber,
    winner,
    status,
    state: result.state,
    events: newEvents,
  })

  const turnNumber = result.turnNumber
  const eventSeq = newEvents.at(-1)?.seq ?? 0
  logSentEvents(match.gameId, 'END_PHASE', newEvents)
  broadcastGameEvents(match.gameId, newEvents)
  logger.debug({ gameId: match.gameId, phase: match.phase, turnNumber }, 'Phase advanced')

  return {
    statusCode: 200,
    payload: buildActionResponse(match, result.state, result.phase, turnNumber, eventSeq, newEvents, status, winner),
  }
}
