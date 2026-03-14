import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { authRoutes } from './api/auth.js'
import { scenarioRoutes } from './api/scenarios.js'
import { gameRoutes } from './api/games.js'
import { getPool } from './db/client.js'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  app.get('/health', async () => ({ ok: true }))

  app.get('/health/ready', async (_req, reply) => {
    try {
      await getPool().query('SELECT 1')
      return reply.send({ ok: true, db: 'connected' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return reply.status(503).send({ ok: false, db: 'unavailable', error: message })
    }
  })

  app.register(authRoutes, { prefix: '/auth' })
  app.register(scenarioRoutes, { prefix: '/scenarios' })
  app.register(gameRoutes, { prefix: '/games' })

  return app
}
