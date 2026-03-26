export type WebRuntimeEnv = {
	VITE_ONION_API_URL?: string
}

export type WebRuntimeConfig = {
	apiBaseUrl: string | null
	gameId: number | null
}

function parseGameId(value: string | null | undefined): number | null {
	if (value === null || value === undefined) {
		return null
	}

	const trimmed = value.trim()
	if (!/^\d+$/.test(trimmed)) {
		return null
	}

	const parsed = Number(trimmed)
	return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

export function resolveWebRuntimeConfig(
	env: WebRuntimeEnv,
	search: string,
): WebRuntimeConfig {
	const query = new URLSearchParams(search)
	const apiBaseUrl = env.VITE_ONION_API_URL?.trim() ?? null
	const gameId = parseGameId(query.get('gameId'))

	return {
		apiBaseUrl: apiBaseUrl && apiBaseUrl.length > 0 ? apiBaseUrl : null,
		gameId,
	}
}