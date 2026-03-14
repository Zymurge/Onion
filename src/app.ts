import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { authRoutes } from './api/auth.js'
import { scenarioRoutes } from './api/scenarios.js'
import { gameRoutes } from './api/games.js'

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  app.get('/health', async () => ({ ok: true }))

  app.register(authRoutes, { prefix: '/auth' })
  app.register(scenarioRoutes, { prefix: '/scenarios' })
  app.register(gameRoutes, { prefix: '/games' })

  return app
}
