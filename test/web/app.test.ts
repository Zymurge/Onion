import { describe, it, expect } from 'vitest'
import { buildApp } from '../../server/app.js'

describe('GET /health', () => {
  it('returns 200 with ok: true', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ ok: true })
  })
})

describe('GET /health/ready', () => {
  it('returns 503 when DATABASE_URL is not set (no DB wired yet)', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(res.statusCode).toBe(503)
    const body = res.json<{ ok: boolean; db: string; error: string }>()
    expect(body.ok).toBe(false)
    expect(body.db).toBe('unavailable')
    expect(typeof body.error).toBe('string')
  })
})

describe('CORS preflight', () => {
  it('handles OPTIONS preflight for web requests', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin: 'http://localhost:5173',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    expect(res.statusCode).toBe(204)
    expect(res.headers['access-control-allow-origin']).toBe('*')
    expect(res.headers['access-control-allow-methods']).toContain('POST')
    expect(res.headers['access-control-allow-headers']).toContain('content-type')
  })
})
