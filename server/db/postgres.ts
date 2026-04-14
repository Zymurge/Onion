import type { Pool } from 'pg'
import type { TurnPhase, GameState, EventEnvelope } from '#shared/types/index'
import { StaleMatchStateError } from '#server/db/adapter'
import type { DbAdapter, MatchRecord, PersistMatchProgressInput } from '#server/db/adapter'

/**
 * PostgreSQL implementation of DbAdapter for production use.
 *
 * Uses the pg library to execute SQL queries against a PostgreSQL database.
 * Assumes the database schema has been initialized via migrations.
 *
 * Thread-safe for concurrent requests (pg Pool handles connection pooling).
 */
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

  async createMatch(match: Omit<MatchRecord, 'gameId'>): Promise<{ gameId: number }> {
    // Defensive: ensure displayName is present if possible
    if (typeof match.scenarioSnapshot === 'object' && match.scenarioSnapshot && 'name' in match.scenarioSnapshot && !('displayName' in match.scenarioSnapshot)) {
      (match.scenarioSnapshot as any).displayName = (match.scenarioSnapshot as any).name
    }
    const { rows } = await this.pool.query<{ id: number }>(
      `INSERT INTO matches (scenario_id, scenario_snapshot, onion_player_id, defender_player_id, current_phase, turn_number, winner)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        match.scenarioId,
        JSON.stringify(match.scenarioSnapshot),
        match.players.onion,
        match.players.defender,
        match.phase,
        match.turnNumber,
        match.winner,
      ],
    )
    const gameId = rows[0].id
    await this.pool.query('INSERT INTO game_state (match_id, state) VALUES ($1, $2)', [gameId, JSON.stringify(match.state)])
    return { gameId }
  }

  async listMatchesByUserId(userId: string): Promise<Array<Pick<MatchRecord, 'gameId' | 'scenarioId' | 'phase' | 'turnNumber' | 'winner' | 'players'>>> {
    const { rows } = await this.pool.query<{
      id: number
      scenario_id: string
      current_phase: string
      turn_number: number
      winner: string | null
      onion_player_id: string | null
      defender_player_id: string | null
    }>(
      `SELECT id, scenario_id, current_phase, turn_number, winner, onion_player_id, defender_player_id
       FROM matches WHERE onion_player_id = $1 OR defender_player_id = $1 ORDER BY created_at ASC`,
      [userId],
    )
    return rows.map((m) => ({
      gameId: m.id,
      scenarioId: m.scenario_id,
      phase: m.current_phase as import('../../shared/types/index.js').TurnPhase,
      turnNumber: m.turn_number,
      winner: m.winner,
      players: { onion: m.onion_player_id, defender: m.defender_player_id },
    }))
  }

  async findMatch(gameId: number): Promise<MatchRecord | null> {
    const { rows: mRows } = await this.pool.query<{
      id: number
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

  async updateMatchPlayers(gameId: number, players: { onion: string | null; defender: string | null }): Promise<void> {
    await this.pool.query(
      'UPDATE matches SET onion_player_id = $1, defender_player_id = $2 WHERE id = $3',
      [players.onion, players.defender, gameId],
    )
  }

  async updateMatchState(gameId: number, phase: TurnPhase, turnNumber: number, winner: string | null, state: GameState): Promise<void> {
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

  async persistMatchProgress(input: PersistMatchProgressInput): Promise<void> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      await client.query('SELECT id FROM matches WHERE id = $1 FOR UPDATE', [input.gameId])

      const { rows } = await client.query<{ last_seq: number | null }>(
        'SELECT MAX(seq) AS last_seq FROM game_events WHERE match_id = $1',
        [input.gameId],
      )

      const currentLastSeq = rows[0]?.last_seq ?? 0
      if (currentLastSeq !== input.expectedLastEventSeq) {
        throw new StaleMatchStateError(
          `Expected last seq ${input.expectedLastEventSeq} but found ${currentLastSeq}`,
        )
      }

      await client.query('UPDATE matches SET current_phase = $1, turn_number = $2, winner = $3 WHERE id = $4', [
        input.phase,
        input.turnNumber,
        input.winner,
        input.gameId,
      ])

      await client.query('UPDATE game_state SET state = $1, updated_at = NOW() WHERE match_id = $2', [
        JSON.stringify(input.state),
        input.gameId,
      ])

      for (const event of input.events) {
        const { seq, type, timestamp, ...payload } = event
        await client.query(
          'INSERT INTO game_events (match_id, seq, type, payload, timestamp) VALUES ($1, $2, $3, $4, $5)',
          [input.gameId, seq, type, JSON.stringify(payload), timestamp],
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async appendEvents(gameId: number, events: EventEnvelope[]): Promise<void> {
    for (const event of events) {
      const { seq, type, timestamp, ...payload } = event
      await this.pool.query(
        'INSERT INTO game_events (match_id, seq, type, payload, timestamp) VALUES ($1, $2, $3, $4, $5)',
        [gameId, seq, type, JSON.stringify(payload), timestamp],
      )
    }
  }

  async getEvents(gameId: number, after: number): Promise<EventEnvelope[]> {
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
