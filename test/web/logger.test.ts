import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('logger', () => {
	it('imports when LOG_LEVEL is unset', async () => {
		const previousLogLevel = process.env.LOG_LEVEL
		delete process.env.LOG_LEVEL

		try {
			await expect(import('../../server/logger.js')).resolves.toBeTruthy()
		} finally {
			if (previousLogLevel === undefined) {
				delete process.env.LOG_LEVEL
			} else {
				process.env.LOG_LEVEL = previousLogLevel
			}
		}
	})
})