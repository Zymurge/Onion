import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'

describe('GET /games', () => {
  it('returns 404 or 405 if route exists', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'GET', url: '/games' })
    // If route exists but method not allowed, expect 405; if not found, expect 404
    expect([404, 405]).toContain(res.statusCode)
  })
})
