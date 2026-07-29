import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { register } from './helpers.js'

let scenarioDir: string | undefined

afterEach(async () => {
  vi.unstubAllEnvs()
  vi.resetModules()

  if (scenarioDir !== undefined) {
    await rm(scenarioDir, { recursive: true, force: true })
    scenarioDir = undefined
  }
})

describe('POST /games scenario validation', () => {
  it('rejects a scenario without initialState instead of creating a fallback game', async () => {
    scenarioDir = await mkdtemp(join(tmpdir(), 'onion-invalid-scenario-'))
    await writeFile(join(scenarioDir, 'missing-initial-state.json'), JSON.stringify({
      id: 'missing-initial-state',
      name: 'Missing Initial State',
      description: 'This scenario is intentionally invalid.',
      map: { radius: 1, hexes: [] },
      victoryConditions: {},
    }))

    vi.stubEnv('SCENARIOS_DIR', scenarioDir)
    vi.resetModules()
    const { resolveScenariosDir } = await import('#server/api/scenarioPaths')
    expect(resolveScenariosDir()).toBe(scenarioDir)
    const { buildApp } = await import('#server/app')
    const createMatch = vi.fn()
    const app = buildApp({ createMatch })
    const { token } = await register(app, 'shrek')

    const response = await app.inject({
      method: 'POST',
      url: '/games',
      headers: { authorization: `Bearer ${token}` },
      payload: { scenarioId: 'missing-initial-state', role: 'onion' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ code: 'INVALID_SCENARIO' })
    expect(createMatch).not.toHaveBeenCalled()
    await app.close()
  })
})