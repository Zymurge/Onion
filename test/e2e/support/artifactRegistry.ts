import {
	registerGameId,
	registerUserId,
	type ArtifactManifest,
} from '../runtime/artifactRegistry.js'
import { readPlaywrightRuntime } from '../runtime/playwrightEnvironment.js'

export type ArtifactRegistryClient = {
	registerGameId(gameId: number): Promise<ArtifactManifest>
	registerUserId(userId: string): Promise<ArtifactManifest>
}

/** Creates the manifest client from the supervisor's explicit Playwright handoff. */
export function createArtifactRegistryClient(environment: NodeJS.ProcessEnv = process.env): ArtifactRegistryClient {
	const { artifactFile } = readPlaywrightRuntime(environment)

	return {
		registerGameId: (gameId) => registerGameId(artifactFile, gameId),
		registerUserId: (userId) => registerUserId(artifactFile, userId),
	}
}