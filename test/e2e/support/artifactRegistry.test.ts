import { describe, expect, it } from 'vitest'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
	ARTIFACT_MANIFEST_VERSION,
	createEmptyArtifactManifest,
	readArtifactManifest,
	writeArtifactManifest,
} from '../runtime/artifactRegistry.js'
import {
	createArtifactRegistryClient,
} from './artifactRegistry.js'
import {
	PLAYWRIGHT_RUNTIME_ENV,
} from '../runtime/playwrightEnvironment.js'

async function createRuntimeEnvironment(): Promise<{ environment: NodeJS.ProcessEnv; artifactFile: string }> {
	const directory = await mkdtemp(join(tmpdir(), 'onion-e2e-client-'))
	const artifactFile = join(directory, 'artifacts.json')
	await writeArtifactManifest(artifactFile, createEmptyArtifactManifest())

	return {
		environment: {
			[PLAYWRIGHT_RUNTIME_ENV.webUrl]: 'http://127.0.0.1:5173',
			[PLAYWRIGHT_RUNTIME_ENV.engineUrl]: 'http://127.0.0.1:3000',
			[PLAYWRIGHT_RUNTIME_ENV.runtimeFile]: join(directory, 'runtime.json'),
			[PLAYWRIGHT_RUNTIME_ENV.artifactFile]: artifactFile,
			[PLAYWRIGHT_RUNTIME_ENV.logDir]: directory,
		},
		artifactFile,
	}
}

describe('Playwright artifact registry client', () => {
	it('registers games and users through the supervisor-provided manifest path', async () => {
		const { environment, artifactFile } = await createRuntimeEnvironment()
		const client = createArtifactRegistryClient(environment)

		await client.registerGameId(42)
		const manifest = await client.registerUserId('user-1')

		expect(manifest).toEqual({ version: ARTIFACT_MANIFEST_VERSION, gameIds: [42], userIds: ['user-1'] })
		expect(await readArtifactManifest(artifactFile)).toEqual(manifest)
	})

	it('keeps registrations duplicate-safe', async () => {
		const { environment } = await createRuntimeEnvironment()
		const client = createArtifactRegistryClient(environment)

		await client.registerGameId(7)
		await client.registerGameId(7)
		await client.registerUserId('user-1')
		const manifest = await client.registerUserId('user-1')

		expect(manifest.gameIds).toEqual([7])
		expect(manifest.userIds).toEqual(['user-1'])
	})

	it('fails loudly when the runtime handoff is incomplete', () => {
		expect(() => createArtifactRegistryClient({
			[PLAYWRIGHT_RUNTIME_ENV.artifactFile]: '/tmp/artifacts.json',
		})).toThrow(`${PLAYWRIGHT_RUNTIME_ENV.webUrl} is required`)
	})

	it('propagates malformed manifest errors from the registry', async () => {
		const { environment, artifactFile } = await createRuntimeEnvironment()
		const fs = await import('node:fs/promises')
		await fs.writeFile(artifactFile, '{not json', 'utf8')
		const client = createArtifactRegistryClient(environment)

		await expect(client.registerGameId(42)).rejects.toThrow(/not valid JSON/)
	})
})