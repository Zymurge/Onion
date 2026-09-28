import type { FastifyInstance } from 'fastify'

import logger from '#server/logger'
import { verifyUserId } from '#server/api/auth'
import { buildGameStateResponse } from '#server/api/gameHelpers/stateProjection'
import { parseGameId } from '#server/api/gameHelpers/ids'
import { buildSessionInitPayload, parseWsMessage, serializeWsMessage } from '#server/api/gameHelpers/protocol'
import type {
  WebSocketServerErrorMessage,
  WebSocketServerEventMessage,
  WebSocketServerPresenceMessage,
  WebSocketServerSessionInitMessage,
  WebSocketServerSnapshotMessage,
} from '#shared/websocketProtocol'
import type { GameRouteContext } from './context.js'

/**
 * Registers the authenticated per-game WebSocket stream.
 *
 * @param app Fastify instance receiving the WebSocket route.
 * @param context Shared database, presence, broadcast, and connection dependencies.
 * @returns A promise that resolves after the WebSocket route is registered.
 * @remarks The stream sends session, snapshot, presence, and persisted event messages.
 */
export async function registerWebSocketRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db, removeLiveConnection, addLiveConnection } = context

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
}
