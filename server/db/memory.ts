import { randomUUID } from 'node:crypto'
import type { TurnPhase, GameState, EventEnvelope } from '#shared/types/index'
import { MatchJoinError, MatchStartError, StaleMatchStateError } from '#server/db/adapter'
import type { DbAdapter, MatchListFilters, MatchRecord, MatchSummary, PersistMatchProgressInput } from '#server/db/adapter'
import logger from '#server/logger'

/**
 * In-memory implementation of DbAdapter for testing and development.
 *
 * Stores all data in Map objects within the instance. Each instance maintains
 * its own isolated data store. Not suitable for production use.
 *
 * Thread-safe for single-threaded Node.js usage (no external concurrency).
 */
export class InMemoryDb implements DbAdapter {
  private users = new Map<string, UserRecord>() // keyed by normalized username
  private usersByEmail = new Map<string, UserRecord>()
  private nextMatchId = 1
  private matches = new Map<number, MatchRecord>() // keyed by gameId

  async findUserByUsername(username: string): Promise<{ userId: string; passwordHash: string } | null> {
    const record = this.users.get(username)
    return record ? { userId: record.userId, passwordHash: record.passwordHash } : null
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const record = this.usersByEmail.get(email)
    return record ? { ...record } : null
  }

  async createUser(username: string, email: string, passwordHash: string): Promise<{ userId: string }> {
    const normalizedUsername = username.toLowerCase()
    const normalizedEmail = email.toLowerCase()
    if (this.users.has(normalizedUsername)) {
      throw Object.assign(new Error('Username already exists'), { code: '23505', constraint: 'users_username_ci_idx' })
    }
    if (this.usersByEmail.has(normalizedEmail)) {
      throw Object.assign(new Error('Email already exists'), { code: '23505', constraint: 'users_email_ci_idx' })
    }
    const userId = randomUUID()
    const record = { userId, username, email, passwordHash }
    this.users.set(normalizedUsername, record)
    this.usersByEmail.set(normalizedEmail, record)
    return { userId }
  }

  async createMatch(match: Omit<MatchRecord, 'gameId'>): Promise<{ gameId: number }> {
    // Defensive: ensure displayName is present if possible
    if (typeof match.scenarioSnapshot === 'object' && match.scenarioSnapshot && 'name' in match.scenarioSnapshot && !('displayName' in match.scenarioSnapshot)) {
      const scenarioSnapshot = match.scenarioSnapshot as Record<string, unknown>
      scenarioSnapshot.displayName = scenarioSnapshot.name
    }
    const gameId = this.nextMatchId++
    this.matches.set(gameId, structuredClone({ ...match, gameId }))
    return { gameId }
  }

  async findMatch(gameId: number): Promise<MatchRecord | null> {
    const m = this.matches.get(gameId)
    return m ? structuredClone(m) : null
  }

  async listMatches(filters: MatchListFilters = {}): Promise<MatchSummary[]> {
    const results: MatchSummary[] = []
    for (const match of this.matches.values()) {
      const hasOpenOnionSlot = match.players.onion === null
      const hasOpenDefenderSlot = match.players.defender === null
      const isOpen = hasOpenOnionSlot !== hasOpenDefenderSlot
      const isFull = !hasOpenOnionSlot && !hasOpenDefenderSlot
      const involvesParticipant = filters.participantUserId === undefined
        || match.players.onion === filters.participantUserId
        || match.players.defender === filters.participantUserId
      const excludesParticipant = filters.excludeParticipantUserId === undefined
        || match.players.onion !== filters.excludeParticipantUserId && match.players.defender !== filters.excludeParticipantUserId
      const matchesCompletion = filters.completion === undefined || filters.completion === 'all'
        || filters.completion === 'active' && match.status !== 'completed'
        || filters.completion === 'completed' && match.status === 'completed'
      const matchesAvailability = filters.availability === undefined || filters.availability === 'all'
        || filters.availability === 'open' && isOpen && match.status === 'waiting'
        || filters.availability === 'full' && isFull

      if (!involvesParticipant || !excludesParticipant || !matchesCompletion || !matchesAvailability) {
        continue
      }

      results.push({
        gameId: match.gameId,
        scenarioId: match.scenarioId,
        phase: match.phase,
        turnNumber: match.turnNumber,
        winner: match.winner,
        players: match.players,
        hostUserId: match.hostUserId,
        status: match.status,
      })
    }
    return results
  }

