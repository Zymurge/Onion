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
import { buildStackRosterIndex } from '../../shared/stackRoster'

type ActionSuccessResponse = {
	ok: true
	seq: number
	events: Array<{ seq: number; type: string; timestamp: string; [key: string]: unknown }>
	state: GameState
	movementRemainingByUnit: Record<string, number>
	turnNumber: number
	eventSeq: number
	winner?: GameStateResponse['winner']
	victoryObjectives?: GameStateResponse['victoryObjectives']
	escapeHexes?: GameStateResponse['escapeHexes']
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

	buildStackRosterIndex(response.state.stackRoster)
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
	currentSnapshot: ServerGameSnapshot | null,
	gameId: number,
): ServerGameSnapshot {
	const responseEvents = Array.isArray(response.events) ? response.events : []
	const phaseChange = [...responseEvents].reverse().find((event) => event.type === 'PHASE_CHANGED')
	const nextPhase = typeof phaseChange?.to === 'string' ? normalizePhase(phaseChange.to) : currentSnapshot?.phase ?? 'DEFENDER_MOVE'

	return {
		gameId,
		phase: nextPhase,
		winner: response.winner ?? currentSnapshot?.winner,
		scenarioName: currentSnapshot?.scenarioName,
		turnNumber: typeof response.turnNumber === 'number' ? response.turnNumber : currentSnapshot?.turnNumber,
		lastEventSeq: typeof response.eventSeq === 'number' ? response.eventSeq : typeof response.seq === 'number' ? response.seq : currentSnapshot?.lastEventSeq ?? 0,
		authoritativeState: response.state ?? currentSnapshot?.authoritativeState,
		movementRemainingByUnit: response.movementRemainingByUnit ?? currentSnapshot?.movementRemainingByUnit,
		scenarioMap: currentSnapshot?.scenarioMap,
		victoryObjectives: response.victoryObjectives ?? currentSnapshot?.victoryObjectives,
		escapeHexes: response.escapeHexes ?? currentSnapshot?.escapeHexes,
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

	const requestTransport: GameRequestTransport = {
		async getState(gameId: number) {
			const result = await requestJson<GameStateResponse>({
				baseUrl,
				path: `games/${gameId}`,
				method: 'GET',
				token: options.token,
				fetchImpl,
			})

			if (!result.ok) {
				throw buildError(result)
			}

			const envelope = mapServerSnapshot(result.data, gameId)
			currentSnapshot = envelope.snapshot
			return envelope
		},
		async submitAction(gameId: number, action: GameAction) {
			if (action.type === 'end-phase') {
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

				currentSnapshot = mapActionSnapshot(result.data, currentSnapshot, gameId)
				return currentSnapshot
			}

			if (action.type === 'MOVE') {
				const result = await requestJson<ActionSuccessResponse>({
					baseUrl,
					path: `games/${gameId}/actions`,
					method: 'POST',
					token: options.token,
					body: {
						type: 'MOVE',
						movers: action.movers,
						to: action.to,
						...(action.attemptRam === undefined ? {} : { attemptRam: action.attemptRam }),
					},
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				currentSnapshot = mapActionSnapshot(result.data, currentSnapshot, gameId)
				return currentSnapshot
			}

			if (action.type === 'FIRE') {
				const result = await requestJson<ActionSuccessResponse>({
					baseUrl,
					path: `games/${gameId}/actions`,
					method: 'POST',
					token: options.token,
					body: {
						type: 'FIRE',
						attackers: action.attackers,
						targetId: action.targetId,
					},
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				currentSnapshot = mapActionSnapshot(result.data, currentSnapshot, gameId)
				return currentSnapshot
			}

			if (action.type === 'refresh') {
				const result = await requestJson<GameStateResponse>({
					baseUrl,
					path: `games/${gameId}`,
					method: 'GET',
					token: options.token,
					fetchImpl,
				})

				if (!result.ok) {
					throw buildError(result)
				}

				const envelope = mapServerSnapshot(result.data, gameId)
				currentSnapshot = envelope.snapshot
				return envelope.snapshot
			}

			return currentSnapshot ?? {
				gameId,
				phase: 'DEFENDER_MOVE',
				lastEventSeq: 0,
			}
		},
	}

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