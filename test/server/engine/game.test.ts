import { describe, expect, it } from 'vitest'

import { advancePhaseWithEvents } from '#server/engine/game'
import { makeDefender, makeGameState, makeOnion } from '#test/utils/gameStateUtils'

describe('advancePhaseWithEvents', () => {
  it('clears destroyed defenders when the automatic recovery phase reaches Defender Movement', () => {
    const state = makeGameState({
      onions: { onion: makeOnion({ unitId: 'onion' }) },
      defenders: {
        dead: makeDefender({ unitId: 'dead', state: 'destroyed' }),
        alive: makeDefender({ unitId: 'alive' }),
      },
      currentPhase: 'ONION_COMBAT',
      turn: 1,
    })

    const result = advancePhaseWithEvents({
      phase: 'ONION_COMBAT',
      turnNumber: 1,
      state,
      events: [],
    })

    expect(result.phase).toBe('DEFENDER_MOVE')
    expect(result.state.defenders.dead).toBeUndefined()
    expect(result.state.defenders.alive).toBeDefined()
  })

  it('clears destroyed Onion-side units when a new turn reaches Onion Movement', () => {
    const state = makeGameState({
      onions: {
        alive: makeOnion({ unitId: 'alive', treads: 12 }),
        destroyed: makeOnion({ unitId: 'destroyed', state: 'destroyed' }),
      },
      defenders: {},
      currentPhase: 'GEV_SECOND_MOVE',
      turn: 1,
    })

    const result = advancePhaseWithEvents({
      phase: 'GEV_SECOND_MOVE',
      turnNumber: 1,
      state,
      events: [],
    })

    expect(result.phase).toBe('ONION_MOVE')
    expect(result.state.onions).toEqual({ alive: expect.objectContaining({ unitId: 'alive', treads: 12 }) })
  })
})