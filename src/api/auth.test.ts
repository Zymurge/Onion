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
})
