import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { cleanupRegisteredArtifacts } from './artifactCleanup.js'
import { createEmptyArtifactManifest, writeArtifactManifest } from './artifactRegistry.js'
import { discoverHealthyRuntime } from './discovery.js'
import {
	RUNTIME_DESCRIPTOR_VERSION,
	type DatabaseContainerHandle,
	type ProcessHandle,
	type ResolvedRuntime,
	type ResolvedRuntimeOptions,
	type RuntimeAdapters,
	type RuntimeDescriptor,
} from './types.js'

type RuntimeSession = {
	runtime: ResolvedRuntime
	teardown(success: boolean): Promise<void>
}

type SupervisorDependencies = {
	adapters: RuntimeAdapters
	pid?: number
	now?: () => Date
}

function runtimePaths(runtimeFile: string, now: Date): { logDir: string; artifactFile: string } {
	const runtimeDir = dirname(runtimeFile)
	const runId = now.toISOString().replace(/[:.]/g, '-')
	const logDir = join(runtimeDir, 'logs', runId)
	return {
		logDir,
		artifactFile: join(logDir, 'artifacts.json'),
	}
}

function diagnosticMessage(runtime: ResolvedRuntime, runtimeFile: string, reason: unknown): string {
	const detail = reason instanceof Error ? reason.message : String(reason)
	return [
		'E2E runtime setup failed.',
		`Reason: ${detail}`,
		`Runtime descriptor: ${runtimeFile}`,
		`Log directory: ${runtime.logDir}`,
		`Artifact manifest: ${runtime.artifactFile}`,
		`Playwright report: ${join(runtime.logDir, 'playwright', 'report')}`,
		`Playwright failure output: ${join(runtime.logDir, 'playwright', 'test-results')}`,
		`Engine URL: ${runtime.engineUrl}`,
		`Web URL: ${runtime.webUrl}`,
		`Database URL: ${runtime.databaseUrl ?? '(not attached)'}`,
	].join('\n')
}

/**
 * Resolves, starts, and tears down a browser-test runtime according to component ownership.
 */
