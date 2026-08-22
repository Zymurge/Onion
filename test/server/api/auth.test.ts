import { describe, it, expect } from 'vitest'
import { buildApp } from '#server/app'

const validCredentials = {
  username: 'Swamp Walker',
  email: 'Player@Example.com',
  password: 'swamp 1234!',
}

describe('POST /auth/register', () => {
  it('returns the public username and a JWT whose subject is the internal UUID', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: validCredentials })

    expect(res.statusCode).toBe(201)
    const body = res.json<{ username: string; token: string; userId?: string }>()
    expect(body).toEqual({ username: validCredentials.username, token: expect.any(String) })
    expect(body.userId).toBeUndefined()
    const claims = await app.jwt.verify<{ sub: string }>(body.token)
    expect(claims.sub).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  })

  it('preserves username casing and compares username case-insensitively', async () => {
    const app = buildApp()
    await app.inject({ method: 'POST', url: '/auth/register', payload: validCredentials })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...validCredentials, username: 'swamp walker', email: 'other@example.com' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('USERNAME_TAKEN')
  })

  it('compares email case-insensitively and reports an email conflict', async () => {
    const app = buildApp()
    await app.inject({ method: 'POST', url: '/auth/register', payload: validCredentials })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...validCredentials, username: 'Another User', email: 'player@example.com' },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('EMAIL_TAKEN')
  })

  it.each([
    ['too short', 'abc'],
    ['too long', 'a'.repeat(21)],
    ['leading space', ' user'],
    ['trailing space', 'user '],
    ['control character', 'user\nname'],
  ])('returns 400 for username %s', async (_label, username) => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { ...validCredentials, username } })
    expect(res.statusCode).toBe(400)
  })

  it.each([
    ['too short', '1234567'],
    ['too long', 'a'.repeat(21)],
    ['control character', 'password\n'],
  ])('returns 400 for password %s', async (_label, password) => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { ...validCredentials, password } })
    expect(res.statusCode).toBe(400)
  })

  it.each([
    ['missing', undefined],
    ['malformed', 'player.example.com'],
    ['too long', `${'a'.repeat(245)}@example.com`],
    ['whitespace', 'player @example.com'],
  ])('returns 400 for email %s', async (_label, email) => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: { ...validCredentials, email } })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for missing fields', async () => {
    const app = buildApp()
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: {} })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 for malformed JSON', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { 'content-type': 'application/json' },
      body: '{ username: "shrek", email: "player@example.com", password: "swamp1234" ',
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('MALFORMED_JSON')
  })
})
