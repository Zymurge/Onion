import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import logger from '#server/logger'
import { z } from 'zod'

import type { EventEnvelope } from '#shared/types/index'
import { createGameRouteContext, type GameRouteOptions } from '#server/api/gameRoutes/context'
import { registerLifecycleRoutes } from '#server/api/gameRoutes/lifecycleRoutes'
import { registerLobbyRoutes } from '#server/api/gameRoutes/lobbyRoutes'
import { registerStateRoutes } from '#server/api/gameRoutes/stateRoutes'
import { registerActionRoutes } from '#server/api/gameRoutes/actionRoutes'
import {
  buildGameStateResponse,
  buildSessionInitPayload,
  parseGameId,
  parseWsMessage,
  serializeWsMessage,
} from '#server/api/gamesHelpers'
import { verifyUserId } from '#server/api/auth'
import type {
  WebSocketServerErrorMessage,
  WebSocketServerEventMessage,
  WebSocketServerPresenceMessage,
  WebSocketServerSessionInitMessage,
  WebSocketServerSnapshotMessage,
} from '#shared/websocketProtocol'

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
 * Game management routes for creating, joining, and playing matches.
 *
 * Provides REST endpoints for the full game lifecycle including match creation,
 * player joining, state queries, action submission, and event polling.
 * All operations require authentication via Bearer token.
 *
 * @param app - Fastify application instance
 * @param opts - Plugin options containing the database adapter
 */
export const gameRoutes: FastifyPluginAsync<GameRouteOptions> = async (app: FastifyInstance, opts) => {
  const routeContext = createGameRouteContext(opts)
  await registerLifecycleRoutes(app, routeContext)
  await registerLobbyRoutes(app, routeContext)
  await registerStateRoutes(app, routeContext)
  const { db, broadcastGameEvents, removeLiveConnection, addLiveConnection } = routeContext

  app.get<{ Params: { id: string }; Querystring: { after?: string; token?: string } }>(
    '/:id/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const userId = await verifyUserId(app, req.headers.authorization, req.query.token)
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

        if (match.players.onion !== userId && match.players.defender !== userId) {
          return reply.status(403).send({ ok: false, error: 'Forbidden', code: 'FORBIDDEN' })
        }
      },
    },
    (socket, req) => {
      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        socket.close()
        return
      }

      socket.on('close', () => {
        removeLiveConnection(gameId, socket)
      })

      socket.on('message', async (rawMessage: string | Buffer) => {
        const parsed = parseWsMessage(rawMessage.toString())
        if (parsed === null) {
          const errorMessage: WebSocketServerErrorMessage = {
            kind: 'ERROR',
            message: 'Malformed websocket message',
            code: 'INVALID_MESSAGE',
          }
          socket.send(serializeWsMessage(errorMessage))
          return
        }

        if (parsed.kind === 'COMMAND') {
          const errorMessage: WebSocketServerErrorMessage = {
            kind: 'ERROR',
            message: 'WebSocket command handling is not wired yet; use REST actions for now.',
            code: 'NOT_IMPLEMENTED',
          }
          socket.send(serializeWsMessage(errorMessage))
          return
        }

        if (parsed.kind === 'RESUME') {
          try {
            const events = await db.getEvents(gameId, parsed.afterSeq)
            for (const event of events) {
              const eventMessage: WebSocketServerEventMessage = { kind: 'EVENT', event }
              try {
                const serialized = serializeWsMessage(eventMessage)
                logger.debug({ gameId, serialized, eventSeq: event.seq }, 'WS RESUME EVENT sent')
                socket.send(serialized)
              } catch (err) {
                logger.warn({ gameId, err, eventSeq: event.seq }, 'Failed to send WS RESUME EVENT')
              }
            }
          } catch (err) {
            logger.error(
              { gameId, afterSeq: parsed.afterSeq, err },
              'Failed to resume websocket stream',
            )
            const errorMessage: WebSocketServerErrorMessage = {
              kind: 'ERROR',
              message: 'Failed to resume websocket stream',
              code: 'RESUME_FAILED',
            }
            socket.send(serializeWsMessage(errorMessage))
          }
        }
      })

      void (async () => {
        try {
          const userId = await verifyUserId(app, req.headers.authorization, req.query.token)
          if (!userId) {
            socket.close()
            return
          }

          const match = await db.findMatch(gameId)
          if (!match) {
            socket.close()
            return
          }

          const presence = await addLiveConnection(gameId, userId, socket, match)

          const sessionInitMessage: WebSocketServerSessionInitMessage = {
            kind: 'SESSION_INIT',
            payload: buildSessionInitPayload(),
          }
          socket.send(serializeWsMessage(sessionInitMessage))

          const snapshotMessage: WebSocketServerSnapshotMessage = {
            kind: 'STATE_SNAPSHOT',
            snapshot: buildGameStateResponse(match, userId),
          }
          try {
            const serialized = serializeWsMessage(snapshotMessage)
            logger.debug({ gameId, serialized }, 'WS STATE_SNAPSHOT sent')
            socket.send(serialized)
          } catch (err) {
            logger.warn({ gameId, err }, 'Failed to send WS STATE_SNAPSHOT')
          }

          const presenceMessage: WebSocketServerPresenceMessage = {
            kind: 'PLAYER_PRESENCE',
            presence,
          }
          socket.send(serializeWsMessage(presenceMessage))
        } catch (err) {
          logger.error(
            { gameId, err },
            'Failed to initialize websocket stream',
          )
          const errorMessage: WebSocketServerErrorMessage = {
            kind: 'ERROR',
            message: 'Failed to initialize websocket stream',
            code: 'STREAM_INIT_FAILED',
          }
          socket.send(serializeWsMessage(errorMessage))
        }
      })()
    },
  )

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

  await registerActionRoutes(app, routeContext)

  /**
   * Poll for game events.
   *
   * Returns all events with sequence numbers greater than the specified 'after' parameter.
   * Used by clients to poll for updates. Defaults to after=0 if not specified.
   *
   * @route GET /games/:id/events?after={seq}
   * @query after - Return events after this sequence number (default: 0)
   * @returns { events: EventEnvelope[] } - 200 on success
   * @returns { ok: false, error: string, code: string } - 401 UNAUTHORIZED if no or invalid token
   *                                            404 NOT_FOUND if game does not exist
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
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
