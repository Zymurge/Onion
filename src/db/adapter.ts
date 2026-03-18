/**
 * Represents a complete match record stored in the database.
 * Contains all persistent state for a game including players, current phase,
 * game state, and event history.
 */
export interface MatchRecord {
  /** Unique identifier for the match */
  gameId: string
  /** ID of the scenario being played */
  scenarioId: string
  /** Full scenario JSON snapshot taken at match creation */
  scenarioSnapshot: unknown
  /** Player assignments - null if slot is open */
  players: { onion: string | null; defender: string | null }
  /** Current turn phase */
  phase: import('../types/index.js').TurnPhase
  /** Current turn number (1-based) */
  turnNumber: number
  /** Winner userId if game is over, null otherwise */
  winner: string | null
  /** Current game state (unit positions, health, etc.) */
  state: import('../types/index.js').GameState
  /** Ordered list of all events that have occurred */
  events: import('../types/index.js').EventEnvelope[]
}

/**
 * Thrown when persisting an action against stale match/event state.
 */
export class StaleMatchStateError extends Error {
  constructor(message = 'Match state is stale') {
    super(message)
    this.name = 'StaleMatchStateError'
  }
}

export interface PersistMatchProgressInput {
  gameId: string
  phase: import('../types/index.js').TurnPhase
  turnNumber: number
  winner: string | null
  state: import('../types/index.js').GameState
  events: import('../types/index.js').EventEnvelope[]
  expectedLastEventSeq: number
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
   * Find a user by their username.
   * @param username - The username to search for (case-sensitive)
   * @returns User record if found, null otherwise
   */
  findUserByUsername(username: string): Promise<{ userId: string; passwordHash: string } | null>

  /**
   * Create a new user account.
   * @param username - Unique username (enforced by implementation)
   * @param passwordHash - Pre-hashed password string
   * @returns The assigned userId
   * @throws Error if username already exists
   */
  createUser(username: string, passwordHash: string): Promise<{ userId: string }>

  // Game operations

  /**
   * Persist a new match to storage.
   * @param match - Complete match record to store
   */
  createMatch(match: MatchRecord): Promise<void>

  /**
   * Retrieve a match by its gameId.
   * @param gameId - The match identifier
   * @returns Complete match record if found, null otherwise
   */
  findMatch(gameId: string): Promise<MatchRecord | null>

  /**
   * Update player assignments for an existing match.
   * @param gameId - The match to update
   * @param players - New player assignments
   */
  updateMatchPlayers(gameId: string, players: { onion: string | null; defender: string | null }): Promise<void>

  /**
   * Update the game state, phase, and turn for an existing match.
   * @param gameId - The match to update
   * @param phase - New turn phase
   * @param turnNumber - New turn number
   * @param winner - Winner if game ended, null otherwise
   * @param state - New game state
   */
  updateMatchState(gameId: string, phase: import('../types/index.js').TurnPhase, turnNumber: number, winner: string | null, state: import('../types/index.js').GameState): Promise<void>

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
  appendEvents(gameId: string, events: import('../types/index.js').EventEnvelope[]): Promise<void>

  /**
   * Retrieve events for a match after a given sequence number.
   * Used for event polling by clients.
   * @param gameId - The match to query
   * @param after - Return events with seq > after (0 for all events)
   * @returns Events in ascending sequence order
   */
  getEvents(gameId: string, after: number): Promise<import('../types/index.js').EventEnvelope[]>
}
