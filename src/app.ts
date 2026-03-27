import Fastify from 'fastify'
import type { FastifyInstance } from 'fastify'
import { authRoutes } from './api/auth.js'
import { scenarioRoutes } from './api/scenarios.js'
import { gameRoutes } from './api/games.js'
import { getPool } from './db/client.js'
import type { DbAdapter } from './db/adapter.js'
import { InMemoryDb } from './db/memory.js'

function resolveAdapter(db?: Partial<DbAdapter>): DbAdapter {
  const fallback = new InMemoryDb()

  return {
    findUserByUsername: db?.findUserByUsername?.bind(db) ?? fallback.findUserByUsername.bind(fallback),
    createUser: db?.createUser?.bind(db) ?? fallback.createUser.bind(fallback),
    createMatch: db?.createMatch?.bind(db) ?? fallback.createMatch.bind(fallback),
    findMatch: db?.findMatch?.bind(db) ?? fallback.findMatch.bind(fallback),
    listMatchesByUserId: db?.listMatchesByUserId?.bind(db) ?? fallback.listMatchesByUserId.bind(fallback),
    updateMatchPlayers: db?.updateMatchPlayers?.bind(db) ?? fallback.updateMatchPlayers.bind(fallback),
    updateMatchState: db?.updateMatchState?.bind(db) ?? fallback.updateMatchState.bind(fallback),
    persistMatchProgress: db?.persistMatchProgress?.bind(db) ?? fallback.persistMatchProgress.bind(fallback),
    appendEvents: db?.appendEvents?.bind(db) ?? fallback.appendEvents.bind(fallback),
    getEvents: db?.getEvents?.bind(db) ?? fallback.getEvents.bind(fallback),
  }
}

export function buildApp(db?: Partial<DbAdapter>): FastifyInstance {
  const adapter = resolveAdapter(db)
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })

  const corsHeaders = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-max-age': '86400',
  }

  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') {
      reply.headers(corsHeaders)
      return reply.status(204).send()
    }
  })

  app.addHook('onSend', async (_req, reply, payload) => {
    reply.headers(corsHeaders)
    return payload
  })

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
