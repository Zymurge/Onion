/// <reference types="node" />

import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'

describe('build regression gate', () => {
	it('passes the build steps', { timeout: 15000 }, () => {
		expect(() => {
			execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/typescript/bin/tsc', import.meta.url))], {
				cwd: process.cwd(),
				stdio: 'pipe',
			})
			execFileSync(process.execPath, [fileURLToPath(new URL('../../scripts/write-dist-package-json.mjs', import.meta.url))], {
				cwd: process.cwd(),
				stdio: 'pipe',
			})
		}).not.toThrow()
	})
})