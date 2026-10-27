import { buildActionResponse } from '#server/api/gameHelpers/actionResponses'
import { logActionOutcome, logSentEvents } from '#server/api/gameHelpers/logging'
import type { EventEnvelope, GameState, TurnPhase } from '#shared/types/index'
import type { ActionHandlerContext, ActionHandlerResponse } from './types.js'

type FinalizeActionInput = {
  actionType: 'MOVE' | 'FIRE'
  state: GameState
  phase: TurnPhase
  turnNumber: number
  events: EventEnvelope[]
  status: import('#server/db/adapter').GameLifecycleStatus
  winner: string | null
  outcome: Record<string, unknown>
}

/**
 * Persists the completed MOVE or FIRE action and publishes its result.
 *
 * Action-specific validation, execution, event construction, and outcome data
 * remain in their command handlers; this helper owns only the shared boundary
 * after execution has succeeded.
 */
export async function finalizeAction(
  context: ActionHandlerContext,
  input: FinalizeActionInput,
): Promise<ActionHandlerResponse> {
  const { db, match, causeId, expectedLastEventSeq, attachCauseId, broadcastGameEvents } = context
  const newEvents = attachCauseId(input.events, causeId)

  await db.persistMatchProgress({
    gameId: match.gameId,
    expectedLastEventSeq,
    phase: input.phase,
    turnNumber: input.turnNumber,
    winner: input.winner,
    status: input.status,
    state: input.state,
    events: newEvents,
  })

  const eventSeq = newEvents.at(-1)?.seq ?? match.events.at(-1)?.seq ?? 0
  logSentEvents(match.gameId, input.actionType, newEvents)
  logActionOutcome(match.gameId, input.actionType, input.outcome, newEvents)
  broadcastGameEvents(match.gameId, newEvents)

  return {
    statusCode: 200,
    payload: buildActionResponse(
      match,
      input.state,
      input.phase,
      input.turnNumber,
      eventSeq,
      newEvents,
      input.status,
      input.winner,
    ),
  }
}
