import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import logger from '#server/logger'
import { MatchManagementError } from '#server/db/adapter'
import { verifyUserId } from '#server/api/auth'
import { loadScenario } from '#server/api/gameHelpers/scenario'
import { parseGameId } from '#server/api/gameHelpers/ids'
import type { EventEnvelope } from '#shared/types/index'
import type { GameRouteContext } from './context.js'

/**
 * Registers current-game, history, open-game, archive, restore, and delete routes.
 *
 * @param app Fastify instance receiving the routes.
 * @param context Shared database, scenario, connection, and broadcast dependencies.
 * @returns A promise that resolves after the routes are registered.
 * @remarks Delete remains responsible for its cross-boundary GAME_DELETED broadcast and socket shutdown.
 */
export async function registerLobbyRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db, scenariosDir, liveConnections, broadcastGameEvents } = context

  /** List active games for the authenticated participant. */
  app.get('/', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const games = (await db.listMatches({ participantUserId: userId, completion: 'active' }))
        .filter((game) => game.status !== 'completed' && game.status !== 'archived')
      const scenarioIds = Array.from(new Set(games.map((game) => game.scenarioId)))
      const scenarioMap: Record<string, string> = {}
      for (const scenarioId of scenarioIds) {
        const scenario = await loadScenario(scenarioId, scenariosDir)
        if (scenario === null) {
          logger.error({ scenarioId }, 'Required game scenario could not be loaded')
          return reply.status(500).send({ ok: false, error: 'Required game scenario could not be loaded', code: 'INTERNAL_ERROR' })
        }
        scenarioMap[scenarioId] = scenario.displayName ?? scenario.name ?? scenarioId
      }
      const usernames = await db.findUsernamesByIds(Array.from(new Set(games.flatMap((game) => [game.hostUserId, game.players.onion, game.players.defender].filter((id): id is string => id !== null)))))
      return reply.send({ games: games.map((game) => ({
        gameId: game.gameId,
        scenarioId: game.scenarioId,
        scenarioDisplayName: scenarioMap[game.scenarioId],
        phase: game.phase,
        turnNumber: game.turnNumber,
        winner: game.winner,
        status: game.status,
        ready: game.status === 'ready' || game.status === 'active',
        hostUserId: game.hostUserId,
        hostUsername: usernames[game.hostUserId] ?? null,
        canDelete: game.hostUserId === userId,
        createdAt: game.createdAt ?? null,
        lastActivityAt: game.lastActivityAt ?? game.createdAt ?? null,
        completedAt: game.completedAt ?? null,
        role: game.players.onion === userId ? 'onion' : 'defender',
      })) })
    } catch (err) {
      logger.error({ err }, 'Error listing games')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  const GameHistoryQuerySchema = z.object({
    status: z.enum(['all', 'completed', 'archived']).default('all'),
    creator: z.enum(['any', 'me']).default('any'),
    createdAfter: z.string().datetime({ offset: true }).optional(),
    createdBefore: z.string().datetime({ offset: true }).optional(),
    lastActivityAfter: z.string().datetime({ offset: true }).optional(),
    lastActivityBefore: z.string().datetime({ offset: true }).optional(),
  })

  /** List completed and archived games for the authenticated participant. */
  app.get('/history', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const parsedQuery = GameHistoryQuerySchema.safeParse(req.query)
      if (!parsedQuery.success) {
        return reply.status(400).send({ ok: false, error: 'Invalid history filter', code: 'INVALID_INPUT' })
      }
      const { status, creator, createdAfter, createdBefore, lastActivityAfter, lastActivityBefore } = parsedQuery.data
      const games = (await db.listMatches({
        participantUserId: userId,
        completion: 'history',
        creatorUserId: creator === 'me' ? userId : undefined,
        createdAfter,
        createdBefore,
        lastActivityAfter,
        lastActivityBefore,
      }))
        .filter((game) => status === 'all' || game.status === status)
        .sort((left, right) => (right.lastActivityAt ?? right.createdAt ?? '').localeCompare(left.lastActivityAt ?? left.createdAt ?? ''))
      const scenarioIds = Array.from(new Set(games.map((game) => game.scenarioId)))
      const scenarioMap: Record<string, string> = {}
      for (const scenarioId of scenarioIds) {
        const scenario = await loadScenario(scenarioId, scenariosDir)
        if (scenario === null) {
          logger.error({ scenarioId }, 'Required game scenario could not be loaded')
          return reply.status(500).send({ ok: false, error: 'Required game scenario could not be loaded', code: 'INTERNAL_ERROR' })
        }
        scenarioMap[scenarioId] = scenario.displayName ?? scenario.name ?? scenarioId
      }
      const usernames = await db.findUsernamesByIds(Array.from(new Set(games.flatMap((game) => [game.players.onion, game.players.defender].filter((id): id is string => id !== null)))))
      return reply.send({ games: games.map((game) => ({
        gameId: game.gameId,
        scenarioId: game.scenarioId,
        scenarioDisplayName: scenarioMap[game.scenarioId],
        phase: game.phase,
        turnNumber: game.turnNumber,
        winner: game.winner,
        status: game.status,
        createdAt: game.createdAt ?? null,
        lastActivityAt: game.lastActivityAt ?? game.createdAt ?? null,
        completedAt: game.completedAt ?? null,
        hostUserId: game.hostUserId,
        canDelete: game.hostUserId === userId,
        players: game.players,
        playerUsernames: {
          onion: game.players.onion === null ? null : usernames[game.players.onion] ?? null,
          defender: game.players.defender === null ? null : usernames[game.players.defender] ?? null,
        },
        role: game.players.onion === userId ? 'onion' : 'defender',
      })) })
    } catch (err) {
      logger.error({ err }, 'Error listing game history')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /** Archive a completed game owned by the authenticated user. */
  app.patch<{ Params: { id: string } }>('/:id/archive', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const gameId = parseGameId(req.params.id)
      if (gameId === null) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      await db.archiveMatch(gameId, userId)
      return reply.send({ gameId, status: 'archived' })
    } catch (err) {
      if (err instanceof MatchManagementError) {
        const status = err.code === 'MATCH_NOT_FOUND' ? 404 : err.code === 'NOT_CREATOR' ? 403 : 409
        const code = err.code === 'MATCH_NOT_FOUND' ? 'NOT_FOUND' : err.code
        return reply.status(status).send({ ok: false, error: err.message, code })
      }
      logger.error({ err }, 'Error archiving game')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /** Restore an archived game owned by the authenticated user. */
  app.patch<{ Params: { id: string } }>('/:id/restore', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const gameId = parseGameId(req.params.id)
      if (gameId === null) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      await db.restoreMatch(gameId, userId)
      return reply.send({ gameId, status: 'completed' })
    } catch (err) {
      if (err instanceof MatchManagementError) {
        const status = err.code === 'MATCH_NOT_FOUND' ? 404 : err.code === 'NOT_CREATOR' ? 403 : 409
        const code = err.code === 'MATCH_NOT_FOUND' ? 'NOT_FOUND' : err.code
        return reply.status(status).send({ ok: false, error: err.message, code })
      }
      logger.error({ err }, 'Error restoring game')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /** Permanently delete a game owned by the authenticated creator. */
  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const gameId = parseGameId(req.params.id)
      if (gameId === null) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      await db.deleteMatch(gameId, userId)

      const deletedEvent: EventEnvelope = {
        seq: 0,
        type: 'GAME_DELETED',
        timestamp: new Date().toISOString(),
        causeId: String(req.id),
        gameId,
        deletedBy: userId,
      }
      broadcastGameEvents(gameId, [deletedEvent])
      const sockets = liveConnections.get(gameId)
      if (sockets !== undefined) {
        for (const socket of sockets) {
          if (socket.readyState === 1) socket.close(1000, 'Game deleted')
        }
        liveConnections.delete(gameId)
      }
      return reply.send({ gameId, deleted: true })
    } catch (err) {
      if (err instanceof MatchManagementError) {
        const status = err.code === 'MATCH_NOT_FOUND' ? 404 : err.code === 'NOT_CREATOR' ? 403 : 409
        const code = err.code === 'MATCH_NOT_FOUND' ? 'NOT_FOUND' : err.code
        return reply.status(status).send({ ok: false, error: err.message, code })
      }
      logger.error({ err }, 'Error deleting game')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /** List unfinished games with one available player slot. */
  app.get('/open', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const games = await db.listMatches({
        excludeParticipantUserId: userId,
        completion: 'active',
        availability: 'open',
      })
      const scenarioIds = Array.from(new Set(games.map((game) => game.scenarioId)))
      const scenarioMap: Record<string, string> = {}
      for (const scenarioId of scenarioIds) {
        const scenario = await loadScenario(scenarioId, scenariosDir)
        if (scenario === null) {
          logger.error({ scenarioId }, 'Required game scenario could not be loaded')
          return reply.status(500).send({ ok: false, error: 'Required game scenario could not be loaded', code: 'INTERNAL_ERROR' })
        }
        scenarioMap[scenarioId] = scenario.displayName ?? scenario.name ?? scenarioId
      }
      const usernames = await db.findUsernamesByIds(Array.from(new Set(games.map((game) => game.hostUserId))))
      return reply.send({ games: games.map((game) => ({
        gameId: game.gameId,
        scenarioId: game.scenarioId,
        scenarioDisplayName: scenarioMap[game.scenarioId],
        creatorRole: game.players.onion === null ? 'defender' : 'onion',
        creatorUsername: usernames[game.hostUserId] ?? null,
        openRole: game.players.onion === null ? 'onion' : 'defender',
      })) })
    } catch (err) {
      logger.error({ err }, 'Error listing open games')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
