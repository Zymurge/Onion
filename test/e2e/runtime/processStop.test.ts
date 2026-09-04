import { describe, expect, it } from 'vitest'
import { stopProcessGroup, stopRuntimeProcessGroups } from './processStop.js'

describe('processStop', () => {
	it('ignores missing and invalid process ids', async () => {
		await expect(stopProcessGroup(undefined)).resolves.toBeUndefined()
		await expect(stopProcessGroup(-1)).resolves.toBeUndefined()
		await expect(stopProcessGroup(0)).resolves.toBeUndefined()
	})

	it('stops a live detached child process group', async () => {
		const { spawn } = await import('node:child_process')
		const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
			stdio: 'ignore',
			detached: true,
		})
		child.unref()
		expect(child.pid).toEqual(expect.any(Number))

		await stopProcessGroup(child.pid, 2_000)

		await expect(new Promise<void>((resolve, reject) => {
			try {
				process.kill(child.pid!, 0)
				reject(new Error('process still alive'))
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
					resolve()
					return
				}
				reject(error)
			}
		})).resolves.toBeUndefined()
	})

	it('stops engine and web groups together', async () => {
		const { spawn } = await import('node:child_process')
		const engine = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
		const web = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', detached: true })
		engine.unref()
		web.unref()

		await stopRuntimeProcessGroups({ enginePid: engine.pid, webPid: web.pid })

		for (const pid of [engine.pid, web.pid]) {
			await expect(new Promise<void>((resolve, reject) => {
				try {
					process.kill(pid!, 0)
					reject(new Error(`process ${pid} still alive`))
				} catch (error) {
					if ((error as NodeJS.ErrnoException).code === 'ESRCH') {
						resolve()
						return
					}
					reject(error)
				}
			})).resolves.toBeUndefined()
		}
	})
})
