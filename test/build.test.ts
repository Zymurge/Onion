import { execFileSync } from 'node:child_process'
import { describe, it, expect } from 'vitest'

describe('build regression gate', () => {
	it('passes pnpm run build', () => {
		expect(() => {
			execFileSync('pnpm', ['run', 'build'], {
				cwd: process.cwd(),
				stdio: 'pipe',
			})
		}).not.toThrow()
	})
})