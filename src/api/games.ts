import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { TurnPhase, GameState, EventEnvelope, PlayerRole, Command } from '../types/index.js'
import type { DbAdapter, MatchRecord } from '../db/adapter.js'
import { TURN_PHASES, phaseActor } from '../engine/phases.js'
import { advancePhaseWithEvents } from '../engine/game.js'
import { createMap } from '../engine/map.js'
import { executeOnionMovement } from '../engine/index.js'
import { InitialStateSchema } from '../engine/scenarioSchema'
import { normalizeInitialStateToGameState } from '../engine/scenarioNormalizer'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCENARIOS_DIR = process.env.SCENARIOS_DIR ?? join(process.cwd(), 'scenarios')

/**
 * Load a scenario file by ID from the scenarios directory.
 * @param id - Scenario identifier
 * @returns Parsed scenario JSON or null if not found
 */
async function loadScenario(id: string): Promise<unknown | null> {
  try {
    console.log('[loadScenario] Looking for scenario:', id, 'in', SCENARIOS_DIR)
    const files = await readdir(SCENARIOS_DIR)
    console.log('[loadScenario] Found files:', files)
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const fullPath = join(SCENARIOS_DIR, file)
      console.log(`[loadScenario] Reading file: ${fullPath}`)
      const raw = await readFile(fullPath, 'utf8')
      let s: any
      try {
        s = JSON.parse(raw)
      } catch (err) {
        console.log(`[loadScenario] Failed to parse JSON in file: ${file}`, err)
        continue
      }
      console.log('[loadScenario] Checking scenario file:', file, 'with id:', s.id)
      if (s.id === id) {
        console.log('[loadScenario] Scenario matched:', file)
        return s
      }
    }
    console.log('[loadScenario] No matching scenario found for id:', id, 'in files:', files)
  } catch (err) {
    console.log('[loadScenario] Error reading scenarios:', err)
    // directory unreadable — treat as not found
  }
  return null
}

/**
 * Extract userId from Authorization header.
 * Currently supports stub tokens in format "Bearer stub.{userId}".
 * @param authHeader - Authorization header value
 * @returns userId if valid, null otherwise
 */
function extractUserId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer stub.')) return null
  const userId = authHeader.slice('Bearer stub.'.length)
  return UUID_RE.test(userId) ? userId : null
}

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

  /**
   * Create a new game match.
   *
   * @route POST /games
   * @body { scenarioId: string, role: PlayerRole }
   * @returns { gameId: string, role: PlayerRole } - 201 on success
   * @returns { ok: false, error: string, code: string } - 400 INVALID_INPUT, 404 NOT_FOUND, 500 INTERNAL_ERROR
   */
  app.post<{ Body: { scenarioId: string, role: PlayerRole } }>('/', async (req, reply) => {
    try {
      const { scenarioId, role } = req.body
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })
      if (!scenarioId || !role) return reply.status(400).send({ ok: false, error: 'Missing scenarioId or role', code: 'INVALID_INPUT' })
      const scenarioSnapshot = await loadScenario(scenarioId)
      if (!scenarioSnapshot) {
        return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
      }
      let state: GameState
      if (scenarioSnapshot.initialState) {
        try {
          const parsed = InitialStateSchema.parse(scenarioSnapshot.initialState)
          state = normalizeInitialStateToGameState(parsed)
        } catch (err) {
          return reply.status(400).send({ ok: false, error: 'Invalid scenario initialState', code: 'INVALID_SCENARIO' })
        }
      } else {
        state = structuredClone(INITIAL_STATE)
      }
      const gameId = randomUUID()
      await db.createMatch({
        gameId,
        scenarioId,
        scenarioSnapshot,
        players: {
          onion: role === 'onion' ? userId : null,
          defender: role === 'defender' ? userId : null,
        },
        phase: 'ONION_MOVE',
        turnNumber: 1,
        winner: null,
        state,
        events: [],
      })
      return reply.status(201).send({ gameId, role })
    } catch (err) {
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
   * @returns { gameId: string, role: string } - 200 on success
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
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

      const match = await db.findMatch(req.params.id)
      if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

      if (match.players.onion === userId || match.players.defender === userId) {
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
        return reply.status(409).send({ ok: false, error: 'Game is already full', code: 'GAME_FULL' })
      }

      await db.updateMatchPlayers(match.gameId, newPlayers)
      return reply.send({ gameId: match.gameId, role })
    } catch (err) {
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
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    try {
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

      const match = await db.findMatch(req.params.id)
      if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

      // Type assertion for scenarioSnapshot
      const scenarioSnapshot = match.scenarioSnapshot as any
      return reply.send({
        gameId: match.gameId,
        scenarioId: match.scenarioId,
        scenarioName: scenarioSnapshot?.name,
        phase: match.phase,
        turnNumber: match.turnNumber,
        winner: match.winner,
        players: match.players,
        state: match.state,
        eventSeq: match.events.at(-1)?.seq ?? 0,
      })
    } catch (err) {
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })

  /**
   * Submit a game action.
   *
   * Executes the specified command if it's the player's turn and the command is valid.
   * Returns the updated game state and any events generated by the action.
   * Currently only END_PHASE is fully implemented; other commands return ACTION_ACKNOWLEDGED.
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
      const userId = extractUserId(req.headers.authorization)
      if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

      const match = await db.findMatch(req.params.id)
      if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

      if (match.winner) {
        return reply.status(409).send({ ok: false, error: 'Game is already over', code: 'GAME_OVER', currentPhase: match.phase })
      }

      if (!match.players.onion || !match.players.defender) {
        return reply.status(400).send({ ok: false, error: 'Waiting for second player to join', code: 'WAITING_FOR_PLAYER', currentPhase: match.phase })
      }

      const actor = phaseActor(match.phase)
      const activeUserId = actor === 'onion' ? match.players.onion : match.players.defender
      if (userId !== activeUserId) {
        return reply.status(403).send({ ok: false, error: 'Not your turn', code: 'NOT_YOUR_TURN', currentPhase: match.phase })
      }

      const command = req.body
      if (!command?.type) {
        return reply.status(400).send({ ok: false, error: 'Missing command type', code: 'INVALID_INPUT', currentPhase: match.phase })
      }

      let newEvents: EventEnvelope[]
      let currentState = match.state
      if (command.type === 'END_PHASE') {
        const result = advancePhaseWithEvents(match)
        newEvents = result.newEvents
        currentState = result.state
        await db.updateMatchState(match.gameId, result.phase, result.turnNumber, match.winner, result.state)
        // Return updated state and events
        return reply.send({ ok: true, events: newEvents, state: currentState })
      } else if (command.type === 'MOVE_ONION') {
        // Only handle MOVE_ONION here
        // Load scenario map (from match.scenarioSnapshot)
        const scenarioSnapshot = match.scenarioSnapshot as any
        const map = createMap(
          scenarioSnapshot.width,
          scenarioSnapshot.height,
          scenarioSnapshot.hexes || []
        )
        // Deep clone state to avoid mutating DB state directly
        // Patch: ensure EngineGameState fields exist
        const state = {
          ...structuredClone(match.state),
          ramsThisTurn: match.state.ramsThisTurn ?? 0,
          currentPhase: match.phase,
          turn: match.turnNumber,
        }
        const result = executeOnionMovement(map, state, command)
        if (!result.success) {
          return reply.status(400).send({ ok: false, error: result.error, code: 'MOVE_INVALID', currentPhase: match.phase })
        }
        // Persist new state
        await db.updateMatchState(match.gameId, match.phase, match.turnNumber, match.winner, state)
        // Emit event
        const seq = (match.events.at(-1)?.seq ?? 0) + 1
        newEvents = [{ seq, type: 'ONION_MOVED', timestamp: new Date().toISOString(), to: command.to }]
        currentState = state
        await db.appendEvents(match.gameId, newEvents)
        return reply.send({ ok: true, seq, events: newEvents, state: currentState })
      } else if (command.type === 'MOVE_UNIT') {
        // Defender movement
        const scenarioSnapshot = match.scenarioSnapshot as any
        const map = createMap(
          scenarioSnapshot.width,
          scenarioSnapshot.height,
          scenarioSnapshot.hexes || []
        )
        const state = {
          ...structuredClone(match.state),
          currentPhase: match.phase,
          turn: match.turnNumber,
        }
        const { validateUnitMovement, executeUnitMovement } = await import('../engine/movement.js')
        const validation = validateUnitMovement(map, state, command.unitId, command)
        if (!validation.valid) {
          return reply.status(400).send({ ok: false, error: validation.error, code: 'MOVE_INVALID', currentPhase: match.phase })
        }
        const result = executeUnitMovement(map, state, command.unitId, command)
        if (!result.success) {
          return reply.status(400).send({ ok: false, error: result.error, code: 'MOVE_INVALID', currentPhase: match.phase })
        }
        await db.updateMatchState(match.gameId, match.phase, match.turnNumber, match.winner, state)
        const seq = (match.events.at(-1)?.seq ?? 0) + 1
        newEvents = [{ seq, type: 'UNIT_MOVED', timestamp: new Date().toISOString(), unitId: command.unitId, to: command.to }]
        currentState = state
        await db.appendEvents(match.gameId, newEvents)
        return reply.send({ ok: true, seq, events: newEvents, state: currentState })
      } else {
        // Stub: acknowledge all other commands without modifying state
        const seq = (match.events.at(-1)?.seq ?? 0) + 1
        newEvents = [{ seq, type: 'ACTION_ACKNOWLEDGED', timestamp: new Date().toISOString(), command: command.type }]
        await db.appendEvents(match.gameId, newEvents)
        return reply.send({ ok: true, seq, events: newEvents, state: currentState })
      }
    } catch (err) {
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

      const match = await db.findMatch(req.params.id)
      if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

      const after = Number(req.query.after ?? 0)
      const events = await db.getEvents(match.gameId, after)
      return reply.send({ events })
    } catch (err) {
      return reply.status(500).send({ ok: false, error: 'Internal error', code: 'INTERNAL_ERROR' })
    }
  })
}
