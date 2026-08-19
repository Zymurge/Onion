import { afterAll } from 'vitest'

const requiredTestEnvironment = {
	PORT: '3000',
	HOST: '127.0.0.1',
	DATABASE_URL: 'postgres://onion:onionpass@127.0.0.1:5432/onion-test',
	NODE_ENV: 'test',
	LOG_LEVEL: 'error',
	SCENARIOS_DIR: `${process.cwd()}/scenarios`,
} as const

const previousEnvironment = Object.fromEntries(
	Object.keys(requiredTestEnvironment).map((key) => [key, process.env[key]]),
)

Object.assign(process.env, requiredTestEnvironment)

afterAll(() => {
	for (const key of Object.keys(requiredTestEnvironment)) {
		const previousValue = previousEnvironment[key]
		if (previousValue === undefined) {
			delete process.env[key]
		} else {
			process.env[key] = previousValue
		}
	}
})