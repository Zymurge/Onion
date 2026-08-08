import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupArtifacts, cleanupRegisteredArtifacts } from './artifactCleanup.js'
import { createEmptyArtifactManifest, writeArtifactManifest, type ArtifactManifest } from './artifactRegistry.js'
import type { ArtifactCleanupDatabase, ArtifactCleanupDatabaseFactory } from './types.js'

class FakeArtifactCleanupDatabase implements ArtifactCleanupDatabase {
	deleteMatchesCalls: number[][] = []
	deleteUsersCalls: string[][] = []
	closes = 0
	failDeleteMatches: Error | undefined
	failDeleteUsers: Error | undefined

	async deleteMatches(gameIds: number[]): Promise<void> {
		this.deleteMatchesCalls.push(gameIds)
		if (this.failDeleteMatches) throw this.failDeleteMatches
	}

	async deleteUsers(userIds: string[]): Promise<void> {
		this.deleteUsersCalls.push(userIds)
		if (this.failDeleteUsers) throw this.failDeleteUsers
	}

	async close(): Promise<void> {
		this.closes += 1
	}
}

class FakeArtifactCleanupDatabaseFactory implements ArtifactCleanupDatabaseFactory {
	created: FakeArtifactCleanupDatabase[] = []
	createUrls: string[] = []
	failCreate: Error | undefined

	create(databaseUrl: string): ArtifactCleanupDatabase {
		this.createUrls.push(databaseUrl)
		if (this.failCreate) throw this.failCreate
		const database = new FakeArtifactCleanupDatabase()
		this.created.push(database)
		return database
	}
}

function manifest(overrides: Partial<ArtifactManifest> = {}): ArtifactManifest {
	return { ...createEmptyArtifactManifest(), ...overrides }
}

describe('cleanupArtifacts', () => {
	it('deletes only the registered matches and users, matches before users', async () => {
		const database = new FakeArtifactCleanupDatabase()
		const calls: string[] = []
		database.deleteMatches = async (gameIds) => {
			calls.push('matches')
			database.deleteMatchesCalls.push(gameIds)
		}
		database.deleteUsers = async (userIds) => {
			calls.push('users')
			database.deleteUsersCalls.push(userIds)
		}

		const result = await cleanupArtifacts(database, manifest({ gameIds: [1, 2], userIds: ['user-1'] }))

		expect(calls).toEqual(['matches', 'users'])
		expect(result).toEqual({ deletedGameIds: [1, 2], deletedUserIds: ['user-1'], errors: [] })
	})

	it('never calls delete for an empty registry, never performing a global deletion', async () => {
		const database = new FakeArtifactCleanupDatabase()

		const result = await cleanupArtifacts(database, manifest())

		expect(database.deleteMatchesCalls).toEqual([])
		expect(database.deleteUsersCalls).toEqual([])
		expect(result).toEqual({ deletedGameIds: [], deletedUserIds: [], errors: [] })
	})

	it('is safe to repeat against the same manifest', async () => {
		const database = new FakeArtifactCleanupDatabase()
		const target = manifest({ gameIds: [9], userIds: ['user-9'] })

		const first = await cleanupArtifacts(database, target)
		const second = await cleanupArtifacts(database, target)

		expect(first).toEqual(second)
		expect(database.deleteMatchesCalls).toEqual([[9], [9]])
	})

	it('reports a match deletion failure without skipping user cleanup', async () => {
		const database = new FakeArtifactCleanupDatabase()
		database.failDeleteMatches = new Error('constraint violation')

		const result = await cleanupArtifacts(database, manifest({ gameIds: [1], userIds: ['user-1'] }))

		expect(result.errors).toEqual([expect.stringMatching(/Failed to delete matches \[1\].*constraint violation/)])
		expect(result.deletedGameIds).toEqual([])
		expect(result.deletedUserIds).toEqual(['user-1'])
	})

	it('reports a user deletion failure independently of match cleanup', async () => {
		const database = new FakeArtifactCleanupDatabase()
		database.failDeleteUsers = new Error('foreign key violation')

		const result = await cleanupArtifacts(database, manifest({ gameIds: [1], userIds: ['user-1'] }))

		expect(result.deletedGameIds).toEqual([1])
		expect(result.errors).toEqual([expect.stringMatching(/Failed to delete users \[user-1\].*foreign key violation/)])
	})
})

async function manifestPath(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), 'onion-e2e-cleanup-'))
	return join(directory, 'artifacts.json')
}

describe('cleanupRegisteredArtifacts', () => {
	it('can retry manifest cleanup without broadening its deletion scope', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, manifest({ gameIds: [8], userIds: ['user-8'] }))
		const factory = new FakeArtifactCleanupDatabaseFactory()

		const first = await cleanupRegisteredArtifacts(path, 'postgres://test/onion', factory)
		const second = await cleanupRegisteredArtifacts(path, 'postgres://test/onion', factory)

		expect(first.errors).toEqual([])
		expect(second.errors).toEqual([])
		expect(factory.createUrls).toEqual(['postgres://test/onion', 'postgres://test/onion'])
		expect(factory.created.flatMap((database) => database.deleteMatchesCalls)).toEqual([[8], [8]])
		expect(factory.created.flatMap((database) => database.deleteUsersCalls)).toEqual([['user-8'], ['user-8']])
	})

	it('creates a cleanup database and deletes registered rows', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, manifest({ gameIds: [5], userIds: ['user-5'] }))
		const factory = new FakeArtifactCleanupDatabaseFactory()

		const result = await cleanupRegisteredArtifacts(path, 'postgres://test/onion', factory)

		expect(factory.createUrls).toEqual(['postgres://test/onion'])
		expect(result).toEqual({ deletedGameIds: [5], deletedUserIds: ['user-5'], errors: [] })
		expect(factory.created[0]?.closes).toBe(1)
	})

	it('skips creating a database connection when the manifest is empty', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, manifest())
		const factory = new FakeArtifactCleanupDatabaseFactory()

		const result = await cleanupRegisteredArtifacts(path, 'postgres://test/onion', factory)

		expect(factory.createUrls).toEqual([])
		expect(result).toEqual({ deletedGameIds: [], deletedUserIds: [], errors: [] })
	})

	it('reports a missing manifest without throwing', async () => {
		const path = join(tmpdir(), `onion-e2e-cleanup-missing-${Date.now()}.json`)
		const factory = new FakeArtifactCleanupDatabaseFactory()

		const result = await cleanupRegisteredArtifacts(path, 'postgres://test/onion', factory)

		expect(factory.createUrls).toEqual([])
		expect(result.errors).toEqual([expect.stringMatching(/Failed to read artifact manifest/)])
	})

	it('closes the database and reports the error when the factory fails to connect', async () => {
		const path = await manifestPath()
		await writeArtifactManifest(path, manifest({ gameIds: [1], userIds: [] }))
		const factory = new FakeArtifactCleanupDatabaseFactory()
		factory.failCreate = new Error('connection refused')

		const result = await cleanupRegisteredArtifacts(path, 'postgres://test/onion', factory)

		expect(result.errors).toEqual([expect.stringMatching(/Failed to run artifact cleanup.*connection refused/)])
		expect(factory.created).toEqual([])
	})
})
