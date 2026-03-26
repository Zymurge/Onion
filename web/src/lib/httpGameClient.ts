import {
	createGameClient,
	GameClientSeamError,
	type ActionMode,
	type GameAction,
	type GameClient,
	type GameClientTransport,
	type GameSnapshot,
} from './gameClient'

import { requestJson, type ApiFailure, type EventsResponse, type GameStateResponse } from '../../../src/shared/apiProtocol'

type HttpGameClientOptions = {
	baseUrl: string
	fetchImpl?: typeof fetch
	token?: string
}

function trimTrailingSlash(baseUrl: string) {
	return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl
}

function normalizePhase(phase: unknown): GameSnapshot['phase'] {
	if (typeof phase !== 'string') {
		return 'defender'
	}

	return phase.toUpperCase().startsWith('ONION_') || phase === 'onion' ? 'onion' : 'defender'
}

function createInitialSnapshot(gameId: string): GameSnapshot {
	return {
		gameId,
		phase: 'defender',
		selectedUnitId: null,
		mode: 'fire',
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
	gameId: string,
): GameSnapshot {
	const fallback = currentSnapshot ?? createInitialSnapshot(gameId)
	return mergeSnapshot(fallback, {
		gameId: response.gameId ?? gameId,
		phase: normalizePhase(response.phase),
		lastEventSeq: typeof response.eventSeq === 'number' ? response.eventSeq : fallback.lastEventSeq,
	})
}

function updateLocalSnapshot(currentSnapshot: GameSnapshot | null, action: GameAction, gameId: string): GameSnapshot {
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
		async getState(gameId: string) {
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

			currentSnapshot = mapServerSnapshot(result.data, currentSnapshot, gameId)
			return currentSnapshot
		},
		async submitAction(gameId: string, action: GameAction) {
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

				currentSnapshot = mapServerSnapshot(result.data, currentSnapshot, gameId)
				return currentSnapshot
			}

			currentSnapshot = updateLocalSnapshot(currentSnapshot, action, gameId)
			return currentSnapshot
		},
		async pollEvents(gameId: string, afterSeq: number) {
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