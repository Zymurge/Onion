import logger from '../../logger.js'
import type { ActionOkResponse, Command, EventEnvelope, GameState, TurnPhase } from '../../types/index.js'
export { formatApiError } from '../../shared/apiProtocol.js'
import { requestJson, type ApiResult } from '../../shared/apiProtocol.js'
import type { SessionRole, SessionStore } from '../session/store.js'

export type AuthResponse = {
  userId: string
  token: string
}

export type ScenarioSummary = {
  id: string
  name: string
  description: string
}

export type CreateOrJoinGameResponse = {
  gameId: number
  role: SessionRole
}

export type GameStateResponse = {
  gameId: number
  scenarioId: string
  scenarioName?: string
  phase: TurnPhase
  turnNumber: number
  winner: 'onion' | 'defender' | null
  players: {
    onion: string
    defender: string
  }
  state: GameState
  eventSeq: number
}

export type ScenarioDetail = {
  id: string
  name: string
  description: string
  map: {
    width: number
    height: number
    hexes: Array<{ q: number; r: number; t: number }>
  }
  initialState?: unknown
  victoryConditions?: unknown
}

export type EventsResponse = {
  events: EventEnvelope[]
}

export type ActionResponse = ActionOkResponse & {
  turnNumber?: number
  eventSeq?: number
}

function sanitizeRequestBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') {
    return body
  }

  if ('password' in body) {
    const { password: _password, ...rest } = body as Record<string, unknown>
    return { ...rest, password: '(redacted)' }
  }

  return body
}

function summarizeResponse(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) {
    return {
      kind: 'array',
      count: data.length,
    }
  }

  if (!data || typeof data !== 'object') {
    return { value: data }
  }

  const record = data as Record<string, unknown>
  const summary: Record<string, unknown> = {}

  if ('userId' in record) summary.userId = record.userId
  if ('gameId' in record) summary.gameId = record.gameId
  if ('role' in record) summary.role = record.role
  if ('scenarioId' in record) summary.scenarioId = record.scenarioId
  if ('phase' in record) summary.phase = record.phase
  if ('turnNumber' in record) summary.turnNumber = record.turnNumber
  if ('winner' in record) summary.winner = record.winner
  if ('eventSeq' in record) summary.eventSeq = record.eventSeq
  if ('seq' in record) summary.seq = record.seq
  if ('events' in record && Array.isArray(record.events)) {
    summary.eventCount = record.events.length
    summary.eventTypes = record.events.map((event) =>
      typeof event === 'object' && event !== null && 'type' in event ? (event as Record<string, unknown>).type : 'UNKNOWN',
    )
  }

  if (Object.keys(summary).length === 0) {
    summary.keys = Object.keys(record)
  }

  return summary
}

async function requestBackendJson<T>(
  session: SessionStore,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  const requestBody = sanitizeRequestBody(body)

  logger.debug(
    {
      method,
      path,
      request: requestBody,
    },
    'CLI -> backend request',
  )

  const result = await requestJson<T>({
    baseUrl: session.baseUrl ?? '',
    path,
    method,
    body,
    token: session.token ?? undefined,
  })

  if (!result.ok) {
    logger.debug(
      {
        method,
        path,
        status: result.status,
        response: summarizeResponse(result.body),
      },
      'CLI <- backend error response',
    )
    return result
  }

  logger.debug(
    {
      method,
      path,
      status: result.status,
      response: summarizeResponse(result.data),
    },
    'CLI <- backend response',
  )

  return result
}

export function registerUser(session: SessionStore, username: string, password: string): Promise<ApiResult<AuthResponse>> {
  return requestBackendJson<AuthResponse>(session, 'POST', 'auth/register', { username, password })
}

export function loginUser(session: SessionStore, username: string, password: string): Promise<ApiResult<AuthResponse>> {
  return requestBackendJson<AuthResponse>(session, 'POST', 'auth/login', { username, password })
}

export function listScenarios(session: SessionStore): Promise<ApiResult<ScenarioSummary[]>> {
  return requestBackendJson<ScenarioSummary[]>(session, 'GET', 'scenarios')
}

export function getScenario(session: SessionStore, scenarioId: string): Promise<ApiResult<ScenarioDetail>> {
  return requestBackendJson<ScenarioDetail>(session, 'GET', `scenarios/${scenarioId}`)
}

export function createGame(
  session: SessionStore,
  scenarioId: string,
  role: SessionRole,
): Promise<ApiResult<CreateOrJoinGameResponse>> {
  return requestBackendJson<CreateOrJoinGameResponse>(session, 'POST', 'games', { scenarioId, role })
}

export function joinGame(session: SessionStore, gameId: string): Promise<ApiResult<CreateOrJoinGameResponse>> {
  return requestBackendJson<CreateOrJoinGameResponse>(session, 'POST', `games/${gameId}/join`, {})
}

export type GameListEntry = {
  gameId: number
  scenarioId: string
  phase: string
  turnNumber: number
  winner: string | null
  role: 'onion' | 'defender'
}

export type GameListResponse = {
  games: GameListEntry[]
}

export function listGames(session: SessionStore): Promise<ApiResult<GameListResponse>> {
  return requestBackendJson<GameListResponse>(session, 'GET', 'games')
}

export function getGame(session: SessionStore, gameId: string): Promise<ApiResult<GameStateResponse>> {
  return requestBackendJson<GameStateResponse>(session, 'GET', `games/${gameId}`)
}

export function getEvents(session: SessionStore, gameId: string, after = 0): Promise<ApiResult<EventsResponse>> {
  return requestBackendJson<EventsResponse>(session, 'GET', `games/${gameId}/events?after=${after}`)
}

export function submitAction(session: SessionStore, gameId: string, command: Command): Promise<ApiResult<ActionResponse>> {
  return requestBackendJson<ActionResponse>(session, 'POST', `games/${gameId}/actions`, command)
}