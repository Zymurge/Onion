export type WebRuntimeEnv = {
	VITE_ONION_API_URL?: string
	VITE_ONION_LIVE_REFRESH_QUIET_WINDOW_MS?: string
}

export type WebRuntimeConfig = {
	apiBaseUrl: string | null
	gameId: number | null
	liveRefreshQuietWindowMs: number
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

function parseGameIdFromPathname(pathname: string): number | null {
	const match = pathname.match(/^\/(?:gameid|game)\/(\d+)\/?$/i)
	return match ? parseGameId(match[1]) : null
}

function parsePositiveInteger(value: string | null | undefined): number | null {
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
	pathname = '/',
): WebRuntimeConfig {
	const query = new URLSearchParams(search)
	const apiBaseUrl = env.VITE_ONION_API_URL?.trim() ?? null
	const gameId = parseGameId(query.get('gameId')) ?? parseGameIdFromPathname(pathname)
	const liveRefreshQuietWindowMs = parsePositiveInteger(query.get('liveRefreshQuietWindowMs'))
		?? parsePositiveInteger(env.VITE_ONION_LIVE_REFRESH_QUIET_WINDOW_MS)
		?? 2000

	return {
		apiBaseUrl: apiBaseUrl && apiBaseUrl.length > 0 ? apiBaseUrl : null,
		gameId,
		liveRefreshQuietWindowMs,
	}
}