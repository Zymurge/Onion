import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

describe('build regression gate', () => {
	it('passes pnpm run build', { timeout: 15000 }, () => {
		expect(() => {
			execFileSync('pnpm', ['run', 'build'], {
				cwd: process.cwd(),
				stdio: 'pipe',
			})
		}).not.toThrow()
	})
})