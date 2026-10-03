import {
	createGameClient,
	GameClientSeamError,
	type ClientDiagnosticReport,
	type GameAction,
	type GameClient,
	type GameStateEnvelope,
	type ServerGameSnapshot,
} from './gameClient'
import type { GameRequestTransport } from './gameSessionTypes'
import { 
	requestJson,
	type ApiFailure, 
	type EventsResponse, 
	type GameStateResponse, 
	type GameStateFetchResponse, 
	type NetworkRetryPolicy 
} from '#shared/apiProtocol'
import { 
	ActionResponseBoundarySchema, 
	GameStateResponseBoundarySchema, 
	UnchangedGameStateResponseSchema 
} from '#shared/protocolSchemas'
import type { ActionOkResponse, EventEnvelope, TurnPhase } from '#shared/types/index'
import { buildCombatResolution } from './combatResolution'
import { buildRamResolution } from './moveResolution'
import { validateBattlefieldSnapshot } from './battlefieldDisplay/snapshotValidation'

type ActionSuccessResponse = ActionOkResponse & {
	scenarioId?: string
	hostUserId?: string
	status?: ServerGameSnapshot['status']
	turnNumber: number
	eventSeq: number
	phaseStartEventSeq?: number
	phase: TurnPhase
	scenarioName: string
	players?: ServerGameSnapshot['players']
	scenarioMap: NonNullable<ServerGameSnapshot['scenarioMap']>
	victoryObjectives: NonNullable<ServerGameSnapshot['victoryObjectives']>
	escapeHexes?: ServerGameSnapshot['escapeHexes']
	winner?: GameStateResponse['winner']
	aborted?: boolean
}

type HttpGameClientOptions = {
	baseUrl: string
	fetchImpl?: typeof fetch
	token?: string
}

const READ_RETRY_POLICY: NetworkRetryPolicy = {
	maxAttempts: 2,
	delayMs: 100,
	retryableStatuses: [408, 429, 500, 502, 503, 504],
}

