import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { authRoutes } from './api/auth.js'
import { scenarioRoutes } from './api/scenarios.js'
import { gameRoutes } from './api/games.js'
import { getPool } from './db/client.js'
import type { DbAdapter } from './db/adapter.js'
import { InMemoryDb } from './db/memory.js'

export function buildApp(db?: DbAdapter): FastifyInstance {
  const adapter = db ?? new InMemoryDb()
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

  app.register(authRoutes, { prefix: '/auth', db: adapter })
  app.register(scenarioRoutes, { prefix: '/scenarios' })
  app.register(gameRoutes, { prefix: '/games', db: adapter })

  // Global error handler
  app.setErrorHandler((error, _req, reply) => {
    const errorCode = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : undefined

    // Payload too large
    if (errorCode === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      return reply.status(413).send({ ok: false, error: 'Payload exceeds 16KB limit', code: 'PAYLOAD_TOO_LARGE' })
    }
    // Malformed JSON
    if (errorCode === 'FST_ERR_CTP_INVALID_CONTENT_TYPE' || errorCode === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      return reply.status(400).send({ ok: false, error: 'Malformed JSON in request body', code: 'MALFORMED_JSON' })
    }
    // All other errors
    return reply.status(500).send({ ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' })
  })
  return app
}
