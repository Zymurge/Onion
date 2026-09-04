/**
 * Best-effort termination helpers for detached E2E process groups.
 *
 * The harness detaches engine/web children so they can outlive the parent when a
 * failed run intentionally preserves the runtime. Discovery must therefore be
 * able to stop those process groups later when the descriptor becomes stale.
 */

export async function stopProcessGroup(pid: number | undefined, timeoutMs = 5_000): Promise<void> {
	if (pid === undefined || !Number.isInteger(pid) || pid <= 0) {
		return
	}

	const signal = (value: NodeJS.Signals): boolean => {
		try {
			if (process.platform === 'win32') {
				process.kill(pid, value)
			} else {
				process.kill(-pid, value)
			}
			return true
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
				return false
			}
			// Fall back to the direct pid when the process is no longer a group leader.
			try {
				process.kill(pid, value)
				return true
			} catch (directError) {
				if ((directError as NodeJS.ErrnoException).code === 'ESRCH') {
					return false
				}
				throw directError
			}
		}
	}

	if (!signal('SIGTERM')) {
		return
	}

	const deadline = Date.now() + timeoutMs
	while (Date.now() < deadline) {
		try {
			process.kill(pid, 0)
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
				return
			}
			throw error
		}
		await new Promise((resolve) => setTimeout(resolve, 50))
	}

	signal('SIGKILL')
}

export async function stopRuntimeProcessGroups(input: {
	enginePid?: number
	webPid?: number
}): Promise<void> {
	await Promise.all([stopProcessGroup(input.enginePid), stopProcessGroup(input.webPid)])
}
