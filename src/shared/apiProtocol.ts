import type { GameState } from '../types/index.js'

export type ApiErrorBody = {
	ok?: false
	error?: string
	code?: string
	detailCode?: string
	currentPhase?: string
}

export type ApiSuccess<T> = {
	ok: true
	status: number
	data: T
}

export type ApiFailure = {
	ok: false
	status: number
	body: ApiErrorBody | unknown
	message: string
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure

export type ScenarioMapSnapshot = {
	width: number
	height: number
	hexes: Array<{ q: number; r: number; t: number }>
}

export type GameStateResponse = {
	gameId: number
	scenarioId: string
	scenarioName?: string
	role: 'onion' | 'defender'
	phase: string
	turnNumber: number
	winner: 'onion' | 'defender' | null
	players: {
		onion: string
		defender: string
	}
	state: GameState
	scenarioMap?: ScenarioMapSnapshot
	eventSeq: number
}

export type EventsResponse = {
	events: Array<{ seq: number; type: string; summary: string; timestamp: string }>
}

export function buildUrl(baseUrl: string, path: string): string {
	const trimmedBaseUrl = baseUrl.trim()
	if (!trimmedBaseUrl) {
		throw new Error('Backend URL is not configured. Please configure the backend URL in your settings.')
	}

	return new URL(path, `${trimmedBaseUrl.endsWith('/') ? trimmedBaseUrl : `${trimmedBaseUrl}/`}`).toString()
}

export async function parseBody(response: Response): Promise<unknown> {
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

export function buildHeaders(token?: string, includeJson = true): HeadersInit {
	const headers: Record<string, string> = {}
	if (includeJson) {
		headers['content-type'] = 'application/json'
	}
	if (token) {
		headers.authorization = `Bearer ${token}`
	}
	return headers
}

export async function requestJson<T>(options: {
	baseUrl: string
	path: string
	method: string
	body?: unknown
	token?: string
	fetchImpl?: typeof fetch
}): Promise<ApiResult<T>> {
	const fetchImpl = options.fetchImpl ?? fetch
	const requestBody = options.body === undefined ? undefined : JSON.stringify(options.body)

	let response: Response
	try {
		response = await fetchImpl(buildUrl(options.baseUrl, options.path), {
			method: options.method,
			headers: buildHeaders(options.token),
			body: requestBody,
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
		const errorBody = typeof parsed === 'object' && parsed !== null ? (parsed as ApiErrorBody) : parsed
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

		if (body.detailCode === 'DUPLICATE_ATTACKER') {
			lines.push('hint: remove duplicate attackers from the command')
		}
		if (body.detailCode === 'TARGET_OUT_OF_RANGE') {
			lines.push('hint: attackers are validated left-to-right; the first out-of-range attacker stops the action')
		}
	} else if (result.message) {
		lines.push(`error: ${result.message}`)
	}

	return lines.join('\n')
}