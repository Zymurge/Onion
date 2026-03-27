import {
	createGameClient,
	GameClientSeamError,
	type ActionMode,
	type GameAction,
	type GameClient,
	type GameClientTransport,
	type GameStateEnvelope,
	type GameSnapshot,
} from './gameClient'

import { requestJson, type ApiFailure, type EventsResponse, type GameStateResponse } from '../../../src/shared/apiProtocol'
import type { TurnPhase } from '../../../src/types/index'

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
	}
}

function mergeSnapshot(base: GameSnapshot, next: Partial<GameSnapshot>): GameSnapshot {
	return {
		...base,
		...next,
	}
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
	return {
		snapshot: mergeSnapshot(fallback, {
			gameId: response.gameId ?? gameId,
			phase: normalizePhase(response.phase),
			scenarioName: response.scenarioName ?? fallback.scenarioName,
			turnNumber: typeof response.turnNumber === 'number' ? response.turnNumber : fallback.turnNumber,
			lastEventSeq: typeof response.eventSeq === 'number' ? response.eventSeq : fallback.lastEventSeq,
		}),
		session: {
			role: response.role,
		},
	}
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

export function createHttpGameClient(options: HttpGameClientOptions): GameClient {
	const fetchImpl = options.fetchImpl ?? fetch
	const baseUrl = trimTrailingSlash(options.baseUrl)
	let currentSnapshot: GameSnapshot | null = null

	const transport: GameClientTransport = {
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
		async pollEvents(gameId: number, afterSeq: number) {
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
		},
	}

	return createGameClient(transport)
}