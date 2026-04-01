import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
	vi.unstubAllGlobals()
	vi.resetModules()
})

describe('logger', () => {
	it('imports without process in the global scope', async () => {
		vi.stubGlobal('process', undefined)

		await expect(import('./logger.js')).resolves.toBeTruthy()
	})
})