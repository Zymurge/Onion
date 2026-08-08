import { devices, type PlaywrightTestConfig } from '@playwright/test'
import { getPlaywrightDiagnosticPaths } from './playwrightDiagnostics.js'

type RuntimeEnvironment = Record<string, string | undefined>

/** Resolves deterministic Playwright settings from the wrapper's explicit runtime environment. */
export function resolvePlaywrightConfig(environment: RuntimeEnvironment = process.env): PlaywrightTestConfig {
	const webUrl = environment.E2E_WEB_URL?.trim().replace(/\/+$/, '')
	const logDir = environment.E2E_LOG_DIR?.trim()
	const diagnosticPaths = logDir ? getPlaywrightDiagnosticPaths(logDir) : undefined

	return {
		testDir: './test/e2e/scenarios',
		outputDir: diagnosticPaths?.outputDir ?? 'test-results',
		fullyParallel: false,
		forbidOnly: Boolean(environment.CI),
		retries: 0,
		workers: 1,
		timeout: 30_000,
		expect: {
			timeout: 5_000,
		},
		use: {
			baseURL: webUrl || undefined,
			trace: 'retain-on-failure',
			screenshot: 'only-on-failure',
			video: 'retain-on-failure',
		},
		reporter: [
			['list'],
			['html', { outputFolder: diagnosticPaths?.reportDir ?? 'playwright-report', open: 'never' }],
		],
		projects: [
			{
				name: 'chromium',
				use: { ...devices['Desktop Chrome'] },
			},
		],
	}
}