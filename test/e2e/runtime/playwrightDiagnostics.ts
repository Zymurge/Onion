import { join } from 'node:path'

export type PlaywrightDiagnosticPaths = {
	reportDir: string
	outputDir: string
}

/** Returns the report and failure-artifact directories within one runtime diagnostic root. */
export function getPlaywrightDiagnosticPaths(logDir: string): PlaywrightDiagnosticPaths {
	return {
		reportDir: join(logDir, 'playwright', 'report'),
		outputDir: join(logDir, 'playwright', 'test-results'),
	}
}