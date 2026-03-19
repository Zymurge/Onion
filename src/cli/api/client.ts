import type { ActionOkResponse, Command, EventEnvelope, GameState, TurnPhase } from '../../types/index.js'
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

  try {
    response = await fetch(buildUrl(session, path), {
      method,
      headers: buildHeaders(session),
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (error) {
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

export function getGame(session: SessionStore, gameId: string): Promise<ApiResult<GameStateResponse>> {
  return requestJson<GameStateResponse>(session, 'GET', `games/${gameId}`)
}

export function getEvents(session: SessionStore, gameId: string, after = 0): Promise<ApiResult<EventsResponse>> {
  return requestJson<EventsResponse>(session, 'GET', `games/${gameId}/events?after=${after}`)
}

export function submitAction(session: SessionStore, gameId: string, command: Command): Promise<ApiResult<ActionResponse>> {
  return requestJson<ActionResponse>(session, 'POST', `games/${gameId}/actions`, command)
}