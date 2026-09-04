import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverHealthyRuntime } from './discovery.js'
import * as processStop from './processStop.js'
import type { DatabaseProbe, DescriptorStore, HttpProbe, RuntimeDescriptor } from './types.js'
import { RUNTIME_DESCRIPTOR_VERSION } from './types.js'

describe('discoverHealthyRuntime', () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it('returns null when no descriptor file exists', async () => {
		const fakeDescriptors = new FakeDescriptorStore()
		const fakeHttp = new FakeHttpProbe()
		const fakeDb = new FakeDatabaseProbe()

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toBeNull()
	})

	it('returns null when the descriptor file is invalid', async () => {
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', null)
		const fakeHttp = new FakeHttpProbe()
		const fakeDb = new FakeDatabaseProbe()

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toBeNull()
	})

	it('removes the descriptor and returns null when the engine is unhealthy', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', descriptor)
		const fakeHttp = new FakeHttpProbe()
		fakeHttp.failFor('http://localhost:3000')
		const fakeDb = new FakeDatabaseProbe()

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toBeNull()
		expect(fakeDescriptors.stored.has('/tmp/runtime.json')).toBe(false)
	})


	it('stops recorded process groups before removing an unhealthy descriptor', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			enginePid: 501,
			webPid: 502,
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', descriptor)
		const fakeHttp = new FakeHttpProbe()
		fakeHttp.failFor('http://localhost:3000')
		const fakeDb = new FakeDatabaseProbe()
		const stopSpy = vi.spyOn(processStop, 'stopRuntimeProcessGroups').mockResolvedValue()

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toBeNull()
		expect(stopSpy).toHaveBeenCalledWith({ enginePid: 501, webPid: 502 })
		expect(fakeDescriptors.stored.has('/tmp/runtime.json')).toBe(false)
	})

	it('removes the descriptor and returns null when the web is unhealthy', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', descriptor)
		const fakeHttp = new FakeHttpProbe()
		fakeHttp.failFor('http://localhost:5173')
		const fakeDb = new FakeDatabaseProbe()

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toBeNull()
		expect(fakeDescriptors.stored.has('/tmp/runtime.json')).toBe(false)
	})

	it('removes the descriptor and returns null when the database is unhealthy', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			databaseUrl: 'postgres://localhost:5432/onion',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', descriptor)
		const fakeHttp = new FakeHttpProbe()
		const fakeDb = new FakeDatabaseProbe()
		fakeDb.failFor('postgres://localhost:5432/onion')

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toBeNull()
		expect(fakeDescriptors.stored.has('/tmp/runtime.json')).toBe(false)
	})

	it('returns the descriptor when all services are healthy', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			databaseUrl: 'postgres://localhost:5432/onion',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', descriptor)
		const fakeHttp = new FakeHttpProbe()
		const fakeDb = new FakeDatabaseProbe()

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toEqual(descriptor)
	})

	it('skips the database probe when the descriptor has no database url', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const fakeDescriptors = new FakeDescriptorStore()
		fakeDescriptors.stored.set('/tmp/runtime.json', descriptor)
		const fakeHttp = new FakeHttpProbe()
		const fakeDb = new FakeDatabaseProbe()
		fakeDb.failFor('anything')

		const result = await discoverHealthyRuntime('/tmp/runtime.json', 1000, {
			http: fakeHttp,
			database: fakeDb,
			descriptors: fakeDescriptors,
		})

		expect(result).toEqual(descriptor)
	})
})

class FakeDescriptorStore implements DescriptorStore {
	stored = new Map<string, RuntimeDescriptor | null>()

	async read(path: string): Promise<RuntimeDescriptor | null> {
		return this.stored.get(path) ?? null
	}

	async write(path: string, descriptor: RuntimeDescriptor): Promise<void> {
		this.stored.set(path, descriptor)
	}

	async remove(path: string): Promise<void> {
		this.stored.delete(path)
	}

	async acquireLock(_path: string): Promise<{ release(): Promise<void> }> {
		return { release: async () => {} }
	}
}

class FakeHttpProbe implements HttpProbe {
	private failing = new Set<string>()

	failFor(url: string) {
		this.failing.add(url)
	}

	async waitForStatus(url: string, _path: string, _timeoutMs: number, _expectedStatus?: number): Promise<void> {
		if (this.failing.has(url)) {
			throw new Error(`Health check failed for ${url}`)
		}
	}
}

class FakeDatabaseProbe implements DatabaseProbe {
	private failing = new Set<string>()

	failFor(url: string) {
		this.failing.add(url)
	}

	async check(databaseUrl: string): Promise<void> {
		if (this.failing.has(databaseUrl)) {
			throw new Error(`Database check failed for ${databaseUrl}`)
		}
	}
}
