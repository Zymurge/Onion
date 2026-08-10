import { createPlaywrightRuntimeEnvironment } from './playwrightEnvironment.js'
import type { ResolvedRuntime } from './types.js'

export type PlaywrightRunner = (environment: NodeJS.ProcessEnv) => Promise<number>

type LifecycleInput = {
	runtime: ResolvedRuntime
	runtimeFile: string
	teardown(success: boolean): Promise<void>
	run: PlaywrightRunner
	parentEnvironment?: NodeJS.ProcessEnv
}

/** Runs Playwright and finalizes the supervisor exactly once with its outcome. */
export async function runPlaywrightLifecycle(input: LifecycleInput): Promise<number> {
	let success = false
	try {
		const exitCode = await input.run(
			createPlaywrightRuntimeEnvironment(input.runtime, input.runtimeFile, input.parentEnvironment),
		)
		success = exitCode === 0
		return exitCode
	} finally {
		await input.teardown(success)
	}
}