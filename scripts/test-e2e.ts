import { spawn, type ChildProcess } from 'node:child_process'
import { resolveRuntimeOptions } from '../test/e2e/runtime/config.js'
import { DatabaseProbeImpl, DescriptorStoreImpl, HttpProbeImpl, PortAllocatorImpl, PostgresArtifactCleanupDatabaseFactory } from '../test/e2e/runtime/adapters.js'
import { DatabaseContainerLauncherImpl, ProcessLauncherImpl } from '../test/e2e/runtime/startup.js'
import { startRuntimeSupervisor } from '../test/e2e/runtime/supervisor.js'
import { runPlaywrightLifecycle } from '../test/e2e/runtime/playwrightLifecycle.js'
import { getPlaywrightDiagnosticPaths } from '../test/e2e/runtime/playwrightDiagnostics.js'

type BrowserRun = {
	result: Promise<number>
	forwardSignal(signal: NodeJS.Signals): void
}

function exitCodeForSignal(signal: NodeJS.Signals): number {
	return signal === 'SIGINT' ? 130 : 143
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): BrowserRun {
	let child: ChildProcess
	const result = new Promise<number>((resolve, reject) => {
		child = spawn(command, args, { stdio: 'inherit', env })
		child.once('error', reject)
		child.once('exit', (code, signal) => {
			if (code === 0) {
				resolve(0)
				return
			}
			resolve(code ?? (signal ? exitCodeForSignal(signal) : 1))
		})
	})

	return {
		result,
		forwardSignal(signal: NodeJS.Signals): void {
			if (child.exitCode === null && !child.killed) {
				child.kill(signal)
			}
		},
	}
}

async function main(): Promise<void> {
	process.env.E2E_RAM_ROLLS ??= '1'
	process.env.E2E_RAM_ROLLS_BY_SCENARIO ??= 'e2e-failed-ram-01=6'
	const options = resolveRuntimeOptions()
	const session = await startRuntimeSupervisor(options, {
		adapters: {
			http: new HttpProbeImpl(),
			database: new DatabaseProbeImpl(),
			processes: new ProcessLauncherImpl(),
			databaseContainer: new DatabaseContainerLauncherImpl(),
			descriptors: new DescriptorStoreImpl(),
			ports: new PortAllocatorImpl(),
			artifactCleanup: new PostgresArtifactCleanupDatabaseFactory(),
		},
	})

	console.log(`E2E runtime ready\nEngine: ${session.runtime.engineUrl}\nWeb: ${session.runtime.webUrl}\nLogs: ${session.runtime.logDir}\nArtifacts: ${session.runtime.artifactFile}`)
	const diagnostics = getPlaywrightDiagnosticPaths(session.runtime.logDir)

	let interruptedBy: NodeJS.Signals | undefined
	let browser: BrowserRun | undefined
	const forwardSignal = (signal: NodeJS.Signals) => {
		interruptedBy ??= signal
		browser?.forwardSignal(signal)
	}
	process.once('SIGINT', forwardSignal)
	process.once('SIGTERM', forwardSignal)
	try {
		const exitCode = await runPlaywrightLifecycle({
			runtime: session.runtime,
			runtimeFile: options.runtimeFile,
			teardown: session.teardown,
			run: async (environment) => {
				browser = run('pnpm', ['exec', 'playwright', 'test'], environment)
				return browser.result
			},
		})
		if (exitCode !== 0) {
			process.exitCode = interruptedBy ? exitCodeForSignal(interruptedBy) : exitCode
			console.error(
				`E2E run failed; owned runtime preserved.\nRuntime descriptor: ${options.runtimeFile}\nLogs: ${session.runtime.logDir}\nArtifacts: ${session.runtime.artifactFile}\nPlaywright report: ${diagnostics.reportDir}\nPlaywright failure output: ${diagnostics.outputDir}`,
			)
		}
	} catch (error) {
		console.error(
			`E2E runner could not complete; owned runtime preserved.\nRuntime descriptor: ${options.runtimeFile}\nLogs: ${session.runtime.logDir}\nArtifacts: ${session.runtime.artifactFile}\nPlaywright report: ${diagnostics.reportDir}\nPlaywright failure output: ${diagnostics.outputDir}`,
		)
		throw error
	} finally {
		process.removeListener('SIGINT', forwardSignal)
		process.removeListener('SIGTERM', forwardSignal)
	}
}

process.env.E2E_RAM_ROLLS ??= '1'
process.env.E2E_RAM_ROLLS_BY_SCENARIO ??= 'e2e-failed-ram-01=6'
process.env.E2E_COMBAT_ROLLS ??= '6'

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 1
})
