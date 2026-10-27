import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MatchRecord } from '#server/db/adapter'
import { StaleMatchStateError } from '#server/db/adapter'
import { finalizeAction } from '#server/api/gameRoutes/actionHandlers/common'
import type { ActionHandlerContext } from '#server/api/gameRoutes/actionHandlers/types'
import type { EventEnvelope, GameState } from '#shared/types/index'

const mocks = vi.hoisted(() => ({
  logSentEvents: vi.fn(),
  logActionOutcome: vi.fn(),
  buildActionResponse: vi.fn(() => ({ ok: true, marker: 'action-response' })),
}))

const { logSentEvents, logActionOutcome, buildActionResponse } = mocks

vi.mock('#server/api/gameHelpers/logging', () => ({
  logSentEvents: mocks.logSentEvents,
  logActionOutcome: mocks.logActionOutcome,
}))

vi.mock('#server/api/gameHelpers/actionResponses', () => ({
  buildActionResponse: mocks.buildActionResponse,
}))

beforeEach(() => {
  vi.clearAllMocks()
  buildActionResponse.mockImplementation(() => ({ ok: true, marker: 'action-response' }))
})

function makeMatch(): MatchRecord {
  return {
    gameId: 7,
    scenarioId: 'smoke-endgame-01',
    scenarioSnapshot: {},
    players: { onion: 'onion-user', defender: 'defender-user' },
    hostUserId: 'onion-user',
    status: 'active',
    phase: 'DEFENDER_COMBAT',
    turnNumber: 3,
    winner: null,
    state: {} as MatchRecord['state'],
    events: [{ seq: 8, type: 'MOVE_RESOLVED', timestamp: '2026-01-01T00:00:00.000Z' } as EventEnvelope],
  }
}

function makeContext(overrides: Partial<ActionHandlerContext> = {}): ActionHandlerContext {
  return {
    db: {
      persistMatchProgress: vi.fn(),
    } as unknown as ActionHandlerContext['db'],
    scenariosDir: '/tmp/scenarios',
    presenceDisconnectGraceMs: 1_000,
    liveConnections: new Map(),
    ramRollsForGame: vi.fn(),
    combatRollsForGame: vi.fn(),
    broadcastGameEvents: vi.fn(),
    addLiveConnection: vi.fn(),
    removeLiveConnection: vi.fn(),
    getPlayerPresence: vi.fn(),
    match: makeMatch(),
    causeId: 'request-1',
    expectedLastEventSeq: 8,
    attachCauseId: (events, causeId) => events.map((event) => ({ ...event, causeId })),
    ...overrides,
  }
}

describe('finalizeAction', () => {
  it('attaches causes, persists before logging and broadcasting, then builds the response', async () => {
    const order: string[] = []
    const state = {} as GameState
    const events = [{ seq: 9, type: 'FIRE_RESOLVED', timestamp: '2026-01-01T00:00:01.000Z' } as EventEnvelope]
    const context = makeContext({
      attachCauseId: vi.fn((actionEvents: EventEnvelope[], causeId: string): EventEnvelope[] => {
        order.push('attach')
        return actionEvents.map((event) => ({ ...event, causeId }))
      }),
      db: {
        persistMatchProgress: vi.fn(async () => {
          order.push('persist')
        }),
      } as unknown as ActionHandlerContext['db'],
      broadcastGameEvents: vi.fn(() => {
        order.push('broadcast')
      }),
    })
    logSentEvents.mockImplementation(() => order.push('log-events'))
    logActionOutcome.mockImplementation(() => order.push('log-outcome'))
    buildActionResponse.mockImplementation(() => {
      order.push('response')
      return { ok: true, marker: 'action-response' }
    })

    const response = await finalizeAction(context, {
      actionType: 'FIRE',
      state,
      phase: 'DEFENDER_COMBAT',
      turnNumber: 3,
      events,
      status: 'active',
      winner: null,
      outcome: { targetId: 'wolf-1' },
    })

    expect(response).toEqual({ statusCode: 200, payload: { ok: true, marker: 'action-response' } })
    expect(order).toEqual(['attach', 'persist', 'log-events', 'log-outcome', 'broadcast', 'response'])
    expect(context.db.persistMatchProgress).toHaveBeenCalledWith({
      gameId: 7,
      expectedLastEventSeq: 8,
      phase: 'DEFENDER_COMBAT',
      turnNumber: 3,
      winner: null,
      status: 'active',
      state,
      events: [{ ...events[0], causeId: 'request-1' }],
    })
    expect(logSentEvents).toHaveBeenCalledWith(7, 'FIRE', [{ ...events[0], causeId: 'request-1' }])
    expect(logActionOutcome).toHaveBeenCalledWith(7, 'FIRE', { targetId: 'wolf-1' }, [{ ...events[0], causeId: 'request-1' }])
    expect(context.broadcastGameEvents).toHaveBeenCalledWith(7, [{ ...events[0], causeId: 'request-1' }])
    expect(buildActionResponse).toHaveBeenCalledWith(
      context.match,
      state,
      'DEFENDER_COMBAT',
      3,
      9,
      [{ ...events[0], causeId: 'request-1' }],
      'active',
      null,
    )
  })

  it('uses the historical event sequence when finalization receives no events', async () => {
    const context = makeContext()

    await finalizeAction(context, {
      actionType: 'MOVE',
      state: {} as GameState,
      phase: 'DEFENDER_COMBAT',
      turnNumber: 3,
      events: [],
      status: 'active',
      winner: null,
      outcome: { unitIds: ['wolf-1'] },
    })

    expect(buildActionResponse).toHaveBeenCalledWith(
      context.match,
      expect.anything(),
      'DEFENDER_COMBAT',
      3,
      8,
      [],
      'active',
      null,
    )
  })

  it('propagates stale persistence errors before broadcast', async () => {
    const broadcastGameEvents = vi.fn()
    const staleError = new StaleMatchStateError('stale')
    const context = makeContext({
      db: {
        persistMatchProgress: vi.fn(async () => {
          throw staleError
        }),
      } as unknown as ActionHandlerContext['db'],
      broadcastGameEvents,
    })

    await expect(finalizeAction(context, {
      actionType: 'MOVE',
      state: {} as GameState,
      phase: 'DEFENDER_COMBAT',
      turnNumber: 3,
      events: [],
      status: 'active',
      winner: null,
      outcome: { unitIds: ['wolf-1'] },
    })).rejects.toBe(staleError)
    expect(broadcastGameEvents).not.toHaveBeenCalled()
  })
})