export async function startRuntimeSupervisor(
	options: ResolvedRuntimeOptions,
	dependencies: SupervisorDependencies,
): Promise<RuntimeSession> {
	const { adapters, now = () => new Date(), pid = process.pid } = dependencies
	let reusable: RuntimeDescriptor | null = null

	if (options.reuseRuntime) {
		reusable = await discoverHealthyRuntime(options.runtimeFile, options.startupTimeoutMs, adapters)
	}

	const lock = await adapters.descriptors.acquireLock(`${options.runtimeFile}.lock`)
	let database: DatabaseContainerHandle | undefined
	let engine: ProcessHandle | undefined
	let web: ProcessHandle | undefined
	let runtime: ResolvedRuntime | undefined
	let paths: ReturnType<typeof runtimePaths> | undefined

	try {
		if (!reusable && options.reuseRuntime) {
			reusable = await discoverHealthyRuntime(options.runtimeFile, options.startupTimeoutMs, adapters)
		}

		paths = runtimePaths(options.runtimeFile, now())
		await mkdir(paths.logDir, { recursive: true })
		await writeArtifactManifest(paths.artifactFile, createEmptyArtifactManifest())

		let databaseUrl = options.databaseUrl ?? reusable?.databaseUrl
		const ownership: ResolvedRuntime['ownership'] = {
			database: options.databaseUrl ? 'external' : reusable?.databaseUrl ? 'reused' : 'owned',
			engine: options.engineUrl ? 'external' : reusable?.engineUrl ? 'reused' : 'owned',
			web: options.webUrl ? 'external' : reusable?.webUrl ? 'reused' : 'owned',
		}

		let engineUrl = options.engineUrl ?? reusable?.engineUrl
		if (!engineUrl) {
			if (!databaseUrl) {
				database = await adapters.databaseContainer.start()
				databaseUrl = database.connectionUri
			}
			const port = await adapters.ports.allocate()
			engineUrl = `http://127.0.0.1:${port}`
			engine = adapters.processes.spawn({
				command: 'pnpm',
				args: ['exec', 'tsx', 'server/index.ts'],
				env: { ...process.env, DATABASE_URL: databaseUrl, HOST: '127.0.0.1', PORT: String(port) },
				logPath: join(paths.logDir, 'engine.log'),
			})
			await adapters.http.waitForStatus(engineUrl, '/health/ready', options.startupTimeoutMs)
		}

		let webUrl = options.webUrl ?? reusable?.webUrl
		if (!webUrl) {
			const port = await adapters.ports.allocate()
			webUrl = `http://127.0.0.1:${port}`
			web = adapters.processes.spawn({
				command: 'pnpm',
				args: ['--dir', 'web', 'dev', '--host', '127.0.0.1', '--port', String(port)],
				env: { ...process.env, VITE_ONION_API_URL: engineUrl },
				logPath: join(paths.logDir, 'web.log'),
			})
			await adapters.http.waitForStatus(webUrl, '/', options.startupTimeoutMs)
		}

		runtime = { engineUrl, webUrl, databaseUrl, logDir: paths.logDir, artifactFile: paths.artifactFile, ownership }
		if (ownership.engine === 'owned' || ownership.web === 'owned' || ownership.database === 'owned') {
			await adapters.descriptors.write(options.runtimeFile, {
				version: RUNTIME_DESCRIPTOR_VERSION,
				pid,
				startedAt: now().toISOString(),
				engineUrl,
				webUrl,
				databaseUrl,
				databaseContainerId: database?.containerId,
				logDir: paths.logDir,
				artifactFile: paths.artifactFile,
			})
		}
	} catch (error) {
		const diagnosticPaths = paths ?? runtimePaths(options.runtimeFile, now())
		const failedRuntime: ResolvedRuntime = runtime ?? {
			engineUrl: options.engineUrl ?? reusable?.engineUrl ?? '(starting)',
			webUrl: options.webUrl ?? reusable?.webUrl ?? '(starting)',
			databaseUrl: options.databaseUrl ?? reusable?.databaseUrl,
			logDir: diagnosticPaths.logDir,
			artifactFile: diagnosticPaths.artifactFile,
			ownership: { database: 'owned', engine: 'owned', web: 'owned' },
		}

		try {
			await adapters.descriptors.write(options.runtimeFile, {
				version: RUNTIME_DESCRIPTOR_VERSION,
				pid,
				startedAt: now().toISOString(),
				engineUrl: failedRuntime.engineUrl,
				webUrl: failedRuntime.webUrl,
				databaseUrl: failedRuntime.databaseUrl,
				logDir: failedRuntime.logDir,
				artifactFile: failedRuntime.artifactFile,
			})
		} catch {
			// Keep the setup failure as the actionable error if diagnostic persistence fails too.
		}

		if (!options.keepRuntimeOnFailure) {
			if (failedRuntime.databaseUrl) {
				await cleanupRegisteredArtifacts(failedRuntime.artifactFile, failedRuntime.databaseUrl, adapters.artifactCleanup)
			}
			await Promise.allSettled([web?.stop(), engine?.stop(), database?.stop()])
			try {
				await adapters.descriptors.remove(options.runtimeFile)
			} catch {
				// Keep the setup failure as the actionable error if cleanup persistence fails too.
			}
		}

		throw new Error(diagnosticMessage(failedRuntime, options.runtimeFile, error))
	} finally {
		await lock.release()
	}

	if (!runtime) {
		throw new Error('E2E runtime setup did not produce a runtime.')
	}

	return {
		runtime,
		async teardown(success: boolean): Promise<void> {
			if (!success && options.keepRuntimeOnFailure) {
				return
			}

			if (runtime.databaseUrl) {
				const cleanup = await cleanupRegisteredArtifacts(runtime.artifactFile, runtime.databaseUrl, adapters.artifactCleanup)
				if (cleanup.errors.length > 0) {
					console.error(`E2E artifact cleanup reported errors (test result unaffected):\n${cleanup.errors.join('\n')}`)
				}
			}

			await Promise.all([web?.stop(), engine?.stop(), database?.stop()])
			if (runtime.ownership.engine === 'owned' || runtime.ownership.web === 'owned' || runtime.ownership.database === 'owned') {
				await adapters.descriptors.remove(options.runtimeFile)
			}
		},
	}
}