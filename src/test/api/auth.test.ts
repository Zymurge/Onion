import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'

describe('POST /auth/register', () => {
  it('returns 201 with userId and token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'shrek', password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<{ userId: string; token: string }>()
    expect(body).toHaveProperty('userId')
    expect(body).toHaveProperty('token')
    expect(typeof body.userId).toBe('string')
    expect(typeof body.token).toBe('string')
  })

  it('returns 409 when username is already taken', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'donkey', password: 'swamp1234' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'donkey', password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('USERNAME_TAKEN')
  })

  it('returns 400 for username too short', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'ab', password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for password too short', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'shrek', password: 'short' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when username is missing', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when password is missing', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'shrek' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for payload too large (Fastify test injector limitation)', async () => {
    const app = buildApp()
    // Simulate a payload >16KB
    const big = 'x'.repeat(17 * 1024)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: big, password: big },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for malformed JSON', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      body: '{ username: "shrek", password: "swamp1234" ',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MALFORMED_JSON')
  })

  it('returns 500 for internal error', async () => {
    const mockDb = {
      createUser: async () => { throw new Error('fail') },
      findUserByUsername: async () => null,
      createMatch: async () => ({ gameId: 1 }),
      findMatch: async () => null,
      updateMatchPlayers: async () => {},
      updateMatchState: async () => {},
      persistMatchProgress: async () => {},
      appendEvents: async () => {},
      getEvents: async () => [],
    }
    const app = buildApp(mockDb)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'ogre', password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_ERROR')
  })
})

describe('POST /auth/login', () => {
  it('returns 200 with userId and token for valid credentials', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'fiona', password: 'swamp1234' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'fiona', password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<{ userId: string; token: string }>()
    expect(body).toHaveProperty('userId')
    expect(body).toHaveProperty('token')
  })

  it('userId is consistent between register and login', async () => {
    const app = buildApp()
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'puss', password: 'hairball123' },
    })
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'puss', password: 'hairball123' },
    })
    expect(reg.json().userId).toBe(login.json().userId)
  })

  it('returns 401 for wrong password', async () => {
    const app = buildApp()
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'puss', password: 'hairball123' },
    })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'puss', password: 'wrongpass123' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 for unknown username', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'farquaad', password: 'lordly1234' },
    })
    expect(res.statusCode).toBe(401)
  })

  it('returns 400 when username is missing', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when password is missing', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'shrek' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for payload too large (Fastify test injector limitation)', async () => {
    const app = buildApp()
    const big = 'x'.repeat(17 * 1024)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: big, password: big },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for malformed JSON', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      body: '{ username: "shrek", password: "swamp1234" ',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MALFORMED_JSON')
  })

  it('returns 500 for internal error', async () => {
    const mockDb = {
      findUserByUsername: async () => { throw new Error('fail') },
      createUser: async () => ({ userId: 'mock-user-id' }),
      createMatch: async () => ({ gameId: 1 }),
      findMatch: async () => null,
      updateMatchPlayers: async () => {},
      updateMatchState: async () => {},
      persistMatchProgress: async () => {},
      appendEvents: async () => {},
      getEvents: async () => [],
    }
    const app = buildApp(mockDb)
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'ogre', password: 'swamp1234' },
    })
    expect(res.statusCode).toBe(500)
    expect(res.json().code).toBe('INTERNAL_ERROR')
  })
})
