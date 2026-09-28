import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import logger from '#server/logger'
import { verifyUserId } from '#server/api/auth'
import { parseGameId } from '#server/api/gameHelpers/ids'
import type { EventEnvelope } from '#shared/types/index'
import type { GameRouteContext } from './context.js'

const ClientDiagnosticContextSchema = z.object({
  reportId: z.string().uuid(),
  message: z.string().min(1).max(4_000),
  snapshot: z.object({
    gameId: z.number().int().positive(),
    scenarioName: z.string().min(1).max(200),
    phase: z.string().min(1).max(100),
    turnNumber: z.number().int().min(0),
    lastEventSeq: z.number().int().min(0),
  }),
  client: z.object({
    build: z.string().min(1).max(200),
    userAgent: z.string().min(1).max(500),
  }),
  protocolTraffic: z.array(z.object({
    direction: z.enum(['request', 'response']),
    method: z.string().min(1).max(20),
    path: z.string().min(1).max(500),
    status: z.number().int().min(100).max(599),
  })).max(50),
})

const ClientDiagnosticSchema = z.discriminatedUnion('code', [
  ClientDiagnosticContextSchema.extend({
    code: z.literal('SNAPSHOT_INVALID'),
    path: z.string().min(1).max(500),
    refreshAttempt: z.number().int().min(0).max(3),
  }),
  ClientDiagnosticContextSchema.extend({
    code: z.literal('CLIENT_SESSION_READY'),
  }),
])

/**
 * Registers the authenticated client snapshot diagnostic endpoint.
 *
 * @param app Fastify instance receiving the diagnostic route.
 * @param context Shared database and game-event broadcast dependencies.
 * @returns A promise that resolves after the diagnostic route is registered.
 * @remarks Invalid snapshot diagnostics append a terminal GAME_ABORTED event once per match.
 */
export async function registerDiagnosticRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db, broadcastGameEvents } = context

  app.post<{ Params: { id: string }; Body: unknown }>('/:id/client-diagnostics', async (req, reply) => {
    const userId = await verifyUserId(app, req.headers.authorization)
    if (!userId) {
      return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
    }

    const gameId = parseGameId(req.params.id)
    if (gameId === null) {
      return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
    }

    const match = await db.findMatch(gameId)
    if (!match) {
      return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
    }

    if (userId !== match.players.onion && userId !== match.players.defender) {
      return reply.status(403).send({ ok: false, error: 'Forbidden', code: 'FORBIDDEN' })
    }

    const parsed = ClientDiagnosticSchema.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
    }

    const diagnostic = parsed.data
    logger.error({ gameId, reportId: diagnostic.reportId, diagnostic }, 'Client reported invalid game snapshot')
    if (diagnostic.code === 'SNAPSHOT_INVALID' && !match.events.some((event) => event.type === 'GAME_ABORTED')) {
      const event: EventEnvelope = {
        seq: (match.events.at(-1)?.seq ?? 0) + 1,
        type: 'GAME_ABORTED',
        timestamp: new Date().toISOString(),
        causeId: diagnostic.reportId,
        reason: diagnostic.message,
      }
      await db.appendEvents(gameId, [event])
      broadcastGameEvents(gameId, [event])
    }
    return reply.status(202).send({ ok: true, reportId: diagnostic.reportId })
  })
}
