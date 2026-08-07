import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest'
import { ProcessLauncherImpl, DatabaseContainerLauncherImpl } from './startup.js'
import { readFile, rm, access } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import pg from 'pg'

const { Pool } = pg

describe('ProcessLauncherImpl', () => {
	const launcher = new ProcessLauncherImpl()
	const handles: Array<{ stop(): Promise<void> }> = []

	afterEach(async () => {
		for (const handle of handles) {
			await handle.stop()
		}
		handles.length = 0
	})

	it('spawns a process and redirects output to log file', async () => {
		const logPath = join(tmpdir(), `e2e-test-${Date.now()}-output.log`)
		const handle = launcher.spawn({
			command: 'node',
			args: ['-e', 'console.log("test output"); console.error("test error")'],
			env: { ...process.env },
			logPath,
		})
		handles.push(handle)

		// Wait for process to complete
		await new Promise((resolve) => setTimeout(resolve, 500))

		const logContent = await readFile(logPath, 'utf8')
		expect(logContent).toContain('test output')
		expect(logContent).toContain('test error')

		await rm(logPath, { force: true })
	})

	it('passes environment variables to spawned process', async () => {
		const logPath = join(tmpdir(), `e2e-test-${Date.now()}-env.log`)
		const handle = launcher.spawn({
			command: 'node',
			args: ['-e', 'console.log(process.env.CUSTOM_VAR)'],
			env: { ...process.env, CUSTOM_VAR: 'custom-value' },
			logPath,
		})
		handles.push(handle)

		await new Promise((resolve) => setTimeout(resolve, 500))

		const logContent = await readFile(logPath, 'utf8')
		expect(logContent).toContain('custom-value')

		await rm(logPath, { force: true })
	})

	it('creates log directory if it does not exist', async () => {
		const logDir = join(tmpdir(), `e2e-test-${Date.now()}-nested`)
		const logPath = join(logDir, 'subdir', 'output.log')
		const handle = launcher.spawn({
			command: 'node',
			args: ['-e', 'console.log("nested")'],
			env: { ...process.env },
			logPath,
		})
		handles.push(handle)

		await new Promise((resolve) => setTimeout(resolve, 500))

		await expect(access(logPath)).resolves.toBeUndefined()
		const logContent = await readFile(logPath, 'utf8')
		expect(logContent).toContain('nested')

		await rm(logDir, { recursive: true, force: true })
	})

	it('stop terminates a long-running process', async () => {
		const logPath = join(tmpdir(), `e2e-test-${Date.now()}-sleep.log`)
		const handle = launcher.spawn({
			command: 'node',
			args: ['-e', 'setInterval(() => console.log("tick"), 100)'],
			env: { ...process.env },
			logPath,
		})
		handles.push(handle)

		// Let it run briefly
		await new Promise((resolve) => setTimeout(resolve, 300))

		const stopStart = Date.now()
		await handle.stop()
		const stopDuration = Date.now() - stopStart

		// Should stop quickly (well under 5s SIGKILL timeout)
		expect(stopDuration).toBeLessThan(2000)

		await rm(logPath, { force: true })
	})

	it('stop is safe when process already exited', async () => {
		const logPath = join(tmpdir(), `e2e-test-${Date.now()}-exit.log`)
		const handle = launcher.spawn({
			command: 'node',
			args: ['-e', 'console.log("done")'],
			env: { ...process.env },
			logPath,
		})
		handles.push(handle)

		// Wait for natural exit
		await new Promise((resolve) => setTimeout(resolve, 500))

		// Should not throw
		await expect(handle.stop()).resolves.toBeUndefined()

		await rm(logPath, { force: true })
	})
})

describe('DatabaseContainerLauncherImpl', () => {
	const launcher = new DatabaseContainerLauncherImpl()
	let handle: Awaited<ReturnType<typeof launcher.start>> | null = null

	afterAll(async () => {
		if (handle) {
			await handle.stop()
		}
	})

	it('starts a PostgreSQL container and applies migration', async () => {
		handle = await launcher.start()

		expect(handle.connectionUri).toMatch(/^postgres(ql)?:/)
		expect(handle.containerId).toBeTruthy()

		// Verify migration was applied by checking table existence
		const pool = new Pool({ connectionString: handle.connectionUri })
		try {
			const result = await pool.query(
				"SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
			)
			const tableNames = result.rows.map((row) => row.table_name)
			expect(tableNames).toContain('users')
			expect(tableNames).toContain('matches')
			expect(tableNames).toContain('game_state')
			expect(tableNames).toContain('game_events')
		} finally {
			await pool.end()
		}
	}, 60_000)

	it('stop terminates the container', async () => {
		// Container already started in previous test
		expect(handle).toBeTruthy()
		if (!handle) return

		await handle.stop()

		// Verify connection is no longer valid
		const pool = new Pool({ connectionString: handle.connectionUri })
		await expect(pool.query('SELECT 1')).rejects.toThrow()
		await pool.end()

		handle = null
	}, 30_000)
})
