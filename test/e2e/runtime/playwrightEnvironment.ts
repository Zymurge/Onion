import type { ResolvedRuntime } from './types.js'

export const PLAYWRIGHT_RUNTIME_ENV = {
	webUrl: 'E2E_WEB_URL',
	engineUrl: 'E2E_ENGINE_URL',
	runtimeFile: 'E2E_RUNTIME_FILE',
	artifactFile: 'E2E_ARTIFACT_FILE',
	logDir: 'E2E_LOG_DIR',
} as const

export type PlaywrightRuntime = {
	webUrl: string
	engineUrl: string
	runtimeFile: string
	artifactFile: string
	logDir: string
}

type RuntimeEnvironment = Record<string, string | undefined>

/** Builds the explicit runtime contract inherited by Playwright workers. */
export function createPlaywrightRuntimeEnvironment(
	runtime: ResolvedRuntime,
	runtimeFile: string,
	parentEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
	return {
		...parentEnvironment,
		...runtime.serverEnvironment,
		[PLAYWRIGHT_RUNTIME_ENV.webUrl]: runtime.webUrl,
		[PLAYWRIGHT_RUNTIME_ENV.engineUrl]: runtime.engineUrl,
		[PLAYWRIGHT_RUNTIME_ENV.runtimeFile]: runtimeFile,
		[PLAYWRIGHT_RUNTIME_ENV.artifactFile]: runtime.artifactFile,
		[PLAYWRIGHT_RUNTIME_ENV.logDir]: runtime.logDir,
	}
}

/** Reads and validates the supervisor handoff without importing supervisor internals. */
export function readPlaywrightRuntime(environment: RuntimeEnvironment = process.env): PlaywrightRuntime {
	const values = Object.entries(PLAYWRIGHT_RUNTIME_ENV).map(([field, key]) => {
		const value = environment[key]?.trim()
		if (!value) {
			throw new Error(`${key} is required for Playwright runtime field ${field}`)
		}
		return [field, value] as const
	})

	return Object.fromEntries(values) as PlaywrightRuntime
}