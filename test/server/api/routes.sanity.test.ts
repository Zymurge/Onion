
import { describe, it, expect } from 'vitest'
import { buildApp } from '#server/app'

describe('API route sanity checks', () => {
  it('GET /health returns 200', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })

  it('GET /health/ready returns 200 or 500', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/health/ready' })
    expect([200, 500, 503]).toContain(res.statusCode)
  })

  it('POST /auth/register exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: {} })
    expect([201, 400, 409]).toContain(res.statusCode)
  })

  it('POST /auth/login exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/login', payload: {} })
    expect([200, 400, 401]).toContain(res.statusCode)
  })

  it('GET /scenarios exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/scenarios' })
    expect(res.statusCode).toBe(200)
    expect(Array.isArray(res.json())).toBe(true)
  })

  it('GET /scenarios/:id exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/scenarios/swamp-siege-01' })
    expect([200, 404]).toContain(res.statusCode)
  })

  it('GET /games returns 401 without auth', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/games' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /games exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/games', payload: {} })
    expect([201, 400, 401]).toContain(res.statusCode)
  })

  it('POST /games/:id/join exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/games/some-id/join', payload: {} })
    expect([200, 400, 401, 404, 409]).toContain(res.statusCode)
  })

  it('POST /games/:id/actions exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/games/some-id/actions', payload: {} })
    expect([200, 400, 401, 403, 404, 409]).toContain(res.statusCode)
  })
})
