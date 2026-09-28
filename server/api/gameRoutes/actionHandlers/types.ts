import type { MatchRecord } from '#server/db/adapter'
import type { GameRouteContext } from '../context.js'

/** Shared inputs supplied by the action dispatcher to one command handler. */
export type ActionHandlerContext = GameRouteContext & {
  match: MatchRecord
  causeId: string
  expectedLastEventSeq: number
  attachCauseId: (events: MatchRecord['events'], causeId: string) => MatchRecord['events']
}

/** HTTP-shaped result returned by a command handler to the action dispatcher. */
export type ActionHandlerResponse = {
  statusCode: number
  payload: unknown
}
