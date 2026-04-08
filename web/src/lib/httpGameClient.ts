import {
	createGameClient,
	GameClientSeamError,
	type ActionMode,
	type GameAction,
	type GameClient,
	type GameStateEnvelope,
	type GameSnapshot,
} from './gameClient'
import type { GameRequestTransport } from './gameSessionTypes'

import { requestJson, type ApiFailure, type EventsResponse, type GameStateResponse } from '../../../src/shared/apiProtocol'
import type { GameState, TurnPhase } from '../../../src/types/index'
import { buildCombatResolution } from './combatResolution'

type ActionSuccessResponse = {
	ok: true
	seq: number
	events: Array<{ seq: number; type: string; timestamp: string; [key: string]: unknown }>
	state: GameState
	movementRemainingByUnit: Record<string, number>
	turnNumber: number
	eventSeq: number
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

function createInitialSnapshot(gameId: number): GameSnapshot {
	return {
		gameId,
		phase: 'DEFENDER_MOVE',
		selectedUnitId: null,
		mode: 'fire',
		scenarioName: undefined,
		turnNumber: undefined,
		lastEventSeq: 0,
		movementRemainingByUnit: {},
	}
}

function mergeSnapshot(base: GameSnapshot, next: Partial<GameSnapshot>): GameSnapshot {
	return {
		...base,
		...next,
	}
}

function requireScenarioMap(response: GameStateResponse) {
	if (response.scenarioMap === undefined || response.scenarioMap === null) {
		throw new GameClientSeamError('transport', 'Missing scenario map in game state response')
	}

	if (!Array.isArray(response.scenarioMap.cells)) {
		throw new GameClientSeamError('transport', 'Missing scenario map cells in game state response')
	}

	return response.scenarioMap
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
	currentSnapshot: GameSnapshot | null,
	gameId: number,
): GameStateEnvelope {
	const fallback = currentSnapshot ?? createInitialSnapshot(gameId)
	const scenarioMap = requireScenarioMap(response)
	return {
		snapshot: mergeSnapshot(fallback, {
			gameId: response.gameId ?? gameId,
			phase: normalizePhase(response.phase),
			scenarioName: response.scenarioName ?? fallback.scenarioName,
			turnNumber: typeof response.turnNumber === 'number' ? response.turnNumber : fallback.turnNumber,
			lastEventSeq: typeof response.eventSeq === 'number' ? response.eventSeq : fallback.lastEventSeq,
			authoritativeState: response.state ?? fallback.authoritativeState,
			movementRemainingByUnit: response.movementRemainingByUnit ?? fallback.movementRemainingByUnit,
			scenarioMap,
		}),
		session: {
			role: response.role,
		},
	}
}

function mapActionSnapshot(
	response: ActionSuccessResponse,
	currentSnapshot: GameSnapshot | null,
	gameId: number,
): GameSnapshot {
	const fallback = currentSnapshot ?? createInitialSnapshot(gameId)
	const phaseChange = [...response.events].reverse().find((event) => event.type === 'PHASE_CHANGED')
	const nextPhase = typeof phaseChange?.to === 'string' ? normalizePhase(phaseChange.to) : fallback.phase

	return mergeSnapshot(fallback, {
		gameId,
		phase: nextPhase,
		turnNumber: typeof response.turnNumber === 'number' ? response.turnNumber : fallback.turnNumber,
		lastEventSeq: typeof response.eventSeq === 'number' ? response.eventSeq : typeof response.seq === 'number' ? response.seq : fallback.lastEventSeq,
		authoritativeState: response.state ?? fallback.authoritativeState,
		movementRemainingByUnit: response.movementRemainingByUnit ?? fallback.movementRemainingByUnit,
		combatResolution: buildCombatResolution(response.events),
	})
}

function updateLocalSnapshot(currentSnapshot: GameSnapshot | null, action: GameAction, gameId: number): GameSnapshot {
	const baseSnapshot = currentSnapshot ?? createInitialSnapshot(gameId)

	if (action.type === 'select-unit') {
		return mergeSnapshot(baseSnapshot, { selectedUnitId: action.unitId })
	}

	if (action.type === 'set-mode') {
		return mergeSnapshot(baseSnapshot, { mode: action.mode as ActionMode })
	}

	return baseSnapshot
}

function createHttpGameTransportRuntime(options: HttpGameClientOptions): {
	requestTransport: GameRequestTransport
	pollEvents(gameId: number, afterSeq: number): Promise<ReadonlyArray<{ seq: number; type: string; summary: string; timestamp: string }>>
} {
	const fetchImpl = options.fetchImpl ?? fetch
	const baseUrl = trimTrailingSlash(options.baseUrl)
	let currentSnapshot: GameSnapshot | null = null

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

			const envelope = mapServerSnapshot(result.data, currentSnapshot, gameId)
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
						unitId: action.unitId,
						to: action.to,
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

				const envelope = mapServerSnapshot(result.data, currentSnapshot, gameId)
				currentSnapshot = envelope.snapshot
				return envelope.snapshot
			}

			currentSnapshot = updateLocalSnapshot(currentSnapshot, action, gameId)
			return currentSnapshot
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
			currentSnapshot = mergeSnapshot(currentSnapshot, {
				lastEventSeq: lastEvent.seq,
			})
		}

		return events
	}

	return {
		requestTransport,
		pollEvents,
	}
}

export function createHttpGameRequestTransport(options: HttpGameClientOptions): GameRequestTransport {
	return createHttpGameTransportRuntime(options).requestTransport
}

export function createHttpGameClient(options: HttpGameClientOptions): GameClient {
	const { requestTransport, pollEvents } = createHttpGameTransportRuntime(options)

	return createGameClient({
		...requestTransport,
		pollEvents,
	})
}