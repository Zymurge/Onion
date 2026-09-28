import { describe, expect, it, vi } from 'vitest'

import type { MatchRecord } from '#server/db/adapter'
import type { ActionHandlerContext } from '#server/api/gameRoutes/actionHandlers/types'
import { handleEndPhase } from '#server/api/gameRoutes/actionHandlers/endPhase'
import { handleFire } from '#server/api/gameRoutes/actionHandlers/fire'
import { handleMove } from '#server/api/gameRoutes/actionHandlers/move'

vi.mock('#server/engine/game', () => ({
  advancePhaseWithEvents: vi.fn(() => ({
    state: {},
    phase: 'ONION_COMBAT',
    turnNumber: 1,
    newEvents: [{ seq: 1, type: 'PHASE_CHANGED', timestamp: '2026-01-01T00:00:00.000Z' }],
  })),
}))

vi.mock('#server/api/gameHelpers/actionResponses', () => ({
  buildActionResponse: vi.fn(() => ({ ok: true, marker: 'action-response' })),
}))

vi.mock('#server/api/gameHelpers/victory', () => ({
  computeWinnerUserId: vi.fn(() => null),
}))

vi.mock('#server/api/gameHelpers/logging', () => ({
  logActionOutcome: vi.fn(),
  logSentEvents: vi.fn(),
}))

function makeMatch(): MatchRecord {
  return {
    gameId: 7,
    scenarioId: 'smoke-endgame-01',
    scenarioSnapshot: {},
    players: { onion: 'onion-user', defender: 'defender-user' },
    hostUserId: 'onion-user',
    status: 'active',
    phase: 'ONION_MOVE',
    turnNumber: 1,
    winner: null,
    state: {} as MatchRecord['state'],
    events: [],
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
    expectedLastEventSeq: 0,
    attachCauseId: (events, causeId) => events.map((event) => ({ ...event, causeId })),
    ...overrides,
  }
}

describe('action handlers', () => {
  it('persists and broadcasts END_PHASE results through the shared response boundary', async () => {
    const context = makeContext()

    const response = await handleEndPhase(context)

    expect(response).toEqual({ statusCode: 200, payload: { ok: true, marker: 'action-response' } })
    expect(context.db.persistMatchProgress).toHaveBeenCalledWith(expect.objectContaining({
      gameId: 7,
      phase: 'ONION_COMBAT',
      events: [expect.objectContaining({ causeId: 'request-1' })],
    }))
    expect(context.broadcastGameEvents).toHaveBeenCalledWith(7, [expect.objectContaining({ causeId: 'request-1' })])
  })

  it('returns MOVE validation errors before engine execution', async () => {
    const response = await handleMove(contextForValidation(), { type: 'MOVE', movers: [], to: { q: 1, r: 1 } })

    expect(response).toEqual(expect.objectContaining({
      statusCode: 422,
      payload: expect.objectContaining({ code: 'MOVE_INVALID' }),
    }))
  })

  it('returns FIRE validation errors before map or combat execution', async () => {
    const response = await handleFire(contextForValidation(), {
      type: 'FIRE',
      attackers: ['unit-1'],
      onionId: '',
      targetId: 'unit-2',
    })

    expect(response).toEqual(expect.objectContaining({
      statusCode: 422,
      payload: expect.objectContaining({ code: 'MOVE_INVALID', detailCode: 'ONION_NOT_FOUND' }),
    }))
  })
})

function contextForValidation(): ActionHandlerContext {
  return makeContext()
}
