import type { ActionOkResponse, Command, EventEnvelope, GameState, TurnPhase } from '../../types/index.js'
import logger from '../../logger.js'
import type { SessionRole, SessionStore } from '../session/store.js'

type ApiErrorBody = {
  ok?: false
  error?: string
  code?: string
  detailCode?: string
  currentPhase?: string
}

type ApiSuccess<T> = {
  ok: true
  status: number
  data: T
}

type ApiFailure = {
  ok: false
  status: number
  body: ApiErrorBody | unknown
  message: string
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

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
  gameId: string
  role: SessionRole
}

export type GameStateResponse = {
  gameId: string
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

function buildUrl(session: SessionStore, path: string): string {
  const baseUrl = session.baseUrl?.trim()
  if (!baseUrl) {
    throw new Error('Backend URL is not configured. Use: config set url <url>')
  }

  return new URL(path, `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}`).toString()
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return text
  }
}

function buildHeaders(session: SessionStore, includeJson = true): HeadersInit {
  const headers: Record<string, string> = {}
  if (includeJson) {
    headers['content-type'] = 'application/json'
  }
  if (session.token) {
    headers.authorization = `Bearer ${session.token}`
  }
  return headers
}

async function requestJson<T>(
  session: SessionStore,
  method: string,
  path: string,
  body?: unknown,
): Promise<ApiResult<T>> {
  let response: Response
  const requestBody = sanitizeRequestBody(body)

  logger.debug(
    {
      method,
      path,
      request: requestBody,
    },
    'CLI -> backend request',
  )

  try {
    response = await fetch(buildUrl(session, path), {
      method,
      headers: buildHeaders(session),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
    logger.error(
      {
        method,
        path,
        error: error instanceof Error ? error.message : String(error),
      },
      'CLI network error while calling backend',
    )
    return {
      ok: false,
      status: 0,
      body: null,
      message: error instanceof Error ? error.message : 'Unknown network error',
    }
  }

  const parsed = await parseBody(response)
  if (!response.ok) {
    const errorBody = typeof parsed === 'object' && parsed !== null ? parsed as ApiErrorBody : parsed
    logger.debug(
      {
        method,
        path,
        status: response.status,
        response: summarizeResponse(parsed),
      },
      'CLI <- backend error response',
    )
    return {
      ok: false,
      status: response.status,
      body: errorBody,
      message:
        typeof errorBody === 'object' && errorBody !== null && 'error' in errorBody && typeof errorBody.error === 'string'
          ? errorBody.error
          : response.statusText || 'Request failed',
    }
  }

  logger.debug(
    {
      method,
      path,
      status: response.status,
      response: summarizeResponse(parsed),
    },
    'CLI <- backend response',
  )

  return {
    ok: true,
    status: response.status,
    data: parsed as T,
  }
}

export function formatApiError(result: ApiFailure): string {
  const lines = ['Request failed', `status: ${result.status || '(network error)'}`]
  if (typeof result.body === 'object' && result.body !== null) {
    const body = result.body as ApiErrorBody
    if (body.code) lines.push(`code: ${body.code}`)
    if (body.detailCode) lines.push(`detailCode: ${body.detailCode}`)
    if (body.currentPhase) lines.push(`phase: ${body.currentPhase}`)
    if (body.error) lines.push(`error: ${body.error}`)
  } else if (result.message) {
    lines.push(`error: ${result.message}`)
  }

  return lines.join('\n')
}

export function registerUser(session: SessionStore, username: string, password: string): Promise<ApiResult<AuthResponse>> {
  return requestJson<AuthResponse>(session, 'POST', 'auth/register', { username, password })
}

export function loginUser(session: SessionStore, username: string, password: string): Promise<ApiResult<AuthResponse>> {
  return requestJson<AuthResponse>(session, 'POST', 'auth/login', { username, password })
}

export function listScenarios(session: SessionStore): Promise<ApiResult<ScenarioSummary[]>> {
  return requestJson<ScenarioSummary[]>(session, 'GET', 'scenarios')
}

export function getScenario(session: SessionStore, scenarioId: string): Promise<ApiResult<ScenarioDetail>> {
  return requestJson<ScenarioDetail>(session, 'GET', `scenarios/${scenarioId}`)
}

export function createGame(
  session: SessionStore,
  scenarioId: string,
  role: SessionRole,
): Promise<ApiResult<CreateOrJoinGameResponse>> {
  return requestJson<CreateOrJoinGameResponse>(session, 'POST', 'games', { scenarioId, role })
}

export function joinGame(session: SessionStore, gameId: string): Promise<ApiResult<CreateOrJoinGameResponse>> {
  return requestJson<CreateOrJoinGameResponse>(session, 'POST', `games/${gameId}/join`, {})
}

export type GameListEntry = {
  gameId: string
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
  return requestJson<GameListResponse>(session, 'GET', 'games')
}

export function getGame(session: SessionStore, gameId: string): Promise<ApiResult<GameStateResponse>> {
  return requestJson<GameStateResponse>(session, 'GET', `games/${gameId}`)
}

export function getEvents(session: SessionStore, gameId: string, after = 0): Promise<ApiResult<EventsResponse>> {
  return requestJson<EventsResponse>(session, 'GET', `games/${gameId}/events?after=${after}`)
}

export function submitAction(session: SessionStore, gameId: string, command: Command): Promise<ApiResult<ActionResponse>> {
  return requestJson<ActionResponse>(session, 'POST', `games/${gameId}/actions`, command)
}