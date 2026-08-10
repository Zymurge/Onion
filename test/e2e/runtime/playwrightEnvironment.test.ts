import { describe, expect, it } from 'vitest'
import {
	createPlaywrightRuntimeEnvironment,
	PLAYWRIGHT_RUNTIME_ENV,
	readPlaywrightRuntime,
} from './playwrightEnvironment.js'
import type { ResolvedRuntime } from './types.js'

const runtime: ResolvedRuntime = {
	engineUrl: 'http://127.0.0.1:3000',
	webUrl: 'http://127.0.0.1:5173',
	databaseUrl: 'postgres://test/onion',
	logDir: '/tmp/e2e/logs/run-1',
	artifactFile: '/tmp/e2e/artifacts-run-1.json',
	ownership: { database: 'owned', engine: 'owned', web: 'owned' },
}

describe('Playwright runtime environment', () => {
	it('passes the resolved runtime through named environment variables', () => {
		const environment = createPlaywrightRuntimeEnvironment(runtime, '/tmp/e2e/runtime.json', { PATH: '/bin' })

		expect(environment).toMatchObject({
			PATH: '/bin',
			[PLAYWRIGHT_RUNTIME_ENV.webUrl]: runtime.webUrl,
			[PLAYWRIGHT_RUNTIME_ENV.engineUrl]: runtime.engineUrl,
			[PLAYWRIGHT_RUNTIME_ENV.runtimeFile]: '/tmp/e2e/runtime.json',
			[PLAYWRIGHT_RUNTIME_ENV.artifactFile]: runtime.artifactFile,
			[PLAYWRIGHT_RUNTIME_ENV.logDir]: runtime.logDir,
		})
	})

	it('reads the contract without importing supervisor internals', () => {
		const environment = createPlaywrightRuntimeEnvironment(runtime, '/tmp/e2e/runtime.json', {})

		expect(readPlaywrightRuntime(environment)).toEqual({
			webUrl: runtime.webUrl,
			engineUrl: runtime.engineUrl,
			runtimeFile: '/tmp/e2e/runtime.json',
			artifactFile: runtime.artifactFile,
			logDir: runtime.logDir,
		})
	})

	it('fails loudly when a required handoff value is absent', () => {
		expect(() => readPlaywrightRuntime({ [PLAYWRIGHT_RUNTIME_ENV.webUrl]: runtime.webUrl })).toThrow(
			`${PLAYWRIGHT_RUNTIME_ENV.engineUrl} is required`,
		)
	})
})