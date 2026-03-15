import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TurnPhase, GameState, EventEnvelope, PlayerRole, Command } from '../types/index.js'
import type { DbAdapter, MatchRecord } from '../db/adapter.js'
import { TURN_PHASES, phaseActor } from '../engine/phases.js'
import { advancePhaseWithEvents } from '../engine/game.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCENARIOS_DIR = process.env.SCENARIOS_DIR ?? join(process.cwd(), 'scenarios')

/**
 * Load a scenario file by ID from the scenarios directory.
 * @param id - Scenario identifier
 * @returns Parsed scenario JSON or null if not found
 */
async function loadScenario(id: string): Promise<unknown | null> {
  try {
    const files = await readdir(SCENARIOS_DIR)
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const raw = await readFile(join(SCENARIOS_DIR, file), 'utf8')
      const s = JSON.parse(raw) as { id: string }
      if (s.id === id) return s
    }
  } catch {
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
   * Creates a match for the specified scenario and assigns the creator to the chosen role.
   * The scenario must exist and be valid. The match starts in ONION_MOVE phase.
   *
   * @route POST /games
   * @body { scenarioId: string, role: 'onion' | 'defender' }
   * @returns { gameId: string, role: string } - 201 on success
   * @returns { ok: false, error: string, code: string } - 400 INVALID_INPUT for schema validation errors
   *                                            401 UNAUTHORIZED if no or invalid token
   *                                            404 NOT_FOUND if scenario does not exist
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.post<{ Body: { scenarioId: string; role: PlayerRole } }>('/', async (req, reply) => {
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const { scenarioId, role } = (req.body ?? {}) as { scenarioId?: string; role?: string }
    if (!scenarioId) {
      return reply.status(400).send({ ok: false, error: 'scenarioId is required', code: 'INVALID_INPUT' })
    }
    if (role !== 'onion' && role !== 'defender') {
      return reply.status(400).send({ ok: false, error: 'role must be "onion" or "defender"', code: 'INVALID_INPUT' })
    }
    const scenarioSnapshot = await loadScenario(scenarioId)
    if (!scenarioSnapshot) {
      return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
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
      state: structuredClone(INITIAL_STATE),
      events: [],
    })
    return reply.status(201).send({ gameId, role })
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
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const match = await db.findMatch(req.params.id)
    if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

    return reply.send({
      gameId: match.gameId,
      scenarioId: match.scenarioId,
      phase: match.phase,
      turnNumber: match.turnNumber,
      winner: match.winner,
      players: match.players,
      state: match.state,
      eventSeq: match.events.at(-1)?.seq ?? 0,
    })
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
    } else {
      // Stub: acknowledge all other commands without modifying state
      const seq = (match.events.at(-1)?.seq ?? 0) + 1
      newEvents = [{ seq, type: 'ACTION_ACKNOWLEDGED', timestamp: new Date().toISOString(), command: command.type }]
    }

    await db.appendEvents(match.gameId, newEvents)
    const seq = newEvents.at(-1)!.seq
    return reply.send({ ok: true, seq, events: newEvents, state: currentState })
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
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const match = await db.findMatch(req.params.id)
    if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

    const after = Number(req.query.after ?? 0)
    const events = await db.getEvents(match.gameId, after)
    return reply.send({ events })
  })
}
