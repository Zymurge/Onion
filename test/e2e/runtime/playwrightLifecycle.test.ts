import { describe, expect, it } from 'vitest'
import { runPlaywrightLifecycle } from './playwrightLifecycle.js'
import type { ResolvedRuntime } from './types.js'

const runtime: ResolvedRuntime = {
	engineUrl: 'http://127.0.0.1:3000',
	webUrl: 'http://127.0.0.1:5173',
	databaseUrl: undefined,
	logDir: '/tmp/e2e/logs/run-1',
	artifactFile: '/tmp/e2e/artifacts-run-1.json',
	ownership: { database: 'external', engine: 'external', web: 'external' },
}

describe('runPlaywrightLifecycle', () => {
	it('returns Playwright failure status and finalizes once as a failure', async () => {
		const teardownCalls: boolean[] = []

		const exitCode = await runPlaywrightLifecycle({
			runtime,
			runtimeFile: '/tmp/e2e/runtime.json',
			teardown: async (success) => { teardownCalls.push(success) },
			run: async (environment) => {
				expect(environment).toMatchObject({
					E2E_WEB_URL: runtime.webUrl,
					E2E_ENGINE_URL: runtime.engineUrl,
					E2E_RUNTIME_FILE: '/tmp/e2e/runtime.json',
					E2E_ARTIFACT_FILE: runtime.artifactFile,
					E2E_LOG_DIR: runtime.logDir,
				})
				return 3
			},
			parentEnvironment: {},
		})

		expect(exitCode).toBe(3)
		expect(teardownCalls).toEqual([false])
	})

	it('finalizes once as a failure when Playwright cannot launch', async () => {
		const teardownCalls: boolean[] = []

		await expect(runPlaywrightLifecycle({
			runtime,
			runtimeFile: '/tmp/e2e/runtime.json',
			teardown: async (success) => { teardownCalls.push(success) },
			run: async () => { throw new Error('Playwright command not found') },
			parentEnvironment: {},
		})).rejects.toThrow('Playwright command not found')

		expect(teardownCalls).toEqual([false])
	})

	it('finalizes once as a success for a passing browser run', async () => {
		const teardownCalls: boolean[] = []

		await expect(runPlaywrightLifecycle({
			runtime,
			runtimeFile: '/tmp/e2e/runtime.json',
			teardown: async (success) => { teardownCalls.push(success) },
			run: async () => 0,
			parentEnvironment: {},
		})).resolves.toBe(0)

		expect(teardownCalls).toEqual([true])
	})
})