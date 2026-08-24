import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '#server/app'
import { loadConfig } from '#server/config/loadConfig'

const temporaryDirectories: string[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('configuration consumers', () => {
  it('uses the configured scenario directory for scenario routes', async () => {
    const scenarioDir = await mkdtemp(join(process.cwd(), '.tmp-onion-config-'))
    temporaryDirectories.push(scenarioDir)
    await writeFile(join(scenarioDir, 'configured-scenario.json'), JSON.stringify({
      id: 'configured-scenario',
      name: 'Configured Scenario',
      description: 'Loaded from the configured directory.',
    }))

    const config = loadConfig({ ...process.env, SCENARIOS_DIR: scenarioDir })
    const app = buildApp(undefined, { config })
    const response = await app.inject({ method: 'GET', url: '/scenarios' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([{
      id: 'configured-scenario',
      name: 'Configured Scenario',
      displayName: 'Configured Scenario',
      description: 'Loaded from the configured directory.',
    }])
    await app.close()
  })

  it('uses the configured log level when initializing the server logger', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()

    const { getLoggerLevel } = await import('#server/logger')

    expect(getLoggerLevel()).toBe('debug')
  })
   
  it('uses the configured log level for Fastify request logging', async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'development', LOG_LEVEL: 'debug' })
    const app = buildApp(undefined, { config })

    expect(app.log.level).toBe('debug')
    await app.close()
  })

  it('registers JWT with the configured signing secret', async () => {
    const config = loadConfig({ ...process.env, JWT_SECRET: 'test-jwt-secret-that-is-long-enough' })
    const app = buildApp(undefined, { config })
    await app.ready()
    const token = app.jwt.sign({ sub: 'user-1' })
    const payload = await app.jwt.verify<{ sub: string }>(token)

    expect(payload.sub).toBe('user-1')
    await app.close()
  })
})