  async joinMatch(gameId: number, userId: string, causeId: string) {
    const match = this.matches.get(gameId)
    if (!match) throw new MatchJoinError('MATCH_NOT_FOUND', 'Game not found')
    if (match.players.onion === userId || match.players.defender === userId) {
      throw new MatchJoinError('CANNOT_JOIN_OWN_GAME', 'Cannot join your own game')
    }
    if (match.players.onion !== null && match.players.defender !== null) {
      throw new MatchJoinError('GAME_FULL', 'Game is already full')
    }
    if (match.status !== 'waiting') {
      throw new MatchJoinError('GAME_NOT_READY', 'Game is no longer accepting players')
    }

    let role: 'onion' | 'defender'
    if (match.players.onion === null) {
      match.players.onion = userId
      role = 'onion'
    } else if (match.players.defender === null) {
      match.players.defender = userId
      role = 'defender'
    } else {
      throw new MatchJoinError('GAME_FULL', 'Game is already full')
    }
    match.status = 'ready'
    const event = {
      seq: (match.events.at(-1)?.seq ?? 0) + 1,
      type: 'PLAYER_JOINED',
      timestamp: new Date().toISOString(),
      causeId,
      userId,
      role,
    }
    match.events.push(event)
    return { role, event: structuredClone(event) }
  }

  async startMatch(gameId: number, userId: string, causeId: string) {
    const match = this.matches.get(gameId)
    if (!match) throw new MatchStartError('MATCH_NOT_FOUND', 'Game not found')
    if (match.hostUserId !== userId) {
      throw new MatchStartError('NOT_HOST', 'Only the host can start the game')
    }
    if (match.status === 'waiting' || match.players.onion === null || match.players.defender === null) {
      throw new MatchStartError('GAME_NOT_READY', 'Game is not ready to start')
    }
    if (match.status !== 'ready') {
      throw new MatchStartError('GAME_ALREADY_STARTED', 'Game has already started')
    }

    const event = {
      seq: (match.events.at(-1)?.seq ?? 0) + 1,
      type: 'STARTED',
      timestamp: new Date().toISOString(),
      causeId,
      userId,
    }
    match.status = 'active'
    match.events.push(event)
    return { event: structuredClone(event) }
  }

  async updateMatchPlayers(gameId: number, players: { onion: string | null; defender: string | null }): Promise<void> {
    const m = this.matches.get(gameId)
    if (!m) throw new Error(`Match not found: ${gameId}`)
    m.players = players
  }

  async updateMatchState(gameId: number, phase: TurnPhase, turnNumber: number, winner: string | null, state: GameState): Promise<void> {
    const m = this.matches.get(gameId)
    if (!m) throw new Error(`Match not found: ${gameId}`)
    m.phase = phase
    m.turnNumber = turnNumber
    m.winner = winner
    m.state = structuredClone(state)
  }

  async persistMatchProgress(input: PersistMatchProgressInput): Promise<void> {
    const m = this.matches.get(input.gameId)
    if (!m) throw new Error(`Match not found: ${input.gameId}`)

    logger.debug({ gameId: input.gameId, expectedLastEventSeq: input.expectedLastEventSeq, phase: input.phase, turnNumber: input.turnNumber, events: input.events, state: input.state }, 'Persisting match progress (in-memory)')

    const currentLastSeq = m.events.at(-1)?.seq ?? 0
    if (currentLastSeq !== input.expectedLastEventSeq) {
      throw new StaleMatchStateError(
        `Expected last seq ${input.expectedLastEventSeq} but found ${currentLastSeq}`,
      )
    }

    m.phase = input.phase
    m.turnNumber = input.turnNumber
    m.winner = input.winner
    m.status = input.status
    m.state = structuredClone(input.state)
    m.events.push(...structuredClone(input.events))
  }

  async appendEvents(gameId: number, events: EventEnvelope[]): Promise<void> {
    const m = this.matches.get(gameId)
    if (!m) throw new Error(`Match not found: ${gameId}`)
    m.events.push(...events)
  }

  async getEvents(gameId: number, after: number): Promise<EventEnvelope[]> {
    const m = this.matches.get(gameId)
    if (!m) return []
    return m.events.filter((e) => e.seq > after)
  }
}

/** Internal user record structure for InMemoryDb */
interface UserRecord {
  userId: string
  username: string
  email: string
  passwordHash: string
}
