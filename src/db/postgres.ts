import type { Pool } from 'pg'
import type { TurnPhase, GameState, EventEnvelope } from '../types/index.js'
import type { DbAdapter, MatchRecord } from './adapter.js'

export class PostgresDb implements DbAdapter {
  constructor(private readonly pool: Pool) {}

  async findUserByUsername(username: string): Promise<{ userId: string; passwordHash: string } | null> {
    const { rows } = await this.pool.query<{ id: string; password_hash: string }>(
      'SELECT id, password_hash FROM users WHERE username = $1',
      [username],
    )
    if (rows.length === 0) return null
    return { userId: rows[0].id, passwordHash: rows[0].password_hash }
  }

  async createUser(username: string, passwordHash: string): Promise<{ userId: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id',
      [username, passwordHash],
    )
    return { userId: rows[0].id }
  }

  async createMatch(match: MatchRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO matches (id, scenario_id, scenario_snapshot, onion_player_id, defender_player_id, current_phase, turn_number, winner)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        match.gameId,
        match.scenarioId,
        JSON.stringify(match.scenarioSnapshot),
        match.players.onion,
        match.players.defender,
        match.phase,
        match.turnNumber,
        match.winner,
      ],
    )
    await this.pool.query('INSERT INTO game_state (match_id, state) VALUES ($1, $2)', [
      match.gameId,
      JSON.stringify(match.state),
    ])
  }

  async findMatch(gameId: string): Promise<MatchRecord | null> {
    const { rows: mRows } = await this.pool.query<{
      id: string
      scenario_id: string
      scenario_snapshot: unknown
      onion_player_id: string | null
      defender_player_id: string | null
      current_phase: string
      turn_number: number
      winner: string | null
    }>('SELECT id, scenario_id, scenario_snapshot, onion_player_id, defender_player_id, current_phase, turn_number, winner FROM matches WHERE id = $1', [
      gameId,
    ])
    if (mRows.length === 0) return null
    const m = mRows[0]

    const { rows: sRows } = await this.pool.query<{ state: GameState }>(
      'SELECT state FROM game_state WHERE match_id = $1',
      [gameId],
    )

    const { rows: eRows } = await this.pool.query<{
      seq: number
      type: string
      payload: Record<string, unknown>
      timestamp: Date
    }>('SELECT seq, type, payload, timestamp FROM game_events WHERE match_id = $1 ORDER BY seq', [gameId])

    return {
      gameId: m.id,
      scenarioId: m.scenario_id,
      scenarioSnapshot: m.scenario_snapshot,
      players: { onion: m.onion_player_id, defender: m.defender_player_id },
      phase: m.current_phase as TurnPhase,
      turnNumber: m.turn_number,
      winner: m.winner,
      state: sRows[0].state,
      events: eRows.map((e) => ({ seq: e.seq, type: e.type, timestamp: e.timestamp.toISOString(), ...e.payload })),
    }
  }

  async updateMatchPlayers(gameId: string, players: { onion: string | null; defender: string | null }): Promise<void> {
    await this.pool.query(
      'UPDATE matches SET onion_player_id = $1, defender_player_id = $2 WHERE id = $3',
      [players.onion, players.defender, gameId],
    )
  }

  async updateMatchState(gameId: string, phase: TurnPhase, turnNumber: number, winner: string | null, state: GameState): Promise<void> {
    await this.pool.query('UPDATE matches SET current_phase = $1, turn_number = $2, winner = $3 WHERE id = $4', [
      phase,
      turnNumber,
      winner,
      gameId,
    ])
    await this.pool.query('UPDATE game_state SET state = $1, updated_at = NOW() WHERE match_id = $2', [
      JSON.stringify(state),
      gameId,
    ])
  }

  async appendEvents(gameId: string, events: EventEnvelope[]): Promise<void> {
    for (const event of events) {
      const { seq, type, timestamp, ...payload } = event
      await this.pool.query(
        'INSERT INTO game_events (match_id, seq, type, payload, timestamp) VALUES ($1, $2, $3, $4, $5)',
        [gameId, seq, type, JSON.stringify(payload), timestamp],
      )
    }
  }

  async getEvents(gameId: string, after: number): Promise<EventEnvelope[]> {
    const { rows } = await this.pool.query<{
      seq: number
      type: string
      payload: Record<string, unknown>
      timestamp: Date
    }>('SELECT seq, type, payload, timestamp FROM game_events WHERE match_id = $1 AND seq > $2 ORDER BY seq', [
      gameId,
      after,
    ])
    return rows.map((e) => ({ seq: e.seq, type: e.type, timestamp: e.timestamp.toISOString(), ...e.payload }))
  }
}
