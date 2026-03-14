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
    const scenarios = res.json<{ id: string; name: string; description: string }[]>()
    const swamp = scenarios.find((s) => s.id === 'swamp-siege-01')
    expect(swamp).toBeDefined()
    expect(swamp).toHaveProperty('name')
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
})
