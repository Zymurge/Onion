import { describe, expect, it } from 'vitest'
import { getPlaywrightDiagnosticPaths } from './playwrightDiagnostics.js'

describe('getPlaywrightDiagnosticPaths', () => {
	it('places Playwright report and failure output beneath the runtime log directory', () => {
		expect(getPlaywrightDiagnosticPaths('/tmp/e2e/logs/run-1')).toEqual({
			reportDir: '/tmp/e2e/logs/run-1/playwright/report',
			outputDir: '/tmp/e2e/logs/run-1/playwright/test-results',
		})
	})
})