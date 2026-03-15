import type { FastifyInstance } from 'fastify'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const SCENARIOS_DIR = process.env.SCENARIOS_DIR ?? join(process.cwd(), 'scenarios')

interface ScenarioSummary {
  id: string
  name: string
  description: string
}

async function loadAll(): Promise<ScenarioSummary[]> {
  const files = await readdir(SCENARIOS_DIR)
  const results: ScenarioSummary[] = []
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(SCENARIOS_DIR, file), 'utf8')
    const s = JSON.parse(raw) as ScenarioSummary
    results.push({ id: s.id, name: s.name, description: s.description })
  }
  return results
}

async function loadById(id: string): Promise<unknown | null> {
  const files = await readdir(SCENARIOS_DIR)
  for (const file of files.filter((f) => f.endsWith('.json'))) {
    const raw = await readFile(join(SCENARIOS_DIR, file), 'utf8')
    const s = JSON.parse(raw) as { id: string }
    if (s.id === id) return s
  }
  return null
}

export async function scenarioRoutes(app: FastifyInstance): Promise<void> {
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
      const scenarios = await loadAll()
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
    const scenario = await loadById(req.params.id)
    if (!scenario) {
      return reply.status(404).send({ ok: false, error: 'Scenario not found', code: 'NOT_FOUND' })
    }
    return reply.send(scenario)
  })
}
