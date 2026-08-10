/**
 * Versioned registry for test-created game and user ids.
 *
 * Registration is additive and duplicate-safe: there is no replace-all or
 * delete-all entry point, so cleanup can never be handed unscoped data.
 * Concurrent registrations against the same manifest path are serialized
 * in-process; this assumes a single Playwright worker process, which
 * `playwright.config.ts` already enforces.
 */

import { promises as fs } from 'node:fs'

export const ARTIFACT_MANIFEST_VERSION = 1

export type ArtifactManifest = {
	version: typeof ARTIFACT_MANIFEST_VERSION
	gameIds: number[]
	userIds: string[]
}

export function createEmptyArtifactManifest(): ArtifactManifest {
	return { version: ARTIFACT_MANIFEST_VERSION, gameIds: [], userIds: [] }
}

function parseArtifactManifest(raw: string, path: string): ArtifactManifest {
	let parsed: unknown
	try {
		parsed = JSON.parse(raw)
	} catch {
		throw new Error(`Artifact manifest at ${path} is not valid JSON`)
	}

	const candidate = parsed as Partial<ArtifactManifest> | null
	const isValid =
		typeof candidate === 'object' &&
		candidate !== null &&
		candidate.version === ARTIFACT_MANIFEST_VERSION &&
		Array.isArray(candidate.gameIds) &&
		candidate.gameIds.every((id) => typeof id === 'number') &&
		Array.isArray(candidate.userIds) &&
		candidate.userIds.every((id) => typeof id === 'string')

	if (!isValid) {
		throw new Error(`Artifact manifest at ${path} is malformed or has an unsupported version`)
	}

	return candidate as ArtifactManifest
}

export async function readArtifactManifest(path: string): Promise<ArtifactManifest> {
	let raw: string
	try {
		raw = await fs.readFile(path, 'utf8')
	} catch (error) {
		throw new Error(`Artifact manifest not found at ${path}: ${error instanceof Error ? error.message : String(error)}`)
	}

	return parseArtifactManifest(raw, path)
}

/** Writes the manifest to a temp file then renames into place, so a crash mid-write cannot corrupt it. */
export async function writeArtifactManifest(path: string, manifest: ArtifactManifest): Promise<void> {
	const tempPath = `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
	await fs.writeFile(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
	await fs.rename(tempPath, path)
}

// Serializes read-modify-write operations per manifest path within this process.
const manifestQueues = new Map<string, Promise<unknown>>()

function withManifestLock<T>(path: string, operation: () => Promise<T>): Promise<T> {
	const previous = manifestQueues.get(path) ?? Promise.resolve()
	const next = previous.then(operation, operation)
	manifestQueues.set(path, next.then(
		() => undefined,
		() => undefined,
	))
	return next
}

async function registerId(path: string, updateManifest: (manifest: ArtifactManifest) => ArtifactManifest): Promise<ArtifactManifest> {
	return withManifestLock(path, async () => {
		const manifest = await readArtifactManifest(path)
		const updated = updateManifest(manifest)
		await writeArtifactManifest(path, updated)
		return updated
	})
}

export async function registerGameId(path: string, gameId: number): Promise<ArtifactManifest> {
	if (!Number.isSafeInteger(gameId) || gameId <= 0) {
		throw new Error(`registerGameId requires a positive integer game id, received ${gameId}`)
	}

	return registerId(path, (manifest) =>
		manifest.gameIds.includes(gameId) ? manifest : { ...manifest, gameIds: [...manifest.gameIds, gameId] },
	)
}

export async function registerUserId(path: string, userId: string): Promise<ArtifactManifest> {
	const trimmed = userId.trim()
	if (!trimmed) {
		throw new Error('registerUserId requires a non-empty user id')
	}

	return registerId(path, (manifest) =>
		manifest.userIds.includes(trimmed) ? manifest : { ...manifest, userIds: [...manifest.userIds, trimmed] },
	)
}
