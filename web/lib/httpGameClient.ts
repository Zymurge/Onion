import {
	createGameClient,
	GameClientSeamError,
	type GameAction,
	type GameClient,
	type GameStateEnvelope,
	type ServerGameSnapshot,
} from './gameClient'
import type { GameRequestTransport } from './gameSessionTypes'

import { requestJson, type ApiFailure, type EventsResponse, type GameStateResponse } from '../../shared/apiProtocol'
import type { GameState, TurnPhase } from '../../shared/types/index'
import { buildCombatResolution } from './combatResolution'
import { buildRamResolution } from './moveResolution'

type ActionSuccessResponse = {
	ok: true
	seq: number
	events: Array<{ seq: number; type: string; timestamp: string; [key: string]: unknown }>
	state: GameState
	movementRemainingByUnit: Record<string, number>
	turnNumber: number
	eventSeq: number
	phase: TurnPhase
	scenarioName: string
	scenarioMap: NonNullable<ServerGameSnapshot['scenarioMap']>
	victoryObjectives: NonNullable<ServerGameSnapshot['victoryObjectives']>
	escapeHexes?: ServerGameSnapshot['escapeHexes']
	winner?: GameStateResponse['winner']
}

type HttpGameClientOptions = {
	baseUrl: string
	fetchImpl?: typeof fetch
	token?: string
}

function trimTrailingSlash(baseUrl: string) {
	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

const TURN_PHASES: readonly TurnPhase[] = [
	'ONION_MOVE',
	'ONION_COMBAT',
	'DEFENDER_RECOVERY',
	'DEFENDER_MOVE',
	'DEFENDER_COMBAT',
	'GEV_SECOND_MOVE',
] as const

function normalizePhase(phase: unknown): TurnPhase {
	if (typeof phase !== 'string') {
		return 'DEFENDER_MOVE'
	}

	const upperPhase = phase.toUpperCase()
	return TURN_PHASES.includes(upperPhase as TurnPhase) ? (upperPhase as TurnPhase) : 'DEFENDER_MOVE'
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

	if (response.state.stackRoster.unitsById === undefined || response.state.stackRoster.unitsById === null) {
		throw new GameClientSeamError('transport', 'Missing canonical stack roster unitsById in game state response')
	}

	for (const [groupId, group] of Object.entries(response.state.stackRoster.groupsById)) {
		if (!Array.isArray(group.unitIds)) {
			throw new GameClientSeamError('transport', `Invalid stack roster group shape for ${groupId}`)
		}

		for (const unitId of group.unitIds) {
			const unit = response.state.stackRoster.unitsById[unitId]
			if (unit === null || typeof unit !== 'object' || typeof unit?.id !== 'string' || typeof unit?.status !== 'string') {
				throw new GameClientSeamError('transport', `Invalid stack roster unit shape for ${groupId}`)
			}
		}
	}
	return response.state.stackRoster
}

function buildError(result: ApiFailure): GameClientSeamError {
	if (result.status === 404) {
		return new GameClientSeamError('not-found', result.message)
	}

	if (result.status === 400 || result.status === 422) {
		return new GameClientSeamError('invalid-action', result.message)
	}

	return new GameClientSeamError('transport', result.message)
}

function mapServerSnapshot(
	response: GameStateResponse,
	gameId: number,
): GameStateEnvelope {
	const scenarioMap = requireScenarioMap(response)
	requireStackRoster(response)
	return {
		snapshot: {
			gameId: response.gameId ?? gameId,
			phase: normalizePhase(response.phase),
			winner: response.winner,
			scenarioName: response.scenarioName,
			turnNumber: response.turnNumber,
			lastEventSeq: response.eventSeq,
			authoritativeState: response.state,
			movementRemainingByUnit: response.movementRemainingByUnit,
			scenarioMap,
			victoryObjectives: response.victoryObjectives,
			escapeHexes: response.escapeHexes,
		},
		session: {
			role: response.role,
		},
	}
}

function mapActionSnapshot(
	response: ActionSuccessResponse,
	gameId: number,
): ServerGameSnapshot {
	const responseEvents = Array.isArray(response.events) ? response.events : []

	return {
		gameId,
		phase: response.phase,
		winner: response.winner,
		scenarioName: response.scenarioName,
		turnNumber: response.turnNumber,
		lastEventSeq: response.eventSeq,
		authoritativeState: response.state,
		movementRemainingByUnit: response.movementRemainingByUnit,
		scenarioMap: response.scenarioMap,
		victoryObjectives: response.victoryObjectives,
		escapeHexes: response.escapeHexes,
		combatResolution: buildCombatResolution(responseEvents),
		ramResolution: buildRamResolution(responseEvents),
	}
}
function createHttpGameTransportRuntime(options: HttpGameClientOptions): {
	requestTransport: GameRequestTransport
	pollEvents(gameId: number, afterSeq: number): Promise<ReadonlyArray<{ seq: number; type: string; summary: string; timestamp: string }>>
} {
	const fetchImpl = options.fetchImpl ?? fetch
	const baseUrl = trimTrailingSlash(options.baseUrl)
	let currentSnapshot: ServerGameSnapshot | null = null
	const requestTransport = {
		async getState(gameId: number) {
			const result = await requestJson<GameStateResponse>({
				baseUrl,
				path: `games/${gameId}`,
				method: 'GET',
				token: options.token,
				fetchImpl,
				captureRawResponseBody: true,
			})

			if (!result.ok) {
				throw buildError(result)
			}

			const envelope = mapServerSnapshot(result.data, gameId)
			currentSnapshot = envelope.snapshot
			return envelope
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

				currentSnapshot = mapActionSnapshot(result.data, gameId)
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

				currentSnapshot = mapActionSnapshot(result.data, gameId)
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
					},
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				currentSnapshot = mapActionSnapshot(result.data, gameId)
				return currentSnapshot
				}
				case 'refresh': {
					const result = await requestJson<GameStateResponse>({
					baseUrl,
					path: `games/${gameId}`,
					method: 'GET',
					token: options.token,
					fetchImpl,
					captureRawResponseBody: true,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				const envelope = mapServerSnapshot(result.data, gameId)
					currentSnapshot = envelope.snapshot
					return envelope.snapshot
				}
				default:
					throw new GameClientSeamError('transport', 'Action is not supported by the HTTP game transport')
			}

		},
	} as GameRequestTransport

	async function pollEvents(gameId: number, afterSeq: number) {
		const result = await requestJson<EventsResponse>({
			baseUrl,
			path: `games/${gameId}/events?after=${afterSeq}`,
			method: 'GET',
			token: options.token,
			fetchImpl,
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