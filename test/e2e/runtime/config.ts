import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ResolvedRuntimeOptions } from './types.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export const DEFAULT_RUNTIME_FILE = resolve(repoRoot, '.e2e-runtime/runtime.json')
export const DEFAULT_STARTUP_TIMEOUT_MS = 120_000

type RuntimeEnv = Record<string, string | undefined>

function readTrimmed(env: RuntimeEnv, key: string): string | undefined {
	const value = env[key]?.trim()
	return value ? value : undefined
}

function readServiceUrl(env: RuntimeEnv, key: string): string | undefined {
	const value = readTrimmed(env, key)
	if (!value) {
		return undefined
	}

	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		throw new Error(`${key} must be an absolute http(s) URL, received "${value}"`)
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		throw new Error(`${key} must be an absolute http(s) URL, received "${value}"`)
	}

	return value.replace(/\/+$/, '')
}

function readBoolean(env: RuntimeEnv, key: string, fallback: boolean): boolean {
	const value = readTrimmed(env, key)?.toLowerCase()
	if (value === undefined) {
		return fallback
	}
	if (value === 'true' || value === '1' || value === 'yes') {
		return true
	}
	if (value === 'false' || value === '0' || value === 'no') {
		return false
	}

	throw new Error(`${key} must be one of true/false/1/0/yes/no, received "${env[key]}"`)
}

function readTimeout(env: RuntimeEnv, key: string, fallback: number): number {
	const value = readTrimmed(env, key)
	if (value === undefined) {
		return fallback
	}

	const parsed = Number(value)
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`${key} must be a positive integer number of milliseconds, received "${value}"`)
	}

	return parsed
}

/**
 * Resolves harness runtime parameters from the environment.
 *
 * Explicit but malformed values fail fast rather than falling back to a default,
 * so a typo cannot silently change which runtime the tests attach to.
 */
export function resolveRuntimeOptions(env: RuntimeEnv = process.env): ResolvedRuntimeOptions {
	const runtimeFile = readTrimmed(env, 'E2E_RUNTIME_FILE')

	return {
		databaseUrl: readTrimmed(env, 'E2E_DATABASE_URL') ?? readTrimmed(env, 'DATABASE_URL'),
		engineUrl: readServiceUrl(env, 'E2E_ENGINE_URL'),
		webUrl: readServiceUrl(env, 'E2E_WEB_URL'),
		runtimeFile: runtimeFile ? (isAbsolute(runtimeFile) ? runtimeFile : resolve(repoRoot, runtimeFile)) : DEFAULT_RUNTIME_FILE,
		reuseRuntime: readBoolean(env, 'E2E_REUSE_RUNTIME', true),
		keepRuntimeOnFailure: readBoolean(env, 'E2E_KEEP_RUNTIME_ON_FAILURE', true),
		startupTimeoutMs: readTimeout(env, 'E2E_STARTUP_TIMEOUT_MS', DEFAULT_STARTUP_TIMEOUT_MS),
	}
}
