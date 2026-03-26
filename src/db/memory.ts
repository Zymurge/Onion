import { randomUUID } from 'node:crypto'
import type { TurnPhase, GameState, EventEnvelope } from '../types/index.js'
import { StaleMatchStateError } from './adapter.js'
import type { DbAdapter, MatchRecord, PersistMatchProgressInput } from './adapter.js'

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
    // Defensive: ensure displayName is present if possible
    if (typeof match.scenarioSnapshot === 'object' && match.scenarioSnapshot && 'name' in match.scenarioSnapshot && !('displayName' in match.scenarioSnapshot)) {
      (match.scenarioSnapshot as any).displayName = (match.scenarioSnapshot as any).name
    }
    this.matches.set(match.gameId, structuredClone(match))
  }

  async findMatch(gameId: string): Promise<MatchRecord | null> {
    const m = this.matches.get(gameId)
    return m ? structuredClone(m) : null
  }

  async listMatchesByUserId(userId: string): Promise<Array<Pick<MatchRecord, 'gameId' | 'scenarioId' | 'phase' | 'turnNumber' | 'winner' | 'players'>>> {
    const results: Array<Pick<MatchRecord, 'gameId' | 'scenarioId' | 'phase' | 'turnNumber' | 'winner' | 'players'>> = []
    for (const m of this.matches.values()) {
      if (m.players.onion === userId || m.players.defender === userId) {
        results.push({ gameId: m.gameId, scenarioId: m.scenarioId, phase: m.phase, turnNumber: m.turnNumber, winner: m.winner, players: m.players })
      }
    }
    return results
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

  async persistMatchProgress(input: PersistMatchProgressInput): Promise<void> {
    const m = this.matches.get(input.gameId)
    if (!m) throw new Error(`Match not found: ${input.gameId}`)

    const currentLastSeq = m.events.at(-1)?.seq ?? 0
    if (currentLastSeq !== input.expectedLastEventSeq) {
      throw new StaleMatchStateError(
        `Expected last seq ${input.expectedLastEventSeq} but found ${currentLastSeq}`,
      )
    }

    m.phase = input.phase
    m.turnNumber = input.turnNumber
    m.winner = input.winner
    m.state = structuredClone(input.state)
    m.events.push(...structuredClone(input.events))
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
