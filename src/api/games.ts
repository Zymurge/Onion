import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TurnPhase, GameState, EventEnvelope, PlayerRole, Command } from '../types/index.js'
import { TURN_PHASES, phaseActor } from '../engine/phases.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SCENARIOS_DIR = process.env.SCENARIOS_DIR ?? join(process.cwd(), 'scenarios')

async function scenarioExists(id: string): Promise<boolean> {
  try {
    const files = await readdir(SCENARIOS_DIR)
    for (const file of files.filter((f) => f.endsWith('.json'))) {
      const raw = await readFile(join(SCENARIOS_DIR, file), 'utf8')
      const s = JSON.parse(raw) as { id: string }
      if (s.id === id) return true
    }
  } catch {
    // directory unreadable — treat as not found
  }
  return false
}

function extractUserId(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer stub.')) return null
  const userId = authHeader.slice('Bearer stub.'.length)
  return UUID_RE.test(userId) ? userId : null
}

interface Match {
  gameId: string
  scenarioId: string
  players: { onion: string | null; defender: string | null }
  phase: TurnPhase
  turnNumber: number
  winner: string | null
  state: GameState
  events: EventEnvelope[]
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

// Advance phase and auto-process engine-only phases (DEFENDER_RECOVERY).
// Returns all events generated. Does NOT push to match.events — caller does that.
function advancePhase(match: Match): EventEnvelope[] {
  const events: EventEnvelope[] = []
  let seq = (match.events.at(-1)?.seq ?? 0) + 1
  const timestamp = new Date().toISOString()

  const fromPhase = match.phase
  const nextIdx = (TURN_PHASES.indexOf(fromPhase) + 1) % TURN_PHASES.length
  if (nextIdx === 0) match.turnNumber++
  match.phase = TURN_PHASES[nextIdx]
  events.push({ seq: seq++, type: 'PHASE_CHANGED', timestamp, from: fromPhase, to: match.phase, turnNumber: match.turnNumber })

  // Auto-advance through DEFENDER_RECOVERY: process unit status transitions then continue
  if (phaseActor(match.phase) === 'engine') {
    for (const [unitId, unit] of Object.entries(match.state.defenders)) {
      const prevStatus = unit.status
      if (unit.status === 'recovering') unit.status = 'operational'
      else if (unit.status === 'disabled') unit.status = 'recovering'
      if (unit.status !== prevStatus) {
        events.push({ seq: seq++, type: 'UNIT_STATUS_CHANGED', timestamp, unitId, from: prevStatus, to: unit.status })
      }
    }
    const engineFrom = match.phase
    const engineNextIdx = (TURN_PHASES.indexOf(engineFrom) + 1) % TURN_PHASES.length
    if (engineNextIdx === 0) match.turnNumber++
    match.phase = TURN_PHASES[engineNextIdx]
    events.push({ seq: seq++, type: 'PHASE_CHANGED', timestamp, from: engineFrom, to: match.phase, turnNumber: match.turnNumber })
  }

  return events
}

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  const matches = new Map<string, Match>()

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
    if (!await scenarioExists(scenarioId)) {
      return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
    }

    const gameId = randomUUID()
    const match: Match = {
      gameId,
      scenarioId,
      players: {
        onion: role === 'onion' ? userId : null,
        defender: role === 'defender' ? userId : null,
      },
      phase: 'ONION_MOVE',
      turnNumber: 1,
      winner: null,
      state: structuredClone(INITIAL_STATE),
      events: [],
    }
    matches.set(gameId, match)
    return reply.status(201).send({ gameId, role })
  })

  app.post<{ Params: { id: string } }>('/:id/join', async (req, reply) => {
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const match = matches.get(req.params.id)
    if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

    if (match.players.onion === userId || match.players.defender === userId) {
      return reply.status(400).send({ ok: false, error: 'Cannot join your own game', code: 'CANNOT_JOIN_OWN_GAME' })
    }

    let role: PlayerRole
    if (!match.players.onion) {
      match.players.onion = userId
      role = 'onion'
    } else if (!match.players.defender) {
      match.players.defender = userId
      role = 'defender'
    } else {
      return reply.status(409).send({ ok: false, error: 'Game is already full', code: 'GAME_FULL' })
    }

    return reply.send({ gameId: match.gameId, role })
  })

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const match = matches.get(req.params.id)
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

  app.post<{ Params: { id: string }; Body: Command }>('/:id/actions', async (req, reply) => {
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const match = matches.get(req.params.id)
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

    let events: EventEnvelope[]
    if (command.type === 'END_PHASE') {
      events = advancePhase(match)
    } else {
      // Stub: acknowledge all other commands without modifying state
      const seq = (match.events.at(-1)?.seq ?? 0) + 1
      events = [{ seq, type: 'ACTION_ACKNOWLEDGED', timestamp: new Date().toISOString(), command: command.type }]
    }

    match.events.push(...events)
    const seq = match.events.at(-1)!.seq
    return reply.send({ ok: true, seq, events, state: match.state })
  })

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/:id/events', async (req, reply) => {
    const userId = extractUserId(req.headers.authorization)
    if (!userId) return reply.status(401).send({ ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED' })

    const match = matches.get(req.params.id)
    if (!match) return reply.status(404).send({ ok: false, error: 'Game not found', code: 'NOT_FOUND' })

    const after = Number(req.query.after ?? 0)
    return reply.send({ events: match.events.filter((e) => e.seq > after) })
  })
}
