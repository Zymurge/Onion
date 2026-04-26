import { afterAll } from 'vitest'

const previousLogLevel = process.env.LOG_LEVEL
process.env.LOG_LEVEL = 'error'

afterAll(() => {
	if (previousLogLevel === undefined) {
		delete process.env.LOG_LEVEL
		return
	}

	process.env.LOG_LEVEL = previousLogLevel
})