import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveScenariosDir } from './scenarioPaths.js'

afterEach(() => {
	vi.unstubAllEnvs()
	vi.restoreAllMocks()
})

describe('resolveScenariosDir', () => {
	it('prefers SCENARIOS_DIR when set', () => {
		vi.stubEnv('SCENARIOS_DIR', '/tmp/custom-scenarios')
		expect(resolveScenariosDir()).toBe('/tmp/custom-scenarios')
	})
})