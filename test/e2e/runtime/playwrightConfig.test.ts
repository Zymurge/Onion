import { describe, expect, it } from 'vitest'
import { resolvePlaywrightConfig } from './playwrightConfig.js'

describe('resolvePlaywrightConfig', () => {
	it('derives browser and diagnostic locations from the runtime environment', () => {
		const config = resolvePlaywrightConfig({
			E2E_WEB_URL: ' http://127.0.0.1:5173/ ',
			E2E_LOG_DIR: '/tmp/e2e/logs/run-1',
			CI: 'true',
		})

		expect(config).toMatchObject({
			testDir: './test/e2e/scenarios',
			outputDir: '/tmp/e2e/logs/run-1/playwright/test-results',
			fullyParallel: false,
			forbidOnly: true,
			retries: 0,
			workers: 1,
			timeout: 30_000,
			use: {
				baseURL: 'http://127.0.0.1:5173',
				headless: true,
				trace: 'retain-on-failure',
				screenshot: 'only-on-failure',
				video: 'retain-on-failure',
			},
		})
		expect(config.reporter).toContainEqual([
			'html',
			{ outputFolder: '/tmp/e2e/logs/run-1/playwright/report', open: 'never' },
		])
		expect(config.projects).toHaveLength(1)
		expect(config.projects?.[0]?.name).toBe('chromium')
	})

	it('uses isolated defaults when invoked outside the supervisor', () => {
		const config = resolvePlaywrightConfig({})

		expect(config.outputDir).toBe('test-results')
		expect(config.use?.baseURL).toBeUndefined()
		expect(config.forbidOnly).toBe(false)
		expect(config.reporter).toContainEqual(['html', { outputFolder: 'playwright-report', open: 'never' }])
	})
})