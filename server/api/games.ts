import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import logger from '#server/logger'
import type { WebSocket } from 'ws'
import { z } from 'zod'

import type { PlayerRole, Command, EventEnvelope, GameState } from '#shared/types/index'
import type { DbAdapter } from '#server/db/adapter'
import { StaleMatchStateError } from '#server/db/adapter'
import { phaseActor } from '#server/engine/phases'
import { advancePhaseWithEvents } from '#server/engine/game'
import { createMap } from '#server/engine/map'
import { validateUnitMovement, executeUnitMovement, validateCombatAction, executeCombatAction } from '#server/engine/index'
import { InitialStateSchema } from '#server/engine/scenarioSchema'
import { normalizeInitialStateToGameState } from '#server/engine/scenarioNormalizer'
import {
  assertScenarioStateFitsMap,
  buildCombatEvents,
  buildEngineState,
  buildGameStateResponse,
  buildMoveEvents,
  computeWinnerUserId,
  buildMovementRemainingByUnit,
  extractUserId,
  extractUserIdFromAuth,
  getScenarioMapSnapshot,
  logActionOutcome,
  logSentEvents,
  loadScenario,
  parseGameId,
  parseWsMessage,
  serializeWsMessage,
  type ScenarioSnapshot,
} from '#server/api/gamesHelpers'
import type {
  WebSocketClientMessage,
  WebSocketServerErrorMessage,
  WebSocketServerEventMessage,
  WebSocketServerSnapshotMessage,
} from '#shared/websocketProtocol'

const CreateGameSchema = z.object({
  scenarioId: z.string().min(1),
  role: z.enum(['onion', 'defender']),
})

const INITIAL_STATE: GameState = {
  onion: {
    position: { q: 0, r: 10 },
    treads: 45,
    missiles: 2,
    batteries: { main: 1, secondary: 4, ap: 8 },
  },
  defenders: {},
}

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
export const gameRoutes: FastifyPluginAsync<{ db: DbAdapter }> = async (app: FastifyInstance, opts) => {
  const { db } = opts
  const liveConnections = new Map<number, Set<WebSocket>>()

  function broadcastGameEvents(gameId: number, events: EventEnvelope[]) {
    const sockets = liveConnections.get(gameId)
    if (!sockets || sockets.size === 0) {
      return
    }

    for (const event of events) {
      const payload: WebSocketServerEventMessage = { kind: 'EVENT', event }
      const serialized = serializeWsMessage(payload)

      for (const socket of sockets) {
        if (socket.readyState === 1) {
          socket.send(serialized)
        }
      }
    }
  }

  function removeLiveConnection(gameId: number, socket: WebSocket) {
    const sockets = liveConnections.get(gameId)
    if (!sockets) {
      return
    }

    sockets.delete(socket)
    if (sockets.size === 0) {
      liveConnections.delete(gameId)
    }
  }

  function addLiveConnection(gameId: number, socket: WebSocket) {
    const sockets = liveConnections.get(gameId) ?? new Set<WebSocket>()
    sockets.add(socket)
    liveConnections.set(gameId, sockets)
  }

  /**
   * Create a new game match.
   *
   * @route POST /games
   * @body { scenarioId: string, role: PlayerRole }
   * @returns { gameId: number, role: PlayerRole } - 201 on success
   * @returns { ok: false, error: string, code: string } - 400 INVALID_INPUT, 404 NOT_FOUND, 500 INTERNAL_ERROR
   */
  app.post<{ Body: { scenarioId: string, role: PlayerRole } }>('/', async (req, reply) => {
    try {
      const parsed = CreateGameSchema.safeParse(req.body)
      if (!parsed.success) {
        return reply.status(400).send({ ok: false, error: 'Invalid input', code: 'INVALID_INPUT' })
      }
      const { scenarioId, role } = parsed.data
      logger.info({ scenarioId, role }, 'Creating new game match')
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      logger.debug({ userId }, 'User ID extracted for game creation')
      const scenarioSnapshot = await loadScenario(scenarioId) as ScenarioSnapshot | null
      if (!scenarioSnapshot) {
        logger.warn({ scenarioId }, 'Scenario not found')
        return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
      }
      const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
      let state: GameState
      if (scenarioSnapshot.initialState) {
        try {
          const parsedState = InitialStateSchema.parse(scenarioSnapshot.initialState)
          state = normalizeInitialStateToGameState(parsedState)
		  assertScenarioStateFitsMap(scenarioMap, scenarioSnapshot, state)
        } catch (err) {
          logger.error({ err }, 'Invalid scenario initialState')
          return reply.status(400).send({ ok: false, error: 'Invalid scenario initialState', code: 'INVALID_SCENARIO' })
        }
      } else {
        state = { ...INITIAL_STATE }
      }
      const players: { onion: string | null; defender: string | null } = {
        onion: null,
        defender: null,
      }
      players[role] = userId

      const created = await db.createMatch({
        scenarioId,
        scenarioSnapshot,
        state,
        players,
        phase: 'ONION_MOVE',
        turnNumber: 1,
        winner: null,
        events: [],
      })
      return reply.status(201).send({ gameId: created.gameId, role })
    } catch (err) {
      logger.error({ err }, 'Failed to create game match')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /**
   * Join an existing game match.
   *
   * Adds the authenticated user to an open player slot in the specified match.
   * Cannot join your own game or a game that's already full.
   *
   * @route POST /games/:id/join
  * @returns { gameId: number, role: string } - 200 on success
   * @returns { ok: false, error: string, code: string } - 400 CANNOT_JOIN_OWN_GAME if joining own game
   *                                            401 UNAUTHORIZED if no or invalid token
   *                                            404 NOT_FOUND if game does not exist
   *                                            409 GAME_FULL if game is already full
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.post<{ Params: { id: string } }>('/:id/join', async (req, reply) => {
    try {
      logger.info({ id: req.params.id }, 'User joining game')
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      logger.debug({ userId }, 'User ID extracted for join')

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const match = await db.findMatch(gameId)
      if (!match) {
        logger.warn({ id: req.params.id }, 'Game not found for join')
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      if (match.players.onion === userId || match.players.defender === userId) {
        logger.warn({ userId, gameId: match.gameId }, 'User tried to join own game')
        return reply.status(400).send({ ok: false, error: 'Cannot join your own game', code: 'CANNOT_JOIN_OWN_GAME' })
      }

      let role: PlayerRole
      const newPlayers = { ...match.players }
      if (!match.players.onion) {
        newPlayers.onion = userId
        role = 'onion'
      } else if (!match.players.defender) {
        newPlayers.defender = userId
        role = 'defender'
      } else {
        logger.warn({ gameId: match.gameId }, 'Game is already full')
        return reply.status(409).send({ ok: false, error: 'Game is already full', code: 'GAME_FULL' })
      }

      await db.updateMatchPlayers(match.gameId, newPlayers)
      logger.info({ gameId: match.gameId, role }, 'User joined game')

      // Emit PLAYER_JOINED event
      const seq = (match.events.at(-1)?.seq ?? 0) + 1
      const event = {
        seq,
        type: 'PLAYER_JOINED',
        timestamp: new Date().toISOString(),
        userId,
        role,
      }
      await db.appendEvents(match.gameId, [event])
      broadcastGameEvents(match.gameId, [event])
      logger.debug({ gameId: match.gameId, event }, 'PLAYER_JOINED event appended')

      return reply.send({ gameId: match.gameId, role })
    } catch (err) {
      logger.error({ err }, 'Error joining game')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /**
   * Get current game state.
   *
   * Returns the current state of the match including players, phase, turn number,
   * winner (if any), game state, and the sequence number of the last event.
   *
   * @route GET /games/:id
   * @returns Game state object - 200 on success
   * @returns { ok: false, error: string, code: string } - 401 UNAUTHORIZED if no or invalid token
   *                                            404 NOT_FOUND if game does not exist
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  /**
   * List all games the authenticated user participates in.
   *
   * @route GET /games
   * @returns Array of game summaries
   */
  app.get('/', async (req, reply) => {
    try {
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      const games = await db.listMatchesByUserId(userId)
      // Fetch scenario display names for all games
      const scenarioIds = Array.from(new Set(games.map((g) => g.scenarioId)))
      const scenarioMap: Record<string, string> = {}
      for (const scenarioId of scenarioIds) {
        const scenario = await loadScenario(scenarioId)
        scenarioMap[scenarioId] = (scenario as any)?.displayName ?? (scenario as any)?.name ?? scenarioId
      }
      return reply.send({ games: games.map((g) => ({
        gameId: g.gameId,
        scenarioId: g.scenarioId,
        scenarioDisplayName: scenarioMap[g.scenarioId],
        phase: g.phase,
        turnNumber: g.turnNumber,
        winner: g.winner,
        role: g.players.onion === userId ? 'onion' : 'defender',
      })) })
    } catch (err) {
      logger.error({ err }, 'Error listing games')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      logger.info({ id: req.params.id }, 'Fetching game state')
      const userId = extractUserId(req.headers.authorization)
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

      // Type assertion for scenarioSnapshot
      logger.debug({ gameId: match.gameId }, 'Game state fetched')
      return reply.send(buildGameStateResponse(match, userId))
    } catch (err) {
      logger.error({ err }, 'Error fetching game state')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  app.get<{ Params: { id: string }; Querystring: { after?: string; token?: string } }>(
    '/:id/ws',
    {
      websocket: true,
      preValidation: async (req, reply) => {
        const userId = extractUserIdFromAuth(req.headers.authorization, req.query.token)
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

      addLiveConnection(gameId, socket)

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
              socket.send(serializeWsMessage(eventMessage))
            }
          } catch (err) {
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
          const userId = extractUserIdFromAuth(req.headers.authorization, req.query.token)
          if (!userId) {
            socket.close()
            return
          }

          const match = await db.findMatch(gameId)
          if (!match) {
            socket.close()
            return
          }

          const snapshotMessage: WebSocketServerSnapshotMessage = {
            kind: 'STATE_SNAPSHOT',
            snapshot: buildGameStateResponse(match, userId),
          }
          socket.send(serializeWsMessage(snapshotMessage))
        } catch (err) {
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

  /**
   * Submit a game action.
   *
   * Executes the specified command if it's the player's turn and the command is valid.
   * Returns the updated game state and any events generated by the action.
  * Movement and combat commands are delegated to the engine and persisted as concrete events.
   *
   * @route POST /games/:id/actions
   * @body Command object (see types.ts)
   * @returns { ok: true, seq: number, events: EventEnvelope[], state: GameState } - 200 on success
   * @returns { ok: false, error: string, code: string, currentPhase: string } - 400 INVALID_INPUT for schema validation errors
   *                                            401 UNAUTHORIZED if no or invalid token
   *                                            403 NOT_YOUR_TURN if not active player
   *                                            404 NOT_FOUND if game does not exist
   *                                            409 GAME_OVER if game is already over
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.post<{ Params: { id: string }; Body: Command }>('/:id/actions', async (req, reply) => {
    try {
      logger.info({ id: req.params.id, command: req.body?.type }, 'Submitting game action')
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      logger.debug({ userId }, 'User ID extracted for action')

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const match = await db.findMatch(gameId)
      if (!match) {
        logger.warn({ id: req.params.id }, 'Game not found for action')
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      if (match.winner) {
        logger.info({ gameId: match.gameId }, 'Action attempted on finished game')
        return reply.status(409).send({ ok: false, error: 'Game is already over', code: 'GAME_OVER', currentPhase: match.phase })
      }

      if (!match.players.onion || !match.players.defender) {
        logger.info({ gameId: match.gameId }, 'Action attempted before both players joined')
        return reply.status(400).send({ ok: false, error: 'Waiting for second player to join', code: 'WAITING_FOR_PLAYER', currentPhase: match.phase })
      }

      const actor = phaseActor(match.phase)
      const activeUserId = actor === 'onion' ? match.players.onion : match.players.defender
      if (userId !== activeUserId) {
        logger.warn({ userId, gameId: match.gameId }, 'Not user turn')
        return reply.status(403).send({ ok: false, error: 'Not your turn', code: 'NOT_YOUR_TURN', currentPhase: match.phase })
      }

      const command = req.body
      logger.debug({ command }, 'Received command')
      if (!command?.type) {
        logger.warn({ command }, 'Missing command type')
        return reply.status(400).send({ ok: false, error: 'Missing command type', code: 'INVALID_INPUT', currentPhase: match.phase })
      }

      const supportedCommands = new Set(['END_PHASE', 'MOVE', 'FIRE'])
      if (!supportedCommands.has(command.type)) {
        logger.warn({ commandType: command.type }, 'Unknown command type')
        return reply.status(400).send({
          ok: false,
          error: `Unknown command type: ${command.type}`,
          code: 'COMMAND_INVALID',
          detailCode: `UNKNOWN_COMMAND ${command.type}`,
          currentPhase: match.phase,
        })
      }

      let newEvents: EventEnvelope[]
      let currentState = match.state
      const expectedLastEventSeq = match.events.at(-1)?.seq ?? 0

      if (command.type === 'END_PHASE') {
        logger.info({ gameId: match.gameId, phase: match.phase }, 'Advancing phase')
        const result = advancePhaseWithEvents(match)
        newEvents = result.newEvents
        currentState = result.state
        const winner = computeWinnerUserId(match, result.state, result.phase, result.turnNumber) ?? match.winner
        await db.persistMatchProgress({
          gameId: match.gameId,
          expectedLastEventSeq,
          phase: result.phase,
          turnNumber: result.turnNumber,
          winner,
          state: result.state,
          events: newEvents,
        })
        // Return updated state and events
        const turnNumber = result.turnNumber
        const eventSeq = newEvents.at(-1)?.seq ?? 0
        logSentEvents(match.gameId, 'END_PHASE', newEvents)
        broadcastGameEvents(match.gameId, newEvents)
        logger.debug({ gameId: match.gameId, phase: match.phase, turnNumber }, 'Phase advanced')
        return reply.send({ ok: true, seq: eventSeq, events: newEvents, state: currentState, movementRemainingByUnit: buildMovementRemainingByUnit(currentState, result.phase), turnNumber, eventSeq })
      } else if (command.type === 'MOVE') {
        logger.info({ gameId: match.gameId, unitId: command.unitId }, 'Processing MOVE command')
        const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
        const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
        const map = createMap(scenarioMap.width, scenarioMap.height, scenarioMap.hexes, scenarioMap.cells)
        const state = buildEngineState(match)
        const validation = validateUnitMovement(map, state, command)
        if (!validation.ok) {
          logger.info({ gameId: match.gameId, error: validation.error }, 'Invalid move command')
          return reply.status(422).send({
            ok: false,
            error: validation.error,
            code: 'MOVE_INVALID',
            detailCode: validation.code,
            currentPhase: match.phase,
          })
        }
        const result = executeUnitMovement(state, validation.plan)
        if (!result.success) {
          logger.info({ gameId: match.gameId, error: result.error }, 'Invalid move command')
          return reply.status(422).send({ ok: false, error: result.error, code: 'MOVE_INVALID', currentPhase: match.phase })
        }

        const nextSeq = (match.events.at(-1)?.seq ?? 0) + 1
        newEvents = buildMoveEvents(nextSeq, validation.plan.unitId, command, result, state)

        currentState = state
        const winner = computeWinnerUserId(match, state, match.phase, match.turnNumber) ?? match.winner
        await db.persistMatchProgress({
          gameId: match.gameId,
          expectedLastEventSeq,
          phase: match.phase,
          turnNumber: match.turnNumber,
          winner,
          state,
          events: newEvents,
        })
        const turnNumber = match.turnNumber
        const eventSeq = newEvents.at(-1)?.seq ?? nextSeq - 1
        logSentEvents(match.gameId, 'MOVE', newEvents)
        logActionOutcome(match.gameId, 'MOVE', {
          unitId: command.unitId,
          from: validation.plan.from,
          to: validation.plan.to,
          cost: validation.plan.cost,
          rammedUnitIds: result.rammedUnitIds ?? [],
          destroyedUnits: result.destroyedUnits ?? [],
          treadDamage: result.treadDamage ?? 0,
        }, newEvents)
        broadcastGameEvents(match.gameId, newEvents)
        logger.debug({ gameId: match.gameId, unitId: command.unitId }, 'Move executed')
        return reply.send({ ok: true, seq: newEvents[0].seq, events: newEvents, state: currentState, movementRemainingByUnit: buildMovementRemainingByUnit(currentState, match.phase), turnNumber, eventSeq })
      } else if (command.type === 'FIRE') {
        logger.info({ gameId: match.gameId, type: command.type }, 'Processing combat command')
        const scenarioSnapshot = match.scenarioSnapshot as ScenarioSnapshot
        const scenarioMap = getScenarioMapSnapshot(scenarioSnapshot)
        const map = createMap(scenarioMap.width, scenarioMap.height, scenarioMap.hexes, scenarioMap.cells)
        const state = buildEngineState(match)
        const validation = validateCombatAction(map, state, command)
        if (!validation.ok) {
          logger.info({ gameId: match.gameId, error: validation.error }, 'Invalid combat command')
          return reply.status(422).send({
            ok: false,
            error: validation.error,
            code: 'MOVE_INVALID',
            detailCode: validation.code,
            currentPhase: match.phase,
          })
        }

        const result = executeCombatAction(state, validation.plan)
        if (!result.success) {
          logger.info({ gameId: match.gameId, error: result.error }, 'Invalid combat command')
          return reply.status(422).send({ ok: false, error: result.error, code: 'MOVE_INVALID', currentPhase: match.phase })
        }

        const seq = (match.events.at(-1)?.seq ?? 0) + 1
        newEvents = buildCombatEvents(seq, command, result, state)
        currentState = state
        const winner = computeWinnerUserId(match, state, match.phase, match.turnNumber) ?? match.winner
        await db.persistMatchProgress({
          gameId: match.gameId,
          expectedLastEventSeq,
          phase: match.phase,
          turnNumber: match.turnNumber,
          winner,
          state,
          events: newEvents,
        })
        const turnNumber = match.turnNumber
        const eventSeq = newEvents.at(-1)?.seq ?? seq
        logSentEvents(match.gameId, command.type, newEvents)
        logActionOutcome(match.gameId, 'FIRE', {
          attackers: command.attackers,
          targetId: result.targetId,
          roll: result.roll?.roll ?? null,
          outcome: result.roll?.result ?? null,
          odds: result.roll?.odds ?? null,
          treadsLost: result.treadsLost ?? null,
          destroyedWeaponId: result.destroyedWeaponId ?? null,
          squadsLost: result.squadsLost ?? null,
          statusChanges: result.statusChanges ?? [],
        }, newEvents)
        broadcastGameEvents(match.gameId, newEvents)
        logger.debug({ gameId: match.gameId, type: command.type }, 'Combat executed')
        return reply.send({ ok: true, seq: eventSeq, events: newEvents, state: currentState, movementRemainingByUnit: buildMovementRemainingByUnit(currentState, match.phase), turnNumber, eventSeq })
      }
    } catch (err) {
      if (err instanceof StaleMatchStateError) {
        logger.warn({ err }, 'Stale match state error')
        return reply.status(409).send({
          ok: false,
          error: 'Match state changed; retry action',
          code: 'STALE_STATE',
        })
      }
      logger.error({ err }, 'Error submitting game action')
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

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
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

      const gameId = parseGameId(req.params.id)
      if (gameId === null) {
        return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })
      }

      const match = await db.findMatch(gameId)
      if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

      const after = Number(req.query.after ?? 0)
      const events = await db.getEvents(match.gameId, after)
      return reply.send({ events })
    } catch (err) {
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
