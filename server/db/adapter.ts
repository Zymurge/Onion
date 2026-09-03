/**
 * Represents a complete match record stored in the database.
 * Contains all persistent state for a game including players, current phase,
 * game state, and event history.
 */
export interface MatchRecord {
  /** Unique identifier for the match */
  gameId: number
  /** ID of the scenario being played */
  scenarioId: string
  /** Full scenario JSON snapshot taken at match creation */
  scenarioSnapshot: unknown
  /** Player assignments - null if slot is open */
  players: { onion: string | null; defender: string | null }
  /** User who created and hosts the match */
  hostUserId: string
  /** Coarse lifecycle state for lobby and gameplay coordination */
  status: GameLifecycleStatus
  /** Current turn phase */
  phase: import('../../shared/types/index.js').TurnPhase
  /** Current turn number (1-based) */
  turnNumber: number
  /** Winner userId if game is over, null otherwise */
  winner: string | null
  /** Current game state (unit positions, health, etc.) */
  state: import('../../shared/types/index.js').GameState
  /** Ordered list of all events that have occurred */
  events: import('../../shared/types/index.js').EventEnvelope[]
}

export type GameLifecycleStatus = 'waiting' | 'ready' | 'active' | 'completed'

/**
 * Thrown when persisting an action against stale match/event state.
 */
export class StaleMatchStateError extends Error {
  constructor(message = 'Match state is stale') {
    super(message)
    this.name = 'StaleMatchStateError'
  }
}

export type MatchJoinErrorCode = 'MATCH_NOT_FOUND' | 'CANNOT_JOIN_OWN_GAME' | 'GAME_FULL' | 'GAME_NOT_READY'

export class MatchJoinError extends Error {
  constructor(public readonly code: MatchJoinErrorCode, message: string) {
    super(message)
    this.name = 'MatchJoinError'
  }
}

export type MatchStartErrorCode = 'MATCH_NOT_FOUND' | 'NOT_HOST' | 'GAME_NOT_READY' | 'GAME_ALREADY_STARTED'

export class MatchStartError extends Error {
  constructor(public readonly code: MatchStartErrorCode, message: string) {
    super(message)
    this.name = 'MatchStartError'
  }
}

export type JoinMatchResult = {
  role: import('../../shared/types/index.js').PlayerRole
  event: import('../../shared/types/index.js').EventEnvelope
}

export type StartMatchResult = {
  event: import('../../shared/types/index.js').EventEnvelope
}

export interface PersistMatchProgressInput {
  gameId: number
  phase: import('../../shared/types/index.js').TurnPhase
  turnNumber: number
  winner: string | null
  status: GameLifecycleStatus
  state: import('../../shared/types/index.js').GameState
  events: import('../../shared/types/index.js').EventEnvelope[]
  expectedLastEventSeq: number
}

export type MatchSummary = Pick<MatchRecord, 'gameId' | 'scenarioId' | 'phase' | 'turnNumber' | 'winner' | 'players' | 'hostUserId' | 'status'>

export interface MatchListFilters {
  participantUserId?: string
  excludeParticipantUserId?: string
  completion?: 'all' | 'active' | 'completed'
  availability?: 'all' | 'open' | 'full'
}

/**
 * Data Access Layer interface for Onion game persistence.
 *
 * Provides a clean abstraction over storage backends (in-memory, PostgreSQL, etc.).
 * All operations are async to support both fast in-memory implementations and
 * slower database-backed ones.
 *
 * Implementations must be thread-safe for concurrent requests.
 */
export interface DbAdapter {
  // Auth operations

  /**
   * Find a user by their normalized public username.
   * @param username - The normalized username to search for
   * @returns User record if found, null otherwise
   */
  findUserByUsername(username: string): Promise<{ userId: string; passwordHash: string } | null>

  /**
   * Find a user by their normalized email address.
   * @param email - The normalized email to search for
   * @returns User record if found, null otherwise
   */
  findUserByEmail(email: string): Promise<{ userId: string; username: string; email: string; passwordHash: string } | null>

  /**
   * Create a new user account.
  * @param username - Unique public username (enforced by implementation)
  * @param email - Unique normalized email address (enforced by implementation)
   * @param passwordHash - Pre-hashed password string
   * @returns The assigned userId
   * @throws Error if username already exists
   */
  createUser(username: string, email: string, passwordHash: string): Promise<{ userId: string }>

  // Game operations

  /**
   * Persist a new match to storage.
    * @param match - Match record without an assigned gameId
    * @returns The assigned gameId
   */
    createMatch(match: Omit<MatchRecord, 'gameId'>): Promise<{ gameId: number }>

  /**
   * Retrieve a match by its gameId.
   * @param gameId - The match identifier
   * @returns Complete match record if found, null otherwise
   */
  findMatch(gameId: number): Promise<MatchRecord | null>

  /**
   * List lightweight match summaries ordered by creation.
   * Omitting filters returns all matches.
   */
  listMatches(filters?: MatchListFilters): Promise<MatchSummary[]>

  /**
   * Atomically claim an open player slot and append the corresponding join event.
   */
  joinMatch(gameId: number, userId: string, causeId: string): Promise<JoinMatchResult>

  /** Atomically transition a full ready match to active and append its start event. */
  startMatch(gameId: number, userId: string, causeId: string): Promise<StartMatchResult>

  /**
   * Update player assignments for an existing match.
   * @param gameId - The match to update
   * @param players - New player assignments
   */
  updateMatchPlayers(gameId: number, players: { onion: string | null; defender: string | null }): Promise<void>

  /**
   * Update the game state, phase, and turn for an existing match.
   * @param gameId - The match to update
   * @param phase - New turn phase
   * @param turnNumber - New turn number
   * @param winner - Winner if game ended, null otherwise
   * @param state - New game state
   */
  updateMatchState(gameId: number, phase: import('../../shared/types/index.js').TurnPhase, turnNumber: number, winner: string | null, state: import('../../shared/types/index.js').GameState): Promise<void>

  /**
   * Persist state and events atomically if the event cursor has not advanced.
   *
   * Implementations must validate `expectedLastEventSeq` against the current
   * persisted cursor and throw `StaleMatchStateError` when mismatched.
   */
  persistMatchProgress(input: PersistMatchProgressInput): Promise<void>

  /**
   * Append new events to a match's event history.
   * Events must be appended in sequence order.
   * @param gameId - The match to update
   * @param events - Events to append (in sequence order)
   */
  appendEvents(gameId: number, events: import('../../shared/types/index.js').EventEnvelope[]): Promise<void>

  /**
   * Retrieve events for a match after a given sequence number.
   * Used for event polling by clients.
   * @param gameId - The match to query
   * @param after - Return events with seq > after (0 for all events)
   * @returns Events in ascending sequence order
   */
  getEvents(gameId: number, after: number): Promise<import('../../shared/types/index.js').EventEnvelope[]>
}
