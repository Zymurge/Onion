import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DescriptorStoreImpl, HttpProbeImpl, PortAllocatorImpl } from './adapters.js'
import type { RuntimeDescriptor } from './types.js'
import { RUNTIME_DESCRIPTOR_VERSION } from './types.js'

describe('HttpProbeImpl', () => {
	it('resolves when the endpoint returns the expected status', async () => {
		const server = new FakeHttpServer()
		await server.waitUntilReady()
		server.respond(200)
		const probe = new HttpProbeImpl()

		await expect(probe.waitForStatus(server.url, '/health', 500, 200)).resolves.toBeUndefined()

		server.close()
	})

	it('rejects when the timeout elapses before receiving the expected status', async () => {
		const server = new FakeHttpServer()
		await server.waitUntilReady()
		server.delay(1000)
		const probe = new HttpProbeImpl()

		await expect(probe.waitForStatus(server.url, '/health', 100, 200)).rejects.toThrow(/timed out/i)

		server.close()
	})

	it('retries until the endpoint becomes healthy', async () => {
		const server = new FakeHttpServer()
		await server.waitUntilReady()
		let callCount = 0
		server.onRequest = () => {
			callCount++
			if (callCount < 3) {
				throw new Error('not ready')
			}
			return { status: 200, body: 'ok' }
		}
		const probe = new HttpProbeImpl()

		await expect(probe.waitForStatus(server.url, '/health', 1000, 200)).resolves.toBeUndefined()
		expect(callCount).toBeGreaterThanOrEqual(3)

		server.close()
	})

	it('continues retrying when the endpoint returns an unexpected status', async () => {
		const server = new FakeHttpServer()
		await server.waitUntilReady()
		let callCount = 0
		server.onRequest = () => {
			callCount++
			return { status: callCount < 3 ? 503 : 200, body: '' }
		}
		const probe = new HttpProbeImpl()

		await expect(probe.waitForStatus(server.url, '/health', 1000, 200)).resolves.toBeUndefined()
		expect(callCount).toBeGreaterThanOrEqual(3)

		server.close()
	})
})

describe('DescriptorStoreImpl', () => {
	const testDir = join(tmpdir(), `onion-e2e-test-${Date.now()}`)
	const descriptorPath = join(testDir, 'runtime.json')
	const lockPath = join(testDir, 'runtime.lock')

	afterEach(async () => {
		await fs.rm(testDir, { recursive: true, force: true })
	})

	it('returns null when the descriptor file does not exist', async () => {
		const store = new DescriptorStoreImpl()

		expect(await store.read(descriptorPath)).toBeNull()
	})

	it('returns null when the descriptor has an incompatible version', async () => {
		await fs.mkdir(testDir, { recursive: true })
		await fs.writeFile(descriptorPath, JSON.stringify({ version: 999 }), 'utf8')
		const store = new DescriptorStoreImpl()

		expect(await store.read(descriptorPath)).toBeNull()
	})

	it('returns null when the descriptor is missing required fields', async () => {
		await fs.mkdir(testDir, { recursive: true })
		await fs.writeFile(
			descriptorPath,
			JSON.stringify({
				version: RUNTIME_DESCRIPTOR_VERSION,
				pid: 1234,
				engineUrl: 'http://localhost:3000',
			}),
			'utf8',
		)
		const store = new DescriptorStoreImpl()

		expect(await store.read(descriptorPath)).toBeNull()
	})

	it('returns a valid descriptor when all required fields are present', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 1234,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3000',
			webUrl: 'http://localhost:5173',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		await fs.mkdir(testDir, { recursive: true })
		await fs.writeFile(descriptorPath, JSON.stringify(descriptor), 'utf8')
		const store = new DescriptorStoreImpl()

		expect(await store.read(descriptorPath)).toEqual(descriptor)
	})

	it('writes a descriptor to the given path', async () => {
		const descriptor: RuntimeDescriptor = {
			version: RUNTIME_DESCRIPTOR_VERSION,
			pid: 5678,
			startedAt: new Date().toISOString(),
			engineUrl: 'http://localhost:3001',
			webUrl: 'http://localhost:5174',
			databaseUrl: 'postgres://localhost:5432/test',
			logDir: '/tmp/logs',
			artifactFile: '/tmp/artifacts.json',
		}
		const store = new DescriptorStoreImpl()

		await store.write(descriptorPath, descriptor)

		const written = await store.read(descriptorPath)
		expect(written).toEqual(descriptor)
	})

	it('removes a descriptor file', async () => {
		await fs.mkdir(testDir, { recursive: true })
		await fs.writeFile(descriptorPath, '{}', 'utf8')
		const store = new DescriptorStoreImpl()

		await store.remove(descriptorPath)

		expect(await store.read(descriptorPath)).toBeNull()
	})

	it('acquires a lock exclusively', async () => {
		const store = new DescriptorStoreImpl()
		const lock1 = await store.acquireLock(lockPath)

		await expect(store.acquireLock(lockPath)).rejects.toThrow(/lock already held/i)

		await lock1.release()
	})

	it('allows acquiring a lock after it has been released', async () => {
		const store = new DescriptorStoreImpl()
		const lock1 = await store.acquireLock(lockPath)
		await lock1.release()

		const lock2 = await store.acquireLock(lockPath)
		await lock2.release()
	})
})

describe('PortAllocatorImpl', () => {
	it('allocates a free local port', async () => {
		const allocator = new PortAllocatorImpl()

		const port = await allocator.allocate()

		expect(port).toBeGreaterThan(0)
		expect(port).toBeLessThan(65536)
	})

	it('allocates different ports on successive calls', async () => {
		const allocator = new PortAllocatorImpl()

		const port1 = await allocator.allocate()
		const port2 = await allocator.allocate()

		expect(port1).not.toBe(port2)
	})
})

class FakeHttpServer {
	url!: string
	private server: import('node:http').Server
	private delayMs = 0
	private ready: Promise<void>
	onRequest: (() => { status: number; body: string }) | null = null

	constructor() {
		this.ready = import('node:http').then((http) =>
			new Promise<void>((resolve) => {
				this.server = http.createServer((req: any, res: any) => {
					setTimeout(() => {
						try {
							const result = this.onRequest ? this.onRequest() : { status: 200, body: 'ok' }
							res.writeHead(result.status)
							res.end(result.body)
						} catch {
							res.writeHead(500)
							res.end('error')
						}
					}, this.delayMs)
				})

				this.server.listen(0, '127.0.0.1', () => {
					const address = this.server.address() as import('node:net').AddressInfo
					this.url = `http://127.0.0.1:${address.port}`
					resolve()
				})
			}),
		)
	}

	async waitUntilReady() {
		await this.ready
	}

	respond(status: number, body = 'ok') {
		this.onRequest = () => ({ status, body })
	}

	delay(ms: number) {
		this.delayMs = ms
	}

	close() {
		this.server.close()
	}
}
