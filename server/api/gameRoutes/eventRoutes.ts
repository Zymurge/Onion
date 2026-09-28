import type { FastifyInstance } from 'fastify'

import logger from '#server/logger'
import { verifyUserId } from '#server/api/auth'
import { parseGameId } from '#server/api/gameHelpers/ids'
import type { GameRouteContext } from './context.js'

/**
 * Registers the authenticated event-polling endpoint.
 *
 * @param app Fastify instance receiving the event route.
 * @param context Shared database dependency used to load persisted events.
 * @returns A promise that resolves after the event route is registered.
 * @remarks The after cursor is exclusive and defaults to zero when omitted.
 */
export async function registerEventRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db } = context

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/:id/events', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const match = await db.findMatch(gameId)
      if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

      if (match.players.onion !== userId && match.players.defender !== userId) {
        return reply.status(403).send({ ok: false, error: 'Forbidden', code: 'FORBIDDEN' })
      }

      const after = Number(req.query.after ?? 0)
      const events = await db.getEvents(match.gameId, after)
      return reply.send({ events })
    } catch (err) {
      logger.error({ err }, 'Error polling game events')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
