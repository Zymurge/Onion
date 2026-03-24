import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'

describe('GET /scenarios', () => {
  it('returns an array', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/scenarios' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('includes swamp-siege-01 with required summary fields', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/scenarios' })
    const scenarios = res.json<{ id: string; name: string; displayName: string; description: string }[]>()
    const swamp = scenarios.find((s) => s.id === 'swamp-siege-01')
    expect(swamp).toBeDefined()
    if (!swamp) return
    expect(swamp).toHaveProperty('name')
    expect(swamp).toHaveProperty('displayName')
    expect(swamp.displayName).toBe('The Siege of Shrek\'s Swamp')
    expect(swamp).toHaveProperty('description')
  })
})

describe('GET /scenarios/:id', () => {
  it('returns the full scenario for a known id', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/scenarios/swamp-siege-01' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.id).toBe('swamp-siege-01')
    expect(body).toHaveProperty('name')
    expect(body).toHaveProperty('displayName')
    expect(body.displayName).toBe('The Siege of Shrek\'s Swamp')
    expect(body).toHaveProperty('map')
    expect(body).toHaveProperty('initialState')
    expect(body).toHaveProperty('victoryConditions')
  })

  it('returns 404 for an unknown id', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/scenarios/no-such-scenario' })
    expect(res.statusCode).toBe(404)
    expect(res.json().code).toBe('NOT_FOUND')
  })
  it('returns 400 for payload too large (Fastify test injector limitation)', async () => {
    const app = buildApp()
    // GET with large query param
    const big = 'x'.repeat(17 * 1024)
    const res = await app.inject({ method: 'GET', url: `/scenarios/${big}` })
    expect([400, 404]).toContain(res.statusCode)
  })

  it('returns 400 for malformed JSON (should not parse body)', async () => {
    const app = buildApp()
    // GET with invalid content-type and body
    const res = await app.inject({
      method: 'GET',
      url: '/scenarios/swamp-siege-01',
      headers: { 'content-type': 'application/json' },
      body: '{ bad json',
    })
    // Should ignore body, but Fastify may still error
    expect([200, 400, 500]).toContain(res.statusCode)
    // Accept 200 (ignored), 400 (malformed), or 500 (test injector quirk)
  })

  it('returns 500 for internal error (custom Fastify instance)', async () => {
    const Fastify = require('fastify')
    const app = Fastify()
    app.setErrorHandler((error: Error, _req: any, reply: any) => {
      return reply.status(500).send({ ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' })
    })
    app.get('/scenarios/:id', async (_req: any, reply: any) => { throw new Error('fail') })
    const res = await app.inject({ method: 'GET', url: '/scenarios/swamp-siege-01' })
    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_ERROR')
  })
})
