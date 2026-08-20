import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startRuntimeSupervisor } from './supervisor.js'
import {
	RUNTIME_DESCRIPTOR_VERSION,
	type ArtifactCleanupDatabase,
	type ArtifactCleanupDatabaseFactory,
	type DatabaseContainerHandle,
	type DatabaseContainerLauncher,
	type DatabaseProbe,
	type DescriptorStore,
	type HttpProbe,
	type PortAllocator,
	type ProcessHandle,
	type ProcessLauncher,
	type RuntimeDescriptor,
} from './types.js'
import { createEmptyArtifactManifest, writeArtifactManifest } from './artifactRegistry.js'

const cleanupPaths: string[] = []

afterEach(async () => {
	await Promise.all(cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function options(overrides: Partial<Parameters<typeof startRuntimeSupervisor>[0]> = {}) {
	const directory = await mkdtemp(join(tmpdir(), 'onion-e2e-supervisor-'))
	cleanupPaths.push(directory)
	return {
		databaseUrl: undefined,
		engineUrl: undefined,
		webUrl: undefined,
		runtimeFile: join(directory, 'runtime.json'),
		reuseRuntime: true,
		keepRuntimeOnFailure: true,
		startupTimeoutMs: 100,
		...overrides,
	}
}

describe('startRuntimeSupervisor', () => {
	it('reuses a healthy descriptor without spawning resources', async () => {
		const adapter = new FakeRuntimeAdapters()
		const runtimeOptions = await options()
		adapter.descriptors.descriptor = descriptor(runtimeOptions.runtimeFile)

		const session = await startRuntimeSupervisor(runtimeOptions, { adapters: adapter, now: fixedNow })

		expect(session.runtime).toMatchObject({
			engineUrl: 'http://127.0.0.1:4100',
			webUrl: 'http://127.0.0.1:5100',
			databaseUrl: 'postgres://reused/onion',
			ownership: { database: 'reused', engine: 'reused', web: 'reused' },
		})
		expect(adapter.processes.inputs).toEqual([])
		expect(adapter.databaseContainer.starts).toBe(0)

		await session.teardown(true)
		expect(adapter.descriptors.removes).toBe(0)
	})

	it('starts owned database, engine, and Vite with dynamic ports', async () => {
		const adapter = new FakeRuntimeAdapters()
		const session = await startRuntimeSupervisor(await options({ reuseRuntime: false }), {
			adapters: adapter,
			now: fixedNow,
			pid: 91,
		})

		expect(session.runtime).toMatchObject({
			engineUrl: 'http://127.0.0.1:4100',
			webUrl: 'http://127.0.0.1:5100',
			databaseUrl: 'postgres://owned/onion',
			ownership: { database: 'owned', engine: 'owned', web: 'owned' },
		})
		expect(session.runtime.artifactFile).toBe(`${session.runtime.logDir}/artifacts.json`)
		expect(adapter.processes.inputs).toEqual([
			expect.objectContaining({
				command: 'pnpm',
				args: ['exec', 'tsx', 'server/index.ts'],
				env: expect.objectContaining({
					DATABASE_URL: 'postgres://owned/onion',
					HOST: '127.0.0.1',
					PORT: '4100',
					JWT_SECRET: expect.stringMatching(/^[0-9a-f]{64}$/),
					NODE_ENV: 'test',
					LOG_LEVEL: 'error',
					SCENARIOS_DIR: join(process.cwd(), 'scenarios'),
				}),
			}),
			expect.objectContaining({
				command: 'pnpm',
				args: ['--dir', 'web', 'dev', '--host', '127.0.0.1', '--port', '5100'],
				env: expect.objectContaining({ VITE_ONION_API_URL: 'http://127.0.0.1:4100' }),
			}),
		])
		expect(adapter.descriptors.writes).toHaveLength(1)

		await session.teardown(true)
		expect(adapter.processes.stops).toBe(2)
		expect(adapter.databaseContainer.stops).toBe(1)
		expect(adapter.descriptors.removes).toBe(1)
	})

	it('cleans up registered artifacts before stopping owned resources on success', async () => {
		const adapter = new FakeRuntimeAdapters()
		const session = await startRuntimeSupervisor(await options({ reuseRuntime: false }), { adapters: adapter, now: fixedNow })
		await writeArtifactManifest(session.runtime.artifactFile, {
			...createEmptyArtifactManifest(),
			gameIds: [42],
			userIds: ['user-1'],
		})

		await session.teardown(true)

		expect(adapter.artifactCleanup.creates).toEqual(['postgres://owned/onion'])
		expect(adapter.artifactCleanup.deletedGameIds).toEqual([[42]])
		expect(adapter.artifactCleanup.deletedUserIds).toEqual([['user-1']])
		expect(adapter.artifactCleanup.closes).toBe(1)
		expect(adapter.databaseContainer.stops).toBe(1)
	})

	it('skips cleanup when no database is attached', async () => {
		const adapter = new FakeRuntimeAdapters()
		const session = await startRuntimeSupervisor(
			await options({ reuseRuntime: false, engineUrl: 'http://127.0.0.1:9000', webUrl: 'http://127.0.0.1:9001' }),
			{ adapters: adapter, now: fixedNow },
		)

		expect(session.runtime.databaseUrl).toBeUndefined()

		await session.teardown(true)

		expect(adapter.artifactCleanup.creates).toEqual([])
	})

	it('cleans registered artifacts on an explicitly attached database without stopping it', async () => {
		const adapter = new FakeRuntimeAdapters()
		const session = await startRuntimeSupervisor(
			await options({ reuseRuntime: false, databaseUrl: 'postgres://external/onion' }),
			{ adapters: adapter, now: fixedNow },
		)
		await writeArtifactManifest(session.runtime.artifactFile, {
			...createEmptyArtifactManifest(),
			gameIds: [18],
			userIds: ['external-user-18'],
		})

		await session.teardown(true)

		expect(adapter.artifactCleanup.creates).toEqual(['postgres://external/onion'])
		expect(adapter.artifactCleanup.deletedGameIds).toEqual([[18]])
		expect(adapter.artifactCleanup.deletedUserIds).toEqual([['external-user-18']])
		expect(adapter.databaseContainer.starts).toBe(0)
		expect(adapter.databaseContainer.stops).toBe(0)
		expect(adapter.processes.stops).toBe(2)
	})

	it('preserves owned resources after a failed run by default', async () => {
		const adapter = new FakeRuntimeAdapters()
		const session = await startRuntimeSupervisor(await options({ reuseRuntime: false }), { adapters: adapter, now: fixedNow })

		await session.teardown(false)

		expect(adapter.processes.stops).toBe(0)
		expect(adapter.databaseContainer.stops).toBe(0)
		expect(adapter.descriptors.removes).toBe(0)
		expect(adapter.artifactCleanup.creates).toEqual([])
	})

	it('still cleans up registered artifacts on failure when preservation is disabled', async () => {
		const adapter = new FakeRuntimeAdapters()
		const session = await startRuntimeSupervisor(
			await options({ reuseRuntime: false, keepRuntimeOnFailure: false }),
			{ adapters: adapter, now: fixedNow },
		)
		await writeArtifactManifest(session.runtime.artifactFile, { ...createEmptyArtifactManifest(), gameIds: [7], userIds: [] })

		await session.teardown(false)

		expect(adapter.artifactCleanup.creates).toEqual(['postgres://owned/onion'])
		expect(adapter.processes.stops).toBe(2)
	})

	it('reports diagnostic locations when readiness fails', async () => {
		const adapter = new FakeRuntimeAdapters()
		adapter.http.failPaths.add('/health/ready')
		const runtimeOptions = await options({ reuseRuntime: false })

		await expect(startRuntimeSupervisor(runtimeOptions, { adapters: adapter, now: fixedNow })).rejects.toThrow(
			/E2E runtime setup failed\.\nReason: unhealthy \/health\/ready[\s\S]*Log directory: .*logs\/2026-08-07T00-00-00-000Z[\s\S]*Artifact manifest:/,
		)
		expect(adapter.descriptors.writes).toHaveLength(1)
		expect(adapter.descriptors.writes[0]).toMatchObject({
			engineUrl: '(starting)',
			webUrl: '(starting)',
		})
	})

	it('cleans partially started resources when setup failure cleanup is enabled', async () => {
		const adapter = new FakeRuntimeAdapters()
		adapter.http.failPaths.add('/')
		const runtimeOptions = await options({ reuseRuntime: false, keepRuntimeOnFailure: false })

		await expect(startRuntimeSupervisor(runtimeOptions, { adapters: adapter, now: fixedNow })).rejects.toThrow(
			/E2E runtime setup failed\.[\s\S]*Runtime descriptor: .*runtime\.json[\s\S]*Playwright report:/,
		)
		expect(adapter.processes.stops).toBe(2)
		expect(adapter.databaseContainer.stops).toBe(1)
		expect(adapter.descriptors.removes).toBe(1)
	})

	it('preserves partially started resources when setup failure cleanup is disabled', async () => {
		const adapter = new FakeRuntimeAdapters()
		adapter.http.failPaths.add('/')
		const runtimeOptions = await options({ reuseRuntime: false })

		await expect(startRuntimeSupervisor(runtimeOptions, { adapters: adapter, now: fixedNow })).rejects.toThrow('E2E runtime setup failed.')
		expect(adapter.processes.stops).toBe(0)
		expect(adapter.databaseContainer.stops).toBe(0)
		expect(adapter.descriptors.removes).toBe(0)
	})
})

const fixedNow = () => new Date('2026-08-07T00:00:00.000Z')

function descriptor(_runtimeFile: string): RuntimeDescriptor {
	void _runtimeFile
	return {
		version: RUNTIME_DESCRIPTOR_VERSION,
		pid: 1,
		startedAt: '2026-08-07T00:00:00.000Z',
		engineUrl: 'http://127.0.0.1:4100',
		webUrl: 'http://127.0.0.1:5100',
		databaseUrl: 'postgres://reused/onion',
		logDir: '/tmp/reused-logs',
		artifactFile: '/tmp/reused-artifacts.json',
	}
}

class FakeRuntimeAdapters {
	http = new FakeHttpProbe()
	database = new FakeDatabaseProbe()
	descriptors = new FakeDescriptorStore()
	ports = new FakePortAllocator()
	processes = new FakeProcessLauncher()
	databaseContainer = new FakeDatabaseContainerLauncher()
	artifactCleanup = new FakeArtifactCleanupDatabaseFactory()
}

class FakeHttpProbe implements HttpProbe {
	failPaths = new Set<string>()

	async waitForStatus(_url: string, path: string): Promise<void> {
		if (this.failPaths.has(path)) {
			throw new Error(`unhealthy ${path}`)
		}
	}
}

class FakeDatabaseProbe implements DatabaseProbe {
	async check(databaseUrl: string): Promise<void> {
		void databaseUrl
	}
}

class FakeDescriptorStore implements DescriptorStore {
	descriptor: RuntimeDescriptor | null = null
	writes: RuntimeDescriptor[] = []
	removes = 0

	async read(path: string): Promise<RuntimeDescriptor | null> {
		void path
		return this.descriptor
	}

	async write(path: string, value: RuntimeDescriptor): Promise<void> {
		void path
		this.writes.push(value)
	}

	async remove(path: string): Promise<void> {
		void path
		this.removes += 1
	}

	async acquireLock(path: string): Promise<{ release(): Promise<void> }> {
		void path
		return { release: async () => {} }
	}
}

class FakePortAllocator implements PortAllocator {
	private ports = [4100, 5100]

	async allocate(): Promise<number> {
		const port = this.ports.shift()
		if (!port) throw new Error('No test port available')
		return port
	}
}

class FakeProcessLauncher implements ProcessLauncher {
	inputs: Parameters<ProcessLauncher['spawn']>[0][] = []
	stops = 0

	spawn(input: Parameters<ProcessLauncher['spawn']>[0]): ProcessHandle {
		this.inputs.push(input)
		return { stop: async () => { this.stops += 1 } }
	}
}

class FakeDatabaseContainerLauncher implements DatabaseContainerLauncher {
	starts = 0
	stops = 0

	async start(): Promise<DatabaseContainerHandle> {
		this.starts += 1
		return {
			connectionUri: 'postgres://owned/onion',
			containerId: 'container-1',
			stop: async () => { this.stops += 1 },
		}
	}
}

class FakeArtifactCleanupDatabaseFactory implements ArtifactCleanupDatabaseFactory {
	creates: string[] = []
	closes = 0
	deletedGameIds: number[][] = []
	deletedUserIds: string[][] = []

	create(databaseUrl: string): ArtifactCleanupDatabase {
		this.creates.push(databaseUrl)
		return {
			deleteMatches: async (gameIds: number[]) => {
				this.deletedGameIds.push(gameIds)
			},
			deleteUsers: async (userIds: string[]) => {
				this.deletedUserIds.push(userIds)
			},
			close: async () => {
				this.closes += 1
			},
		}
	}
}
