/**
 * Targeted cleanup for the games and users a run registered.
 *
 * Cleanup is scoped strictly to the artifact manifest: there is no global
 * delete path here, matching the harness rule against ever clearing a shared
 * database wholesale. Deletion errors are collected rather than thrown so a
 * cleanup problem can never mask the actual test result.
 */

import { readArtifactManifest, type ArtifactManifest } from './artifactRegistry.js'
import type { ArtifactCleanupDatabase, ArtifactCleanupDatabaseFactory } from './types.js'

export type ArtifactCleanupResult = {
	deletedGameIds: number[]
	deletedUserIds: string[]
	errors: string[]
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}

/** Deletes only the registered matches and users, in dependency-safe order. Never throws. */
export async function cleanupArtifacts(
	database: ArtifactCleanupDatabase,
	manifest: ArtifactManifest,
): Promise<ArtifactCleanupResult> {
	const result: ArtifactCleanupResult = { deletedGameIds: [], deletedUserIds: [], errors: [] }

	// Matches first: game_state/game_events cascade from matches, but users are
	// still referenced by any match left behind after a partial failure.
	try {
		if (manifest.gameIds.length > 0) {
			await database.deleteMatches(manifest.gameIds)
		}
		result.deletedGameIds = [...manifest.gameIds]
	} catch (error) {
		result.errors.push(`Failed to delete matches [${manifest.gameIds.join(', ')}]: ${errorMessage(error)}`)
	}

	try {
		if (manifest.userIds.length > 0) {
			await database.deleteUsers(manifest.userIds)
		}
		result.deletedUserIds = [...manifest.userIds]
	} catch (error) {
		result.errors.push(`Failed to delete users [${manifest.userIds.join(', ')}]: ${errorMessage(error)}`)
	}

	return result
}

/** Best-effort teardown helper: reads the manifest and cleans registered rows without ever throwing. */
export async function cleanupRegisteredArtifacts(
	artifactFile: string,
	databaseUrl: string,
	factory: ArtifactCleanupDatabaseFactory,
): Promise<ArtifactCleanupResult> {
	let manifest: ArtifactManifest
	try {
		manifest = await readArtifactManifest(artifactFile)
	} catch (error) {
		return {
			deletedGameIds: [],
			deletedUserIds: [],
			errors: [`Failed to read artifact manifest at ${artifactFile}: ${errorMessage(error)}`],
		}
	}

	if (manifest.gameIds.length === 0 && manifest.userIds.length === 0) {
		return { deletedGameIds: [], deletedUserIds: [], errors: [] }
	}

	let database: ArtifactCleanupDatabase | undefined
	try {
		database = factory.create(databaseUrl)
		return await cleanupArtifacts(database, manifest)
	} catch (error) {
		return {
			deletedGameIds: [],
			deletedUserIds: [],
			errors: [`Failed to run artifact cleanup: ${errorMessage(error)}`],
		}
	} finally {
		await database?.close()
	}
}
