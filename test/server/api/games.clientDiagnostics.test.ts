import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '#server/app'
import logger from '#server/logger'
import { createGame, register } from './helpers.js'

const diagnosticPayload = {
  reportId: '550e8400-e29b-41d4-a716-446655440000',
  code: 'SNAPSHOT_INVALID',
  path: 'authoritativeState.defenders.pigs-1.weapons[0]',
  message: 'Loaded game snapshot is invalid: authoritativeState.defenders.pigs-1.weapons[0] is missing friendlyName.',
  refreshAttempt: 1,
  snapshot: {
    gameId: 123,
    scenarioName: 'The Siege of Shrek\'s Swamp',
    phase: 'DEFENDER_COMBAT',
    turnNumber: 8,
    lastEventSeq: 47,
  },
  client: {
    build: 'web-test-build',
    userAgent: 'vitest',
  },
  protocolTraffic: [
    {
      direction: 'response',
      method: 'GET',
      path: '/games/123',
      status: 200,
    },
  ],
}

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
})

afterEach(() => {
  errorSpy.mockRestore()
})

describe('POST /games/:id/client-diagnostics API contract', () => {
  it('accepts one structured snapshot diagnostic from a game participant and logs it without mutating the match', async () => {
    const app = buildApp()
    const reporter = await register(app, 'shrek')
    const { gameId } = await createGame(app, reporter.token, 'onion')

    const before = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${reporter.token}` },
    })
    expect(before.statusCode).toBe(200)

    const response = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/client-diagnostics`,
      headers: { authorization: `Bearer ${reporter.token}` },
      payload: {
        ...diagnosticPayload,
        snapshot: { ...diagnosticPayload.snapshot, gameId },
      },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ ok: true, reportId: diagnosticPayload.reportId })
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        gameId,
        reportId: diagnosticPayload.reportId,
        diagnostic: expect.objectContaining({
          code: 'SNAPSHOT_INVALID',
          path: diagnosticPayload.path,
          refreshAttempt: 1,
          snapshot: expect.objectContaining({ lastEventSeq: 47 }),
        }),
      }),
      'Client reported invalid game snapshot',
    )

    const after = await app.inject({
      method: 'GET',
      url: `/games/${gameId}`,
      headers: { authorization: `Bearer ${reporter.token}` },
    })
    expect(after.statusCode).toBe(200)
    expect(after.json()).toEqual(before.json())
  })

  it('requires authentication and participant membership', async () => {
    const app = buildApp()
    const reporter = await register(app, 'shrek')
    const outsider = await register(app, 'donkey')
    const { gameId } = await createGame(app, reporter.token, 'onion')

    const unauthenticated = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/client-diagnostics`,
      payload: diagnosticPayload,
    })
    expect(unauthenticated.statusCode).toBe(401)

    const forbidden = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/client-diagnostics`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: diagnosticPayload,
    })
    expect(forbidden.statusCode).toBe(403)
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('rejects malformed and oversized diagnostic reports without logging them', async () => {
    const app = buildApp()
    const reporter = await register(app, 'shrek')
    const { gameId } = await createGame(app, reporter.token, 'onion')

    const malformed = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/client-diagnostics`,
      headers: { authorization: `Bearer ${reporter.token}` },
      payload: {
        ...diagnosticPayload,
        code: 'UNKNOWN_ERROR',
      },
    })
    expect(malformed.statusCode).toBe(400)
    expect(malformed.json()).toMatchObject({ ok: false, code: 'INVALID_INPUT' })

    const oversized = await app.inject({
      method: 'POST',
      url: `/games/${gameId}/client-diagnostics`,
      headers: { authorization: `Bearer ${reporter.token}` },
      payload: {
        ...diagnosticPayload,
        message: 'x'.repeat(4_001),
      },
    })
    expect(oversized.statusCode).toBe(400)
    expect(oversized.json()).toMatchObject({ ok: false, code: 'INVALID_INPUT' })
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
