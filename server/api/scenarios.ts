import type { FastifyPluginAsync } from 'fastify'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { materializeScenarioMap, type AuthoredScenarioMap } from '#shared/scenarioMap'

interface ScenarioSummary {
  id: string
  name: string
  displayName: string
  description: string
}

async function loadAll(scenariosDir: string): Promise<ScenarioSummary[]> {
  const files = await readdir(scenariosDir)
  const results: ScenarioSummary[] = []
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(scenariosDir, file), 'utf8')
    const s = JSON.parse(raw) as ScenarioSummary & { displayName?: string }
    results.push({
      id: s.id,
      name: s.name,
      displayName: s.displayName ?? s.name,
      description: s.description,
    })
  }
  return results
}

async function loadById(id: string, scenariosDir: string): Promise<unknown | null> {
  const files = await readdir(scenariosDir)
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(scenariosDir, file), 'utf8')
    const s = JSON.parse(raw) as { id: string; name: string; displayName?: string; map: AuthoredScenarioMap }
    if (s.id === id) {
      return {
        ...s,
        map: materializeScenarioMap(s.map),
        displayName: s.displayName ?? s.name,
      }
    }
  }
  return null
}

export const scenarioRoutes: FastifyPluginAsync<{ scenariosDir: string }> = async (app, { scenariosDir }) => {
  /**
   * List all scenarios.
   *
   * @route GET /scenarios
   * @returns { ScenarioSummary[] } - 200 on success
   * @returns { ok: false, error: string, code: string } - 413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.get('/', async (_req, reply) => {
    try {
      const scenarios = await loadAll(scenariosDir)
      return reply.send(scenarios)
    } catch {
      return reply.send([])
    }
  })

  /**
   * Get a scenario by ID.
   *
   * @route GET /scenarios/:id
   * @returns { Scenario } - 200 on success
   * @returns { ok: false, error: string, code: string } - 404 NOT_FOUND if scenario does not exist
   *                                            413 PAYLOAD_TOO_LARGE if payload exceeds 16KB
   *                                            400 MALFORMED_JSON if request body is not valid JSON
   *                                            500 INTERNAL_ERROR for unexpected backend errors
   */
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const scenario = await loadById(req.params.id, scenariosDir)
    if (!scenario) {
      return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
    }
    return reply.send(scenario)
  })
}
