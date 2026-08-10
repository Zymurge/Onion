import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { Pool } from 'pg'
import type {
	ArtifactCleanupDatabase,
	ArtifactCleanupDatabaseFactory,
	DatabaseProbe,
	DescriptorStore,
	HttpProbe,
	PortAllocator,
	RuntimeDescriptor,
} from './types.js'
import { RUNTIME_DESCRIPTOR_VERSION } from './types.js'

export class HttpProbeImpl implements HttpProbe {
	async waitForStatus(url: string, path: string, timeoutMs: number, expectedStatus = 200): Promise<void> {
		const deadline = Date.now() + timeoutMs
		const normalizedUrl = url.replace(/\/+$/, '')
		let lastError = 'no response'

		while (Date.now() < deadline) {
			const remainingMs = deadline - Date.now()
			if (remainingMs <= 0) {
				break
			}

			try {
				const controller = new AbortController()
				const timeoutId = setTimeout(() => controller.abort(), Math.min(remainingMs, 2000))

				try {
					const response = await fetch(`${normalizedUrl}${path}`, { signal: controller.signal })
					clearTimeout(timeoutId)

					if (response.status === expectedStatus) {
						return
					}
					lastError = `HTTP ${response.status}`
				} catch (error) {
					clearTimeout(timeoutId)
					if ((error as Error).name === 'AbortError') {
						lastError = 'request timeout'
					} else {
						lastError = error instanceof Error ? error.message : String(error)
					}
				}
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error)
			}

			await new Promise((resolve) => setTimeout(resolve, Math.min(250, deadline - Date.now())))
		}

		throw new Error(`Timed out waiting for ${normalizedUrl}${path} (expected ${expectedStatus}): ${lastError}`)
	}
}

export class DatabaseProbeImpl implements DatabaseProbe {
	async check(databaseUrl: string): Promise<void> {
		const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 })
		try {
			await pool.query('SELECT 1')
		} finally {
			await pool.end()
		}
	}
}

/** Deletes only the rows a run registered; matches go first so game_state/game_events cascade before users are freed. */
export class PostgresArtifactCleanupDatabaseFactory implements ArtifactCleanupDatabaseFactory {
	create(databaseUrl: string): ArtifactCleanupDatabase {
		const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000 })
		return {
			async deleteMatches(gameIds: number[]): Promise<void> {
				await pool.query('DELETE FROM matches WHERE id = ANY($1::int[])', [gameIds])
			},
			async deleteUsers(userIds: string[]): Promise<void> {
				await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [userIds])
			},
			async close(): Promise<void> {
				await pool.end()
			},
		}
	}
}

export class DescriptorStoreImpl implements DescriptorStore {
	async read(path: string): Promise<RuntimeDescriptor | null> {
		try {
			const content = await fs.readFile(path, 'utf8')
			const parsed = JSON.parse(content) as Partial<RuntimeDescriptor>

			if (
				parsed.version !== RUNTIME_DESCRIPTOR_VERSION ||
				typeof parsed.pid !== 'number' ||
				typeof parsed.startedAt !== 'string' ||
				typeof parsed.engineUrl !== 'string' ||
				typeof parsed.webUrl !== 'string' ||
				typeof parsed.logDir !== 'string' ||
				typeof parsed.artifactFile !== 'string'
			) {
				return null
			}

			return parsed as RuntimeDescriptor
		} catch {
			return null
		}
	}

	async write(path: string, descriptor: RuntimeDescriptor): Promise<void> {
		await fs.mkdir(dirname(path), { recursive: true })
		await fs.writeFile(path, JSON.stringify(descriptor, null, 2) + '\n', 'utf8')
	}

	async remove(path: string): Promise<void> {
		await fs.rm(path, { force: true })
	}

	async acquireLock(path: string): Promise<{ release(): Promise<void> }> {
		await fs.mkdir(dirname(path), { recursive: true })
		let handle: fs.FileHandle | undefined

		try {
			handle = await fs.open(path, 'wx')
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
				throw new Error(`Lock already held at ${path}`)
			}
			throw error
		}

		return {
			release: async () => {
				await handle?.close()
				await fs.rm(path, { force: true })
			},
		}
	}
}

export class PortAllocatorImpl implements PortAllocator {
	async allocate(): Promise<number> {
		const net = await import('node:net')
		const server = net.createServer()

		await new Promise<void>((resolve, reject) => {
			server.once('error', reject)
			server.listen(0, '127.0.0.1', () => resolve())
		})

		const address = server.address()
		await new Promise<void>((resolve) => server.close(() => resolve()))

		if (!address || typeof address === 'string') {
			throw new Error('Could not allocate a local port')
		}

		return address.port
	}
}
