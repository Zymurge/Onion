import type { Pool } from 'pg'
import type { TurnPhase, GameState, EventEnvelope } from '#shared/types/index'
import { MatchJoinError, MatchManagementError, MatchStartError, StaleMatchStateError } from '#server/db/adapter'
import type { DbAdapter, MatchListFilters, MatchRecord, MatchSummary, PersistMatchProgressInput } from '#server/db/adapter'
import logger from '#server/logger'

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
      'SELECT id, password_hash FROM users WHERE LOWER(username) = $1',
      [username],
    )
    if (rows.length === 0) return null
    return { userId: rows[0].id, passwordHash: rows[0].password_hash }
  }

  async findUserByEmail(email: string): Promise<{ userId: string; username: string; email: string; passwordHash: string } | null> {
    const { rows } = await this.pool.query<{ id: string; username: string; email: string; password_hash: string }>(
      'SELECT id, username, email, password_hash FROM users WHERE LOWER(email) = $1',
      [email],
    )
    if (rows.length === 0) return null
    return { userId: rows[0].id, username: rows[0].username, email: rows[0].email, passwordHash: rows[0].password_hash }
  }

  async createUser(username: string, email: string, passwordHash: string): Promise<{ userId: string }> {
    const { rows } = await this.pool.query<{ id: string }>(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
      [username, email, passwordHash],
    )
    return { userId: rows[0].id }
  }

  async createMatch(match: Omit<MatchRecord, 'gameId'>): Promise<{ gameId: number }> {
    // Defensive: ensure displayName is present if possible
    if (typeof match.scenarioSnapshot === 'object' && match.scenarioSnapshot && 'name' in match.scenarioSnapshot && !('displayName' in match.scenarioSnapshot)) {
      const scenarioSnapshot = match.scenarioSnapshot as Record<string, unknown>
      scenarioSnapshot.displayName = scenarioSnapshot.name
    }
    const createdAt = match.createdAt ?? new Date().toISOString()
    const lastActivityAt = match.lastActivityAt ?? createdAt
    const { rows } = await this.pool.query<{ id: number }>(
      `INSERT INTO matches (scenario_id, scenario_snapshot, host_user_id, onion_player_id, defender_player_id, lifecycle_status, current_phase, turn_number, winner, completed_at, created_at, last_activity_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        match.scenarioId,
        JSON.stringify(match.scenarioSnapshot),
        match.hostUserId,
        match.players.onion,
        match.players.defender,
        match.status,
        match.phase,
        match.turnNumber,
        match.winner,
        match.completedAt ?? (match.status === 'completed' ? new Date().toISOString() : null),
        createdAt,
        lastActivityAt,
      ],
    )
    const gameId = rows[0].id
    await this.pool.query('INSERT INTO game_state (match_id, state) VALUES ($1, $2)', [gameId, JSON.stringify(match.state)])
    return { gameId }
  }

  async listMatches(filters: MatchListFilters = {}): Promise<MatchSummary[]> {
    const conditions: string[] = []
    const values: Array<string | number> = []

    if (filters.participantUserId !== undefined) {
      values.push(filters.participantUserId)
      conditions.push(`(onion_player_id = $${values.length} OR defender_player_id = $${values.length})`)
    }
    if (filters.excludeParticipantUserId !== undefined) {
      values.push(filters.excludeParticipantUserId)
      conditions.push(`(onion_player_id IS NULL OR onion_player_id <> $${values.length}) AND (defender_player_id IS NULL OR defender_player_id <> $${values.length})`)
    }
    if (filters.creatorUserId !== undefined) {
      values.push(filters.creatorUserId)
      conditions.push(`host_user_id = $${values.length}`)
    }
    if (filters.completion === 'active') {
      conditions.push("lifecycle_status NOT IN ('completed', 'archived')")
    } else if (filters.completion === 'completed') {
      conditions.push("lifecycle_status = 'completed'")
    } else if (filters.completion === 'history') {
      conditions.push("lifecycle_status IN ('completed', 'archived')")
    }
    if (filters.createdAfter !== undefined) {
      values.push(filters.createdAfter)
      conditions.push(`created_at >= $${values.length}`)
    }
    if (filters.createdBefore !== undefined) {
      values.push(filters.createdBefore)
      conditions.push(`created_at <= $${values.length}`)
    }
    if (filters.lastActivityAfter !== undefined) {
      values.push(filters.lastActivityAfter)
      conditions.push(`last_activity_at >= $${values.length}`)
    }
    if (filters.lastActivityBefore !== undefined) {
      values.push(filters.lastActivityBefore)
      conditions.push(`last_activity_at <= $${values.length}`)
    }
    if (filters.availability === 'open') {
      conditions.push("lifecycle_status = 'waiting'")
      conditions.push('(onion_player_id IS NULL) <> (defender_player_id IS NULL)')
    } else if (filters.availability === 'full') {
      conditions.push('onion_player_id IS NOT NULL AND defender_player_id IS NOT NULL')
    }

    const whereClause = conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`
    const { rows } = await this.pool.query<{
      id: number
      scenario_id: string
      created_at: Date
      last_activity_at: Date
      current_phase: string
      turn_number: number
      winner: string | null
      host_user_id: string
      lifecycle_status: 'waiting' | 'ready' | 'active' | 'completed' | 'archived'
      completed_at: Date | null
      onion_player_id: string | null
      defender_player_id: string | null
    }>(
      `SELECT id, scenario_id, created_at, last_activity_at, host_user_id, lifecycle_status, completed_at, current_phase, turn_number, winner, onion_player_id, defender_player_id
       FROM matches${whereClause} ORDER BY created_at ASC`,
      values,
    )
    return rows.map((m) => ({
      gameId: m.id,
      scenarioId: m.scenario_id,
      phase: m.current_phase as import('../../shared/types/index.js').TurnPhase,
      turnNumber: m.turn_number,
      winner: m.winner,
      hostUserId: m.host_user_id,
      createdAt: m.created_at.toISOString(),
      lastActivityAt: m.last_activity_at.toISOString(),
      status: m.lifecycle_status,
      completedAt: m.completed_at?.toISOString() ?? null,
      players: { onion: m.onion_player_id, defender: m.defender_player_id },
    }))
  }

  async findMatch(gameId: number): Promise<MatchRecord | null> {
    const { rows: mRows } = await this.pool.query<{
      id: number
      scenario_id: string
      scenario_snapshot: unknown
      host_user_id: string
      created_at: Date
      last_activity_at: Date
      onion_player_id: string | null
      defender_player_id: string | null
      lifecycle_status: 'waiting' | 'ready' | 'active' | 'completed' | 'archived'
      completed_at: Date | null
      current_phase: string
      turn_number: number
      winner: string | null
    }>('SELECT id, scenario_id, scenario_snapshot, host_user_id, created_at, last_activity_at, onion_player_id, defender_player_id, lifecycle_status, completed_at, current_phase, turn_number, winner FROM matches WHERE id = $1', [
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
      hostUserId: m.host_user_id,
      players: { onion: m.onion_player_id, defender: m.defender_player_id },
      phase: m.current_phase as TurnPhase,
      turnNumber: m.turn_number,
      winner: m.winner,
      status: m.lifecycle_status,
      createdAt: m.created_at.toISOString(),
      completedAt: m.completed_at?.toISOString() ?? null,
      lastActivityAt: m.last_activity_at.toISOString(),
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

  async archiveMatch(gameId: number, userId: string): Promise<void> {
    const { rows } = await this.pool.query<{ id: number; host_user_id: string; lifecycle_status: string }>(
      'SELECT id, host_user_id, lifecycle_status FROM matches WHERE id = $1',
      [gameId],
    )
    const match = rows[0]
    if (!match) throw new MatchManagementError('MATCH_NOT_FOUND', 'Game not found')
    if (match.host_user_id !== userId) throw new MatchManagementError('NOT_CREATOR', 'Only the game creator can archive it')
    if (match.lifecycle_status !== 'completed') throw new MatchManagementError('INVALID_STATUS', 'Only completed games can be archived')
    await this.pool.query("UPDATE matches SET lifecycle_status = 'archived' WHERE id = $1", [gameId])
  }

  async restoreMatch(gameId: number, userId: string): Promise<void> {
    const { rows } = await this.pool.query<{ id: number; host_user_id: string; lifecycle_status: string }>(
      'SELECT id, host_user_id, lifecycle_status FROM matches WHERE id = $1',
      [gameId],
    )
    const match = rows[0]
    if (!match) throw new MatchManagementError('MATCH_NOT_FOUND', 'Game not found')
    if (match.host_user_id !== userId) throw new MatchManagementError('NOT_CREATOR', 'Only the game creator can restore it')
    if (match.lifecycle_status !== 'archived') throw new MatchManagementError('INVALID_STATUS', 'Only archived games can be restored')
    await this.pool.query("UPDATE matches SET lifecycle_status = 'completed' WHERE id = $1", [gameId])
  }

  async deleteMatch(gameId: number, userId: string): Promise<void> {
    const { rows } = await this.pool.query<{ host_user_id: string }>('SELECT host_user_id FROM matches WHERE id = $1', [gameId])
    const match = rows[0]
    if (!match) throw new MatchManagementError('MATCH_NOT_FOUND', 'Game not found')
    if (match.host_user_id !== userId) throw new MatchManagementError('NOT_CREATOR', 'Only the game creator can delete it')
    await this.pool.query('DELETE FROM matches WHERE id = $1', [gameId])
  }

  async joinMatch(gameId: number, userId: string, causeId: string) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{
        onion_player_id: string | null
        defender_player_id: string | null
        lifecycle_status: 'waiting' | 'ready' | 'active' | 'completed' | 'archived'
      }>('SELECT onion_player_id, defender_player_id, lifecycle_status FROM matches WHERE id = $1 FOR UPDATE', [gameId])
      const match = rows[0]
      if (!match) throw new MatchJoinError('MATCH_NOT_FOUND', 'Game not found')
      if (match.onion_player_id === userId || match.defender_player_id === userId) {
        throw new MatchJoinError('CANNOT_JOIN_OWN_GAME', 'Cannot join your own game')
      }
      const players = { onion: match.onion_player_id, defender: match.defender_player_id }
      if (players.onion !== null && players.defender !== null) {
        throw new MatchJoinError('GAME_FULL', 'Game is already full')
      }
      if (match.lifecycle_status !== 'waiting') {
        throw new MatchJoinError('GAME_NOT_READY', 'Game is no longer accepting players')
      }

      let role: 'onion' | 'defender'
      if (players.onion === null) {
        players.onion = userId
        role = 'onion'
      } else if (players.defender === null) {
        players.defender = userId
        role = 'defender'
      } else {
        throw new MatchJoinError('GAME_FULL', 'Game is already full')
      }

      const { rows: eventRows } = await client.query<{ last_seq: number | null }>(
        'SELECT MAX(seq) AS last_seq FROM game_events WHERE match_id = $1',
        [gameId],
      )
      const event = {
        seq: (eventRows[0]?.last_seq ?? 0) + 1,
        type: 'PLAYER_JOINED',
        timestamp: new Date().toISOString(),
        causeId,
        userId,
        role,
      }
      const { seq, type, timestamp, ...payload } = event

      await client.query(
        "UPDATE matches SET onion_player_id = $1, defender_player_id = $2, lifecycle_status = 'ready', last_activity_at = $4 WHERE id = $3",
        [players.onion, players.defender, gameId, timestamp],
      )
      await client.query(
        'INSERT INTO game_events (match_id, seq, type, payload, timestamp) VALUES ($1, $2, $3, $4, $5)',
        [gameId, seq, type, JSON.stringify(payload), timestamp],
      )
      await client.query('COMMIT')
      return { role, event }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async startMatch(gameId: number, userId: string, causeId: string) {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')
      const { rows } = await client.query<{
        host_user_id: string
        onion_player_id: string | null
        defender_player_id: string | null
        lifecycle_status: 'waiting' | 'ready' | 'active' | 'completed' | 'archived'
      }>('SELECT host_user_id, onion_player_id, defender_player_id, lifecycle_status FROM matches WHERE id = $1 FOR UPDATE', [gameId])
      const match = rows[0]
      if (!match) throw new MatchStartError('MATCH_NOT_FOUND', 'Game not found')
      if (match.host_user_id !== userId) {
        throw new MatchStartError('NOT_HOST', 'Only the host can start the game')
      }
      if (match.lifecycle_status === 'waiting' || match.onion_player_id === null || match.defender_player_id === null) {
        throw new MatchStartError('GAME_NOT_READY', 'Game is not ready to start')
      }
      if (match.lifecycle_status !== 'ready') {
        throw new MatchStartError('GAME_ALREADY_STARTED', 'Game has already started')
      }

      const { rows: eventRows } = await client.query<{ last_seq: number | null }>(
        'SELECT MAX(seq) AS last_seq FROM game_events WHERE match_id = $1',
        [gameId],
      )
      const event = {
        seq: (eventRows[0]?.last_seq ?? 0) + 1,
        type: 'STARTED',
        timestamp: new Date().toISOString(),
        causeId,
        userId,
      }
      const { seq, type, timestamp, ...payload } = event

      await client.query("UPDATE matches SET lifecycle_status = 'active', last_activity_at = $2 WHERE id = $1", [gameId, timestamp])
      await client.query(
        'INSERT INTO game_events (match_id, seq, type, payload, timestamp) VALUES ($1, $2, $3, $4, $5)',
        [gameId, seq, type, JSON.stringify(payload), timestamp],
      )
      await client.query('COMMIT')
      return { event }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
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

    logger.debug({ gameId: input.gameId, expectedLastEventSeq: input.expectedLastEventSeq, phase: input.phase, turnNumber: input.turnNumber, events: input.events, state: input.state }, 'Persisting match progress (postgres)')

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

      const lastActivityAt = input.events.at(-1)?.timestamp ?? null
      await client.query("UPDATE matches SET current_phase = $1, turn_number = $2, winner = $3, lifecycle_status = $4, completed_at = CASE WHEN $4 = 'completed' AND lifecycle_status <> 'completed' THEN COALESCE(completed_at, NOW()) ELSE completed_at END, last_activity_at = COALESCE($6::timestamptz, last_activity_at) WHERE id = $5", [
        input.phase,
        input.turnNumber,
        input.winner,
        input.status,
        input.gameId,
        lastActivityAt,
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
    const lastActivityAt = events.at(-1)?.timestamp
    if (lastActivityAt !== undefined) {
      await this.pool.query('UPDATE matches SET last_activity_at = GREATEST(last_activity_at, $2::timestamptz) WHERE id = $1', [gameId, lastActivityAt])
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
