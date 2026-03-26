import { createHttpGameClient } from './httpGameClient'
import type { GameClient } from './gameClient'

export type WebRuntimeEnv = {
	VITE_ONION_API_URL?: string
	VITE_ONION_GAME_ID?: string
}

export type WebRuntimeConfig = {
	apiBaseUrl: string | null
	gameId: string | null
}

export function resolveWebRuntimeConfig(
	env: WebRuntimeEnv,
	search: string,
): WebRuntimeConfig {
	const query = new URLSearchParams(search)
	const apiBaseUrl = env.VITE_ONION_API_URL?.trim() ?? null
	const gameId = query.get('gameId')?.trim() ?? env.VITE_ONION_GAME_ID?.trim() ?? null

	return {
		apiBaseUrl: apiBaseUrl && apiBaseUrl.length > 0 ? apiBaseUrl : null,
		gameId: gameId && gameId.length > 0 ? gameId : null,
	}
}

export function createDefaultGameClient(env: WebRuntimeEnv, search: string): GameClient | undefined {
	const { apiBaseUrl, gameId } = resolveWebRuntimeConfig(env, search)
	if (!apiBaseUrl || !gameId) {
		return undefined
	}

	return createHttpGameClient({ baseUrl: apiBaseUrl })
}