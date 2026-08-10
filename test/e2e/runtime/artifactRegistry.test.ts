import { describe, expect, it } from 'vitest'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	ARTIFACT_MANIFEST_VERSION,
	createEmptyArtifactManifest,
	readArtifactManifest,
	registerGameId,
	registerUserId,
	writeArtifactManifest,
} from './artifactRegistry.js'

async function manifestPath(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'onion-e2e-artifacts-'))
	return join(directory, 'artifacts.json')
}

describe('artifact manifest read/write', () => {
	it('round-trips an empty manifest', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		await expect(readArtifactManifest(path)).resolves.toEqual({
			version: ARTIFACT_MANIFEST_VERSION,
			gameIds: [],
			userIds: [],
		})
	})

	it('writes atomically, leaving no temp file behind', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		const entries = await readdir(join(path, '..'))
		expect(entries).toEqual(['artifacts.json'])
	})

	it('rejects a manifest with the wrong version', async () => {
		const path = await manifestPath()
		const fs = await import('node:fs/promises')
		await fs.writeFile(path, JSON.stringify({ version: 999, gameIds: [], userIds: [] }), 'utf8')

		await expect(readArtifactManifest(path)).rejects.toThrow(/malformed or has an unsupported version/)
	})

	it('rejects malformed JSON', async () => {
		const path = await manifestPath()
		const fs = await import('node:fs/promises')
		await fs.writeFile(path, '{not json', 'utf8')

		await expect(readArtifactManifest(path)).rejects.toThrow(/not valid JSON/)
	})

	it('rejects a manifest with non-array fields', async () => {
		const path = await manifestPath()
		const fs = await import('node:fs/promises')
		await fs.writeFile(path, JSON.stringify({ version: ARTIFACT_MANIFEST_VERSION, gameIds: 'nope', userIds: [] }), 'utf8')

		await expect(readArtifactManifest(path)).rejects.toThrow(/malformed/)
	})

	it('fails clearly when the manifest file is missing', async () => {
		const path = join(tmpdir(), `onion-e2e-artifacts-missing-${Date.now()}.json`)

		await expect(readArtifactManifest(path)).rejects.toThrow(/Artifact manifest not found/)
	})
})

describe('registerGameId / registerUserId', () => {
	it('adds a new game id and user id', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		await registerGameId(path, 42)
		const manifest = await registerUserId(path, 'user-1')

		expect(manifest).toEqual({ version: ARTIFACT_MANIFEST_VERSION, gameIds: [42], userIds: ['user-1'] })
	})

	it('is duplicate-safe', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		await registerGameId(path, 7)
		const manifest = await registerGameId(path, 7)

		expect(manifest.gameIds).toEqual([7])
	})

	it('rejects a non-positive-integer game id', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		await expect(registerGameId(path, 0)).rejects.toThrow(/positive integer game id/)
		await expect(registerGameId(path, 1.5)).rejects.toThrow(/positive integer game id/)
	})

	it('rejects an empty user id', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		await expect(registerUserId(path, '   ')).rejects.toThrow(/non-empty user id/)
	})

	it('preserves every id from concurrent registrations without losing entries', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, createEmptyArtifactManifest())

		const gameIds = Array.from({ length: 20 }, (_, index) => index + 1)
		await Promise.all(gameIds.map((gameId) => registerGameId(path, gameId)))

		const manifest = await readArtifactManifest(path)
		expect(manifest.gameIds.slice().sort((a, b) => a - b)).toEqual(gameIds)
	})
})
