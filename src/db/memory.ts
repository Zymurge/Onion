import { randomUUID } from 'node:crypto'
import type { TurnPhase, GameState, EventEnvelope } from '../types/index.js'
import type { DbAdapter, MatchRecord } from './adapter.js'

/**
 * In-memory implementation of DbAdapter for testing and development.
 *
 * Stores all data in Map objects within the instance. Each instance maintains
 * its own isolated data store. Not suitable for production use.
 *
 * Thread-safe for single-threaded Node.js usage (no external concurrency).
 */
export class InMemoryDb implements DbAdapter {
  private users = new Map<string, UserRecord>() // keyed by username
  private matches = new Map<string, MatchRecord>() // keyed by gameId

  async findUserByUsername(username: string): Promise<{ userId: string; passwordHash: string } | null> {
    const record = this.users.get(username)
    return record ? { userId: record.userId, passwordHash: record.passwordHash } : null
  }

  async createUser(username: string, passwordHash: string): Promise<{ userId: string }> {
    const userId = randomUUID()
    this.users.set(username, { userId, passwordHash })
    return { userId }
  }

  async createMatch(match: MatchRecord): Promise<void> {
    this.matches.set(match.gameId, structuredClone(match))
  }

  async findMatch(gameId: string): Promise<MatchRecord | null> {
    const m = this.matches.get(gameId)
    return m ? structuredClone(m) : null
  }

  async updateMatchPlayers(gameId: string, players: { onion: string | null; defender: string | null }): Promise<void> {
    const m = this.matches.get(gameId)
    if (!m) throw new Error(`Match not found: ${gameId}`)
    m.players = players
  }

  async updateMatchState(gameId: string, phase: TurnPhase, turnNumber: number, winner: string | null, state: GameState): Promise<void> {
    const m = this.matches.get(gameId)
    if (!m) throw new Error(`Match not found: ${gameId}`)
    m.phase = phase
    m.turnNumber = turnNumber
    m.winner = winner
    m.state = structuredClone(state)
  }

  async appendEvents(gameId: string, events: EventEnvelope[]): Promise<void> {
    const m = this.matches.get(gameId)
    if (!m) throw new Error(`Match not found: ${gameId}`)
    m.events.push(...events)
  }

  async getEvents(gameId: string, after: number): Promise<EventEnvelope[]> {
    const m = this.matches.get(gameId)
    if (!m) return []
    return m.events.filter((e) => e.seq > after)
  }
}

/** Internal user record structure for InMemoryDb */
interface UserRecord {
  userId: string
  passwordHash: string
}
