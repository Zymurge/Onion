import { describe, expect, it } from 'vitest'

import { buildApp } from '#server/app'
import { verifyUserId } from '#server/api/auth'

const userId = '550e8400-e29b-41d4-a716-446655440000'

describe('verifyUserId', () => {
  it('returns the UUID subject from a valid bearer JWT', async () => {
    const app = buildApp()
    await app.ready()
    const token = app.jwt.sign({ sub: userId })

    await expect(verifyUserId(app, `Bearer ${token}`)).resolves.toBe(userId)
    await app.close()
  })

  it.each([
    undefined,
    '',
    'Basic credentials',
    'Bearer',
    'Bearer not-a-jwt',
  ])('rejects an invalid authorization header: %s', async (authorization) => {
    const app = buildApp()
    await app.ready()

    await expect(verifyUserId(app, authorization)).resolves.toBeNull()
    await app.close()
  })

  it('rejects a token signed with another secret', async () => {
    const app = buildApp()
    const otherApp = buildApp(undefined, {
      config: {
        ...{
          port: 3000,
          host: '127.0.0.1',
          databaseUrl: 'postgres://onion:onionpass@127.0.0.1:5432/onion-test',
          jwtSecret: 'another-test-jwt-secret-that-is-long-enough',
          nodeEnv: 'test',
          logLevel: 'error',
          scenariosDir: `${process.cwd()}/scenarios`,
        },
      },
    })
    await app.ready()
    await otherApp.ready()
    const token = otherApp.jwt.sign({ sub: userId })

    await expect(verifyUserId(app, `Bearer ${token}`)).resolves.toBeNull()
    await app.close()
    await otherApp.close()
  })

  it('rejects a token without a UUID subject', async () => {
    const app = buildApp()
    await app.ready()
    const token = app.jwt.sign({ sub: 'user-1' })

    await expect(verifyUserId(app, `Bearer ${token}`)).resolves.toBeNull()
    await app.close()
  })
})
