import { describe, expect, it } from 'vitest'
import { DEFAULT_RUNTIME_FILE, DEFAULT_STARTUP_TIMEOUT_MS, resolveRuntimeOptions } from './config.js'

describe('resolveRuntimeOptions', () => {
	it('applies defaults when nothing is supplied', () => {
		expect(resolveRuntimeOptions({})).toEqual({
			databaseUrl: undefined,
			engineUrl: undefined,
			webUrl: undefined,
			runtimeFile: DEFAULT_RUNTIME_FILE,
			reuseRuntime: true,
			keepRuntimeOnFailure: true,
			startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
		})
	})

	it('prefers the e2e database url over the ambient database url', () => {
		const options = resolveRuntimeOptions({
			E2E_DATABASE_URL: 'postgres://e2e@localhost:5433/onion_e2e',
			DATABASE_URL: 'postgres://dev@localhost:5432/onion',
		})

		expect(options.databaseUrl).toBe('postgres://e2e@localhost:5433/onion_e2e')
	})

	it('falls back to the ambient database url', () => {
		const options = resolveRuntimeOptions({ DATABASE_URL: 'postgres://dev@localhost:5432/onion' })

		expect(options.databaseUrl).toBe('postgres://dev@localhost:5432/onion')
	})

	it('trims values and treats blank values as unset', () => {
		const options = resolveRuntimeOptions({
			E2E_DATABASE_URL: '   ',
			E2E_ENGINE_URL: '  http://127.0.0.1:3000  ',
			E2E_WEB_URL: '',
		})

		expect(options.databaseUrl).toBeUndefined()
		expect(options.engineUrl).toBe('http://127.0.0.1:3000')
		expect(options.webUrl).toBeUndefined()
	})

	it('normalizes trailing slashes on service urls', () => {
		const options = resolveRuntimeOptions({
			E2E_ENGINE_URL: 'http://127.0.0.1:3000/',
			E2E_WEB_URL: 'http://127.0.0.1:5173///',
		})

		expect(options.engineUrl).toBe('http://127.0.0.1:3000')
		expect(options.webUrl).toBe('http://127.0.0.1:5173')
	})

	it('rejects service urls that are not absolute http urls', () => {
		expect(() => resolveRuntimeOptions({ E2E_ENGINE_URL: 'localhost:3000' })).toThrow(/E2E_ENGINE_URL/)
	})

	it('parses boolean toggles in both directions', () => {
		expect(resolveRuntimeOptions({ E2E_REUSE_RUNTIME: 'false' }).reuseRuntime).toBe(false)
		expect(resolveRuntimeOptions({ E2E_REUSE_RUNTIME: '0' }).reuseRuntime).toBe(false)
		expect(resolveRuntimeOptions({ E2E_REUSE_RUNTIME: 'NO' }).reuseRuntime).toBe(false)
		expect(resolveRuntimeOptions({ E2E_KEEP_RUNTIME_ON_FAILURE: 'true' }).keepRuntimeOnFailure).toBe(true)
		expect(resolveRuntimeOptions({ E2E_KEEP_RUNTIME_ON_FAILURE: '1' }).keepRuntimeOnFailure).toBe(true)
		expect(resolveRuntimeOptions({ E2E_KEEP_RUNTIME_ON_FAILURE: 'yes' }).keepRuntimeOnFailure).toBe(true)
	})

	it('rejects unparseable toggles instead of silently defaulting', () => {
		expect(() => resolveRuntimeOptions({ E2E_REUSE_RUNTIME: 'maybe' })).toThrow(/E2E_REUSE_RUNTIME/)
	})

	it('parses a positive startup timeout', () => {
		expect(resolveRuntimeOptions({ E2E_STARTUP_TIMEOUT_MS: '30000' }).startupTimeoutMs).toBe(30_000)
	})

	it('rejects a non-positive or unparseable startup timeout', () => {
		expect(() => resolveRuntimeOptions({ E2E_STARTUP_TIMEOUT_MS: 'soon' })).toThrow(/E2E_STARTUP_TIMEOUT_MS/)
		expect(() => resolveRuntimeOptions({ E2E_STARTUP_TIMEOUT_MS: '0' })).toThrow(/E2E_STARTUP_TIMEOUT_MS/)
	})

	it('resolves a supplied runtime file against the repository root', () => {
		const options = resolveRuntimeOptions({ E2E_RUNTIME_FILE: 'tmp/custom-runtime.json' })

		expect(options.runtimeFile.endsWith('/tmp/custom-runtime.json')).toBe(true)
	})
})
