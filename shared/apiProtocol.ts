import type { GameState } from './types/index.js'

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

export type VictoryObjectiveKind = 'destroy-unit' | 'escape-map'

export type VictoryObjectiveState = {
	id: string
	label: string
	kind: VictoryObjectiveKind
	required: boolean
	completed: boolean
	unitId?: string
	unitType?: string
}

export type ApiProtocolTrafficDirection = 'request' | 'response' | 'error'

export type ApiProtocolTrafficEntry = {
	id: number
	timestamp: string
	direction: ApiProtocolTrafficDirection
	method: string
	path: string
	status?: number
	requestBody?: unknown
	responseBody?: unknown
	message?: string
}

type ApiProtocolTrafficListener = (entry: ApiProtocolTrafficEntry) => void

const API_PROTOCOL_TRAFFIC_LIMIT = 200

let apiProtocolTrafficSeq = 0
const apiProtocolTrafficLog: ApiProtocolTrafficEntry[] = []
const apiProtocolTrafficListeners = new Set<ApiProtocolTrafficListener>()

function redactProtocolValue(value: unknown, seen = new WeakSet<object>()): unknown {
	if (value === null || value === undefined) {
		return value
	}

	if (Array.isArray(value)) {
		return value.map((item) => redactProtocolValue(item, seen))
	}

	if (typeof value !== 'object') {
		return value
	}

	if (seen.has(value)) {
		return '[Circular]'
	}

	seen.add(value)

	const record = value as Record<string, unknown>
	return Object.fromEntries(
		Object.entries(record).map(([key, entryValue]) => {
			if (key === 'password' || key === 'token' || key === 'authorization') {
				return [key, '(redacted)']
			}

			return [key, redactProtocolValue(entryValue, seen)]
		}),
	)
}


function formatJsonPayloadLines(value: unknown): string[] {
	if (value === undefined) {
		return []
	}

	const redacted = redactProtocolValue(value)
	const serialized = JSON.stringify(redacted, null, 2)

	if (serialized === undefined) {
		return []
	}

	return serialized.split('\n').map((line) => `  ${line}`)
}

function appendFormattedPayload(lines: string[], label: 'request' | 'response', value: unknown): void {
	const payloadLines = formatJsonPayloadLines(value)
	if (payloadLines.length === 0) {
		return
	}

	lines.push(`${label}:`)
	lines.push(...payloadLines)
}

function pushApiProtocolTraffic(entry: Omit<ApiProtocolTrafficEntry, 'id' | 'timestamp'>) {
	const record: ApiProtocolTrafficEntry = {
		id: ++apiProtocolTrafficSeq,
		timestamp: new Date().toISOString(),
		...entry,
	}

	apiProtocolTrafficLog.push(record)
	if (apiProtocolTrafficLog.length > API_PROTOCOL_TRAFFIC_LIMIT) {
		apiProtocolTrafficLog.splice(0, apiProtocolTrafficLog.length - API_PROTOCOL_TRAFFIC_LIMIT)
	}

	for (const listener of apiProtocolTrafficListeners) {
		listener(record)
	}
}

export function getApiProtocolTrafficSnapshot(): ApiProtocolTrafficEntry[] {
	return apiProtocolTrafficLog.slice()
}

export function subscribeApiProtocolTraffic(listener: ApiProtocolTrafficListener): () => void {
	apiProtocolTrafficListeners.add(listener)
	return () => {
		apiProtocolTrafficListeners.delete(listener)
	}
}

export function clearApiProtocolTraffic(): void {
	apiProtocolTrafficLog.length = 0
	apiProtocolTrafficSeq = 0
}

export function getApiProtocolTrafficVersion(): number {
	return apiProtocolTrafficSeq
}

export function sanitizeApiProtocolTrafficEntry(entry: ApiProtocolTrafficEntry): ApiProtocolTrafficEntry {
	return {
		...entry,
		requestBody: redactProtocolValue(entry.requestBody),
		responseBody: redactProtocolValue(entry.responseBody),
	}
}

export function formatApiProtocolTrafficEntry(entry: ApiProtocolTrafficEntry): string[] {
	const time = new Date(entry.timestamp).toLocaleTimeString([], {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	})
	const direction = entry.direction === 'request' ? '→' : entry.direction === 'response' ? '←' : '!'
	const requestLine = `${direction} ${entry.method} ${entry.path}`
	const lines = [`[${time}] ${requestLine}`]

	if (entry.status !== undefined) {
		lines.push(`status: ${entry.status}`)
	}

	if (entry.message !== undefined) {
		lines.push(`message: ${entry.message}`)
	}

	appendFormattedPayload(lines, 'request', entry.requestBody)

	appendFormattedPayload(lines, 'response', entry.responseBody)

	return lines
}

/**
 * Canonical scenario map snapshot for all game state responses.
 *
 * - `cells` is the only supported geometry representation. All clients and tests must require it.
 * - `hexes` contains terrain and type information for each cell.
 * - `width` and `height` are provided for convenience but are not used for geometry.
 *
 * There is no fallback or compatibility logic for missing `cells`.
 */
export type ScenarioMapSnapshot = {
	/** Board width (for UI layout only; not used for geometry) */
	width: number
	/** Board height (for UI layout only; not used for geometry) */
	height: number
	/**
	 * List of all valid cell coordinates (q, r). This is the authoritative geometry.
	 * Must always be present and non-empty.
	 */
	cells: Array<{ q: number; r: number }>
	/**
	 * List of all hexes with terrain/type info. Each entry must correspond to a cell.
	 */
	hexes: Array<{ q: number; r: number; t: number }>
}

/**
 * Full game state response for GET /games/{id} and action results.
 *
 * - `scenarioMap` is always required and must include a non-empty `cells` array.
 * - There is no compatibility logic for missing or legacy map fields.
 */
export type GameStateResponse = {
	gameId: number
	scenarioId: string
	scenarioName?: string
	role: 'onion' | 'defender'
	phase: string
	turnNumber: number
	winner: 'onion' | 'defender' | null
	players: {
		onion: string | null
		defender: string | null
	}
	state: GameState
	movementRemainingByUnit: Record<string, number>
	victoryObjectives?: VictoryObjectiveState[]
	/**
	 * Canonical scenario map snapshot. Must always be present and valid.
	 */
	scenarioMap: ScenarioMapSnapshot
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
	pushApiProtocolTraffic({
		direction: 'request',
		method: options.method,
		path: options.path,
		requestBody: options.body,
	})

	let response: Response
	try {
		response = await fetchImpl(buildUrl(options.baseUrl, options.path), {
			method: options.method,
			headers: buildHeaders(options.token),
			body: requestBody,
		})
	} catch (error) {
		pushApiProtocolTraffic({
			direction: 'error',
			method: options.method,
			path: options.path,
			message: error instanceof Error ? error.message : 'Unknown network error',
		})
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
		pushApiProtocolTraffic({
			direction: 'response',
			method: options.method,
			path: options.path,
			status: response.status,
			responseBody: errorBody,
		})
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

	pushApiProtocolTraffic({
		direction: 'response',
		method: options.method,
		path: options.path,
		status: response.status,
		responseBody: parsed,
	})

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