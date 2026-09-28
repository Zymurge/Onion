import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import logger from '#server/logger'
import { MatchJoinError, MatchStartError } from '#server/db/adapter'
import { verifyUserId } from '#server/api/auth'
import type { PlayerRole, GameState } from '#shared/types/index'
import { normalizeInitialStateToGameState } from '#server/engine/scenarioNormalizer'
import {
  assertScenarioStateFitsMap,
  getScenarioMapSnapshot,
  loadScenario,
  ScenarioValidationError,
} from '#server/api/gameHelpers/scenario'
import { parseGameId } from '#server/api/gameHelpers/ids'
import type { GameRouteContext } from './context.js'

const CreateGameSchema = z.object({
  scenarioId: z.string().min(1),
  role: z.enum(['onion', 'defender']),
})

/**
 * Registers game creation and player lifecycle routes.
 *
 * @param app Fastify instance receiving the routes.
 * @param context Shared database, scenario, and broadcast dependencies.
 * @returns A promise that resolves after the routes are registered.
 * @remarks Handlers validate and persist lifecycle transitions; they do not own route-wide mutable state.
 */
export async function registerLifecycleRoutes(app: FastifyInstance, context: GameRouteContext): Promise<void> {
  const { db, scenariosDir, broadcastGameEvents } = context

  /**
   * Create a new game match.
   *
   * @route POST /games
   */
  app.post<{ Body: { scenarioId: string, role: PlayerRole } }>('/', async (req, reply) => {
    try {
      const parsed = CreateGameSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
      }
      const { scenarioId, role } = parsed.data
      logger.info({ scenarioId, role }, 'Creating new game match')
      logger.debug({ scenarioId, role, body: req.body }, 'Game creation request body')
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      logger.debug({ userId }, 'User ID extracted for game creation')
      let scenarioSnapshot
      try {
        scenarioSnapshot = await loadScenario(scenarioId, scenariosDir)
      } catch (err) {
        if (err instanceof ScenarioValidationError) {
          logger.error({ err, scenarioId }, 'Invalid scenario definition')
          return reply.status(400).send({ ok: false, error: 'Invalid scenario', code: 'INVALID_SCENARIO' })
        }
        throw err
      }

      if (!scenarioSnapshot) {
        logger.warn({ scenarioId }, 'Scenario not found')
        return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
      }

      let state: GameState
      try {
        const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
        state = normalizeInitialStateToGameState(scenarioSnapshot.initialState)
        assertScenarioStateFitsMap(scenarioMap, scenarioSnapshot, state)
        logger.debug({ state }, 'Parsed and normalized initial game state')
      } catch (err) {
        logger.error({ err, scenarioId }, 'Invalid scenario initial state')
        return reply.status(400).send({ ok: false, error: 'Invalid scenario', code: 'INVALID_SCENARIO' })
      }
      const players: { onion: string | null; defender: string | null } = {
        onion: null,
        defender: null,
      }
      players[role] = userId

      const created = await db.createMatch({
        scenarioId,
        scenarioSnapshot,
        hostUserId: userId,
        state,
        players,
        status: 'waiting',
        phase: 'ONION_MOVE',
        turnNumber: 1,
        winner: null,
        events: [],
      })
      return reply.status(201).send({ gameId: created.gameId, role })
    } catch (err) {
      logger.warn({ err }, '500 error during game creation')
      logger.debug({ err, reqBody: req.body }, 'Troubleshooting info for game creation 500')
      logger.error({ err }, 'Failed to create game match')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /**
   * Join an existing game match.
   *
   * @route POST /games/:id/join
   */
  app.post<{ Params: { id: string } }>('/:id/join', async (req, reply) => {
    try {
      logger.info({ id: req.params.id }, 'User joining game')
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      logger.debug({ userId }, 'User ID extracted for join')

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const causeId = String(req.id)
      try {
        const joined = await db.joinMatch(gameId, userId, causeId)
        broadcastGameEvents(gameId, [joined.event])
        logger.info({ gameId, role: joined.role }, 'User joined game')
        return reply.send({ gameId, role: joined.role })
      } catch (err) {
        if (err instanceof MatchJoinError) {
          const status = err.code === 'MATCH_NOT_FOUND' ? 404 : err.code === 'GAME_FULL' || err.code === 'GAME_NOT_READY' ? 409 : 400
          const code = err.code === 'MATCH_NOT_FOUND' ? 'NOT_FOUND' : err.code
          return reply.status(status).send({ ok: false, error: err.message, code })
        }
        throw err
      }
    } catch (err) {
      logger.error({ err }, 'Error joining game')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /**
   * Start a full game match.
   *
   * @route POST /games/:id/start
   */
  app.post<{ Params: { id: string } }>('/:id/start', async (req, reply) => {
    try {
      const userId = await verifyUserId(app, req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      try {
        const started = await db.startMatch(gameId, userId, String(req.id))
        broadcastGameEvents(gameId, [started.event])
        return reply.send({ gameId, status: 'active', event: started.event })
      } catch (err) {
        if (err instanceof MatchStartError) {
          const status = err.code === 'MATCH_NOT_FOUND' ? 404 : err.code === 'NOT_HOST' ? 403 : 409
          const code = err.code === 'MATCH_NOT_FOUND' ? 'NOT_FOUND' : err.code
          return reply.status(status).send({ ok: false, error: err.message, code })
        }
        throw err
      }
    } catch (err) {
      logger.error({ err }, 'Error starting game')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
