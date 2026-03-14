import { describe, it, expect } from 'vitest'
import { buildApp } from './app.js'

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