function trimTrailingSlash(baseUrl: string) {
	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function parseGameStateResponse(response: unknown): GameStateResponse {
	const parsed = GameStateResponseBoundarySchema.safeParse(response)
	if (!parsed.success) {
		throw new GameClientSeamError('transport', 'Invalid game state response')
	}

	return response as GameStateResponse
}

function parseGameStateFetchResponse(response: unknown): GameStateFetchResponse {
	const unchanged = UnchangedGameStateResponseSchema.safeParse(response)
	if (unchanged.success) {
		return unchanged.data
	}

	return parseGameStateResponse(response)
}

function isUnchangedGameStateResponse(response: GameStateFetchResponse): response is Extract<GameStateFetchResponse, { unchanged: true }> {
	return 'unchanged' in response && response.unchanged === true
}

function parseActionResponse(response: unknown): ActionSuccessResponse {
	const parsed = ActionResponseBoundarySchema.safeParse(response)
	if (!parsed.success) {
		throw new GameClientSeamError('transport', 'Invalid action response')
	}

	return response as ActionSuccessResponse
}

function requireScenarioMap(response: GameStateResponse) {
	if (response.scenarioMap === undefined || response.scenarioMap === null) {
		throw new GameClientSeamError('transport', 'Missing scenario map in game state response')
	}

	if (!Array.isArray(response.scenarioMap.cells)) {
		throw new GameClientSeamError('transport', 'Missing scenario map cells in game state response')
	}

	if (response.scenarioMap.cells.length === 0) {
		throw new GameClientSeamError('transport', 'Scenario map cells must not be empty in game state response')
	}

	return response.scenarioMap
}

function requireStackRoster(response: GameStateResponse) {
	if (response.state.stackRoster === undefined || response.state.stackRoster === null) {
		throw new GameClientSeamError('transport', 'Missing stack roster in game state response')
	}

	const defenders = response.state.defenders ?? {}

	for (const [groupId, group] of Object.entries(response.state.stackRoster.groupsById)) {
		if (!Array.isArray(group.unitIds)) {
			throw new GameClientSeamError('transport', `Invalid stack roster group shape for ${groupId}`)
		}

		for (const unitId of group.unitIds) {
			const defender = defenders[unitId]
			if (defender === undefined || defender === null || typeof defender !== 'object' || typeof defender?.state !== 'string') {
				throw new GameClientSeamError('transport', `Missing stack roster defender ${unitId} for ${groupId}`)
			}
		}
	}
	return response.state.stackRoster
}

function isCanonicalGameState(value: unknown): value is { onions: unknown; turn: unknown } {
	return typeof value === 'object'
		&& value !== null
		&& 'onions' in value
		&& 'turn' in value
}

function assertValidMappedSnapshot(snapshot: ServerGameSnapshot, responseKind: 'game state' | 'action'): void {
	const authoritativeState = snapshot.authoritativeState
	if (!isCanonicalGameState(authoritativeState)) {
		return
	}

	const validationError = validateBattlefieldSnapshot(snapshot)
	if (validationError !== null) {
		throw new GameClientSeamError('transport', `Invalid ${responseKind} response: ${validationError}`)
	}
}

function buildError(result: ApiFailure): GameClientSeamError {
	if (result.status === 404) {
		return new GameClientSeamError('not-found', result.message, undefined, result.status)
	}

	if (result.status === 400 || result.status === 422) {
		return new GameClientSeamError('invalid-action', result.message, undefined, result.status)
	}

	return new GameClientSeamError('transport', result.message, undefined, result.status)
}

function mapServerSnapshot(
	rawResponse: unknown,
	gameId: number,
): GameStateEnvelope {
	const response = parseGameStateResponse(rawResponse)
	const canonicalState = isCanonicalGameState(response.state)
	const scenarioMap = canonicalState ? response.scenarioMap : requireScenarioMap(response)
	if (!canonicalState) {
		requireStackRoster(response)
	}
	const envelope = {
		snapshot: {
			gameId: response.gameId ?? gameId,
			scenarioId: response.scenarioId,
			hostUserId: response.hostUserId,
			status: response.status,
			phase: response.phase,
			snapshotRevision: response.snapshotRevision,
			winner: response.winner,
			aborted: response.aborted,
			scenarioName: response.scenarioName,
			turnNumber: response.turnNumber,
			lastEventSeq: response.eventSeq,
			phaseStartEventSeq: response.phaseStartEventSeq,
			players: response.players,
			authoritativeState: response.state,
			scenarioMap,
			victoryObjectives: response.victoryObjectives,
			escapeHexes: response.escapeHexes,
		},
		session: {
			role: response.role,
		},
	}
	assertValidMappedSnapshot(envelope.snapshot, 'game state')
	return envelope
}

function mapActionSnapshot(
	rawResponse: unknown,
	gameId: number,
	previousSnapshot: ServerGameSnapshot | null,
): ServerGameSnapshot {
	const response = parseActionResponse(rawResponse)
	const responseEvents = Array.isArray(response.events) ? response.events : []

	const snapshot = {
		gameId,
		scenarioId: response.scenarioId ?? previousSnapshot?.scenarioId,
		hostUserId: response.hostUserId ?? previousSnapshot?.hostUserId,
		status: response.status ?? previousSnapshot?.status,
		phase: response.phase,
		snapshotRevision: response.snapshotRevision,
		winner: response.winner,
		aborted: response.aborted,
		scenarioName: response.scenarioName,
		turnNumber: response.turnNumber,
		lastEventSeq: response.eventSeq,
		phaseStartEventSeq: response.phaseStartEventSeq ?? previousSnapshot?.phaseStartEventSeq,
		players: response.players ?? previousSnapshot?.players,
		authoritativeState: response.state,
		scenarioMap: response.scenarioMap,
		victoryObjectives: response.victoryObjectives,
		escapeHexes: response.escapeHexes,
		combatResolution: buildCombatResolution(responseEvents),
		ramResolution: buildRamResolution(responseEvents),
	}
	assertValidMappedSnapshot(snapshot, 'action')
	return snapshot
}
function createHttpGameTransportRuntime(options: HttpGameClientOptions): {
	requestTransport: GameRequestTransport
	pollEvents(gameId: number, afterSeq: number): Promise<ReadonlyArray<EventEnvelope>>
} {
	const fetchImpl = options.fetchImpl ?? fetch
	const baseUrl = trimTrailingSlash(options.baseUrl)
	let currentSnapshot: ServerGameSnapshot | null = null
	let currentSession: GameStateEnvelope['session'] | null = null

	async function getStateEnvelope(gameId: number, sinceRevision?: number): Promise<GameStateEnvelope> {
		const revisionQuery = sinceRevision === undefined || sinceRevision === 0 ? '' : `?sinceRevision=${sinceRevision}`
		const result = await requestJson<GameStateFetchResponse>({
			baseUrl,
			path: `games/${gameId}${revisionQuery}`,
			method: 'GET',
			token: options.token,
			fetchImpl,
			captureRawResponseBody: true,
			retry: READ_RETRY_POLICY,
		})

		if (!result.ok) {
			const body = result.body
			const isFutureRevision = typeof body === 'object'
				&& body !== null
				&& 'code' in body
				&& body.code === 'STALE_REVISION'
			if (isFutureRevision && sinceRevision !== undefined && sinceRevision !== 0) {
				return getStateEnvelope(gameId, 0)
			}
			throw buildError(result)
		}

		const response = parseGameStateFetchResponse(result.data)
		if (isUnchangedGameStateResponse(response)) {
			if (currentSnapshot === null || currentSession === null) {
				throw new GameClientSeamError('transport', 'Received unchanged game state before an initial snapshot')
			}
			return { snapshot: currentSnapshot, session: currentSession }
		}

		const envelope = mapServerSnapshot(response, gameId)
		currentSnapshot = envelope.snapshot
		currentSession = envelope.session
		return envelope
	}

	async function reportDiagnostic(gameId: number, diagnostic: ClientDiagnosticReport): Promise<void> {
		const result = await requestJson<{ ok: true; reportId: string }>({
			baseUrl,
			path: `games/${gameId}/client-diagnostics`,
			method: 'POST',
			token: options.token,
			body: diagnostic,
			fetchImpl,
		})

		if (!result.ok) {
			throw buildError(result)
		}
	}
	const requestTransport = {
		async getState(gameId: number) {
			return getStateEnvelope(gameId, currentSnapshot?.snapshotRevision)
		},
		async submitAction(gameId: number, action: GameAction) {
			if (currentSnapshot === null) {
				throw new GameClientSeamError('transport', 'Cannot submit action before loading game state')
			}

			switch (action.type) {
				case 'select-unit':
				case 'set-mode':
					throw new GameClientSeamError('transport', `Action '${action.type}' is not supported by the HTTP game transport`)
				case 'end-phase': {
					const result = await requestJson<ActionSuccessResponse>({
					baseUrl,
					path: `games/${gameId}/actions`,
					method: 'POST',
					token: options.token,
					body: { type: 'END_PHASE' },
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				currentSnapshot = mapActionSnapshot(result.data, gameId, currentSnapshot)
				return currentSnapshot
				}
				case 'MOVE': {
					const moveAction = action
					const result = await requestJson<ActionSuccessResponse>({
					baseUrl,
					path: `games/${gameId}/actions`,
					method: 'POST',
					token: options.token,
					body: {
						type: 'MOVE',
						movers: moveAction.movers,
						to: moveAction.to,
						...(moveAction.attemptRam === undefined ? {} : { attemptRam: moveAction.attemptRam }),
					},
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				currentSnapshot = mapActionSnapshot(result.data, gameId, currentSnapshot)
				return currentSnapshot
				}
				case 'FIRE': {
					const fireAction = action
					const result = await requestJson<ActionSuccessResponse>({
					baseUrl,
					path: `games/${gameId}/actions`,
					method: 'POST',
					token: options.token,
					body: {
						type: 'FIRE',
						attackers: fireAction.attackers,
						targetId: fireAction.targetId,
						onionId: fireAction.onionId,
					},
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				currentSnapshot = mapActionSnapshot(result.data, gameId, currentSnapshot)
				return currentSnapshot
				}
				case 'refresh': {
					const envelope = await getStateEnvelope(gameId, currentSnapshot.snapshotRevision)
					return envelope.snapshot
				}
				default:
					throw new GameClientSeamError('transport', 'Action is not supported by the HTTP game transport')
			}

		},
		reportDiagnostic,
	} as GameRequestTransport

	async function pollEvents(gameId: number, afterSeq: number) {
		const result = await requestJson<EventsResponse>({
			baseUrl,
			path: `games/${gameId}/events?after=${afterSeq}`,
			method: 'GET',
			token: options.token,
			fetchImpl,
			retry: READ_RETRY_POLICY,
		})

		if (!result.ok) {
			throw buildError(result)
		}

		const events = result.data.events ?? []
		const lastEvent = events.at(-1)
		if (lastEvent !== undefined && currentSnapshot !== null) {
			currentSnapshot = {
				...currentSnapshot,
				lastEventSeq: lastEvent.seq,
			}
		}

		return events
	}

	return {
		requestTransport,
		pollEvents,
	}
}

export function createHttpGameRequestTransport(options: HttpGameClientOptions): GameRequestTransport {
	const { requestTransport, pollEvents } = createHttpGameTransportRuntime(options)

	return {
		...requestTransport,
		pollEvents,
	}
}

export function createHttpGameClient(options: HttpGameClientOptions): GameClient {
	const { requestTransport, pollEvents } = createHttpGameTransportRuntime(options)

	return createGameClient({
		...requestTransport,
		pollEvents,
	})
}