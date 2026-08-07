/**
 * Disposable runtime startup: PostgreSQL, engine, and Vite process launchers.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir, open } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { readFile } from 'node:fs/promises'
import pg from 'pg'
import type {
	ProcessHandle,
	ProcessLauncher,
	DatabaseContainerHandle,
	DatabaseContainerLauncher,
} from './types.js'

const { Pool } = pg

const MIGRATION_PATH = join(process.cwd(), 'server/db/migrations/001_initial.sql')

/**
 * Spawns child processes with stdout/stderr redirected to a log file.
 * Stop sends SIGTERM, waits 5s, then SIGKILL if still running.
 */
export class ProcessLauncherImpl implements ProcessLauncher {
	spawn(input: { command: string; args: string[]; env: NodeJS.ProcessEnv; logPath: string }): ProcessHandle {
		const { command, args, env, logPath } = input
		let child: ChildProcess | null = null
		let logFileHandle: Awaited<ReturnType<typeof open>> | null = null

		const startProcess = async () => {
			await mkdir(dirname(logPath), { recursive: true })
			logFileHandle = await open(logPath, 'w')

			child = spawn(command, args, {
				env,
				stdio: ['ignore', logFileHandle.fd, logFileHandle.fd],
				detached: false,
			})

			child.on('error', (error) => {
				logFileHandle?.write(`Process error: ${error.message}\n`)
			})

			child.on('exit', (code, signal) => {
				logFileHandle?.write(`Process exited with code ${code}, signal ${signal}\n`)
				logFileHandle?.close()
			})
		}

		// Start asynchronously but don't block spawn() return
		void startProcess()

		return {
			async stop(): Promise<void> {
				if (!child || child.exitCode !== null) {
					await logFileHandle?.close()
					return
				}

				// Try graceful shutdown first
				child.kill('SIGTERM')

				// Wait up to 5s for graceful exit
				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						if (child && child.exitCode === null) {
							child.kill('SIGKILL')
						}
						resolve()
					}, 5000)

					child?.once('exit', () => {
						clearTimeout(timeout)
						resolve()
					})
				})

				await logFileHandle?.close()
			},
		}
	}
}

/**
 * Starts a disposable PostgreSQL container and applies the initial migration.
 */
export class DatabaseContainerLauncherImpl implements DatabaseContainerLauncher {
	async start(): Promise<DatabaseContainerHandle> {
		const container = await new PostgreSqlContainer('postgres:16-alpine').start()
		const connectionUri = container.getConnectionUri()
		const containerId = container.getId()

		// Apply migration
		const pool = new Pool({ connectionString: connectionUri })
		try {
			const sql = await readFile(MIGRATION_PATH, 'utf8')
			await pool.query(sql)
		} finally {
			await pool.end()
		}

		return {
			connectionUri,
			containerId,
			async stop(): Promise<void> {
				await container.stop()
			},
		}
	}
}
