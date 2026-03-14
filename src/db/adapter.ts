import type { TurnPhase, GameState, EventEnvelope } from '../types/index.js'

export interface MatchRecord {
  gameId: string
  scenarioId: string
  scenarioSnapshot: unknown
  players: { onion: string | null; defender: string | null }
  phase: TurnPhase
  turnNumber: number
  winner: string | null
  state: GameState
  events: EventEnvelope[]
}

export interface DbAdapter {
  // Auth
  findUserByUsername(username: string): Promise<{ userId: string; passwordHash: string } | null>
  createUser(username: string, passwordHash: string): Promise<{ userId: string }>

  // Games
  createMatch(match: MatchRecord): Promise<void>
  findMatch(gameId: string): Promise<MatchRecord | null>
  updateMatchPlayers(gameId: string, players: { onion: string | null; defender: string | null }): Promise<void>
  updateMatchState(gameId: string, phase: TurnPhase, turnNumber: number, winner: string | null, state: GameState): Promise<void>
  appendEvents(gameId: string, events: EventEnvelope[]): Promise<void>
  getEvents(gameId: string, after: number): Promise<EventEnvelope[]>
}
