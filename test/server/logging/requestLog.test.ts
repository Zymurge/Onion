import { Writable } from 'node:stream'
import { describe, expect, it } from 'vitest'

import { buildApp } from '#server/app'
import { loadConfig } from '#server/config/loadConfig'
import { buildSafeRequestLog, redactRequestUrl } from '#server/logging/requestLog'

const PASSWORD = 'sentinel-pass-9f3a'
const BEARER = 'sentinel-bearer-9f3a'
const WEBSOCKET_TOKEN = 'sentinel-ws-token-9f3a'

class LogStream extends Writable {
  chunks: string[] = []

  override _write(chunk: Buffer | string, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.chunks.push(chunk.toString())
    callback()
  }

  text(): string {
    return this.chunks.join('')
  }
}

function debugConfig() {
  return loadConfig({
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'debug',
  })
}

describe('request log redaction', () => {
  it('redacts sensitive query values without dropping the route', () => {
    expect(redactRequestUrl(`/games/123/ws?token=${WEBSOCKET_TOKEN}&after=4`)).toBe('/games/123/ws?token=(redacted)&after=4')
  })

  it('omits credential headers and redacts nested secrets', () => {
    expect(buildSafeRequestLog({
      id: 'req-1',
      method: 'POST',
      url: '/auth/login',
      headers: {
        authorization: `Bearer ${BEARER}`,
        cookie: `session=${WEBSOCKET_TOKEN}`,
        'content-type': 'application/json',
      },
      body: {
        username: 'shrek',
        password: PASSWORD,
        nested: { refresh_token: WEBSOCKET_TOKEN },
      },
    })).toEqual({
      requestId: 'req-1',
      method: 'POST',
      url: '/auth/login',
      route: undefined,
      params: undefined,
      query: undefined,
      headers: { 'content-type': 'application/json' },
      body: {
        username: 'shrek',
        password: '(redacted)',
        nested: { refresh_token: '(redacted)' },
      },
    })
  })

  it('keeps sentinel credentials out of login, bearer, websocket, and error logs', async () => {
    const logs = new LogStream()
    const app = buildApp(undefined, { config: debugConfig(), loggerDestination: logs })
    const registered = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { username: 'log-redaction-user', email: 'log-redaction-user@example.com', password: PASSWORD },
    })
    const user = registered.json<{ userId: string }>()

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { username: 'log-redaction-user', password: PASSWORD },
    })
    const authorized = await app.inject({
      method: 'GET',
      url: '/games',
      headers: { authorization: `Bearer ${BEARER}` },
    })
    const upgrade = await app.inject({
      method: 'GET',
      url: `/games/${user.userId}/ws?token=${encodeURIComponent(WEBSOCKET_TOKEN)}`,
    })
    const malformed = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${BEARER}` },
      payload: `{"password":"${PASSWORD}"`,
    })

    expect(registered.statusCode).toBe(201)
    expect(login.statusCode).toBe(200)
    expect(authorized.statusCode).toBe(401)
    expect(upgrade.statusCode).toBeGreaterThanOrEqual(400)
    expect(malformed.statusCode).toBe(400)

    const text = logs.text()
    expect(text).toContain('/auth/login')
    expect(text).toContain('(redacted)')
    expect(text).not.toContain(PASSWORD)
    expect(text).not.toContain(BEARER)
    expect(text).not.toContain(WEBSOCKET_TOKEN)

    await app.close()
  })
})
