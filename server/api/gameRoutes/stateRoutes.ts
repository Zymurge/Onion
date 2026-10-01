import type { FastifyInstance } from 'fastify'

import logger from '#server/logger'
import { verifyUserId } from '#server/api/auth'
import { buildGameStateResponse } from '#server/api/gameHelpers/stateProjection'
import { parseGameId } from '#server/api/gameHelpers/ids'
import type { GameRouteContext } from './context.js'

/**
 * Registers the authenticated current-game state route.
 *
 * @param app Fastify instance receiving the route.
 * @param context Shared database dependency used to load the match.
 * @returns A promise that resolves after the route is registered.
 * @remarks Authorization is checked before projecting the persisted match state.
 */
export async function registerStateRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db } = context

  /** Fetch the current state for a participating user. */
  app.get<{ Params: { id: string }; Querystring: { sinceRevision?: string } }>('/:id', async (req, reply) => {
    try {
      logger.info({ id: req.params.id }, 'Fetching game state')
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      logger.debug({ userId }, 'User ID extracted for state fetch')

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const match = await db.findMatch(gameId)
      if (!match) {
        logger.warn({ id: req.params.id }, 'Game not found for state fetch')
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      if (match.players.onion !== userId && match.players.defender !== userId) {
        return reply.status(403).send({ ok: false, error: 'Forbidden', code: 'FORBIDDEN' })
      }

      const currentRevision = match.snapshotRevision ?? 0
      const rawSinceRevision = req.query.sinceRevision
      if (rawSinceRevision !== undefined) {
        const sinceRevision = Number(rawSinceRevision)
        if (!Number.isSafeInteger(sinceRevision) || sinceRevision < 0) {
          return reply.status(400).send({ ok: false, error: 'Invalid snapshot revision', code: 'INVALID_INPUT' })
        }
        if (sinceRevision > currentRevision) {
          return reply.status(409).send({
            ok: false,
            error: 'Snapshot revision is ahead of the server',
            code: 'STALE_REVISION',
            snapshotRevision: currentRevision,
            eventSeq: match.events.at(-1)?.seq ?? 0,
          })
        }
        if (sinceRevision > 0 && sinceRevision === currentRevision) {
          return reply.send({
            ok: true,
            unchanged: true,
            snapshotRevision: currentRevision,
            eventSeq: match.events.at(-1)?.seq ?? 0,
          })
        }
      }

      logger.debug({ gameId: match.gameId }, 'Game state fetched')
      const snapshot = buildGameStateResponse(match, userId)
      logger.debug({ gameId: match.gameId, snapshot }, 'Game state response')
      return reply.send(snapshot)
    } catch (err) {
      const errorInfo = {
        type: typeof err,
        isError: err instanceof Error,
        message: err && typeof err === 'object' && 'message' in err ? err.message : String(err),
        stack: err && typeof err === 'object' && 'stack' in err ? err.stack : undefined,
      }
      logger.warn({ message: errorInfo.message }, '500 error during game state fetch')
      logger.info({ params: req.params, user: await verifyUserId(app, req.headers.authorization) }, 'Request context for 500 error')
      logger.debug({ errorType: errorInfo.type, isError: errorInfo.isError, stack: errorInfo.stack, headers: req.headers }, 'Debug details for 500 error')

      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
