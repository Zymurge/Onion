import logger from '#server/logger'
import type { EventEnvelope } from '#shared/types/index'

/**
 * Logs the event sequence sent for an action without changing the events.
 *
 * @param gameId Match id associated with the events.
 * @param actionType Action or route operation that produced the events.
 * @param events Events being sent to clients.
 * @returns Nothing; logging is best-effort and has no effect on persistence.
 */
export function logSentEvents(gameId: number, actionType: string, events: EventEnvelope[]) {
  logger.debug(
    {
      gameId,
      actionType,
      eventCount: events.length,
      eventTypes: events.map((event) => event.type),
      events,
    },
    'Events sent',
  )
}

/**
 * Logs the outcome and emitted events for a MOVE or FIRE action.
 *
 * @param gameId Match id associated with the action.
 * @param actionType Executed action type.
 * @param outcome Engine outcome data suitable for structured logging.
 * @param events Events emitted by the action.
 * @returns Nothing; the function only forwards structured data to the logger.
 */
export function logActionOutcome(
  gameId: number,
  actionType: 'MOVE' | 'FIRE',
  outcome: Record<string, unknown>,
  events: EventEnvelope[],
): void {
  logger.info(
    {
      gameId,
      actionType,
      outcome,
      events,
    },
    `${actionType} resolved`,
  )
}