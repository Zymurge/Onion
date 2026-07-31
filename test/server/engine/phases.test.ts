import { describe, it, expect } from 'vitest'
import { TURN_PHASES, nextPhase, phaseActor, checkVictoryConditions, advancePhase } from '#server/engine/phases'
import type { GameState, Weapon } from '#server/engine/units'
import { makeDefender as makeUnit, makeGameState, makeOnion } from '#test/utils/gameStateUtils'

describe('TURN_PHASES', () => {
  it('contains all 6 phases in order', () => {
    expect(TURN_PHASES).toHaveLength(6)
    expect(TURN_PHASES[0]).toBe('ONION_MOVE')
    expect(TURN_PHASES[5]).toBe('GEV_SECOND_MOVE')
  })
})

describe('nextPhase', () => {
  it('advances through all phases in sequence', () => {
    expect(nextPhase('ONION_MOVE')).toBe('ONION_COMBAT')
    expect(nextPhase('ONION_COMBAT')).toBe('DEFENDER_RECOVERY')
    expect(nextPhase('DEFENDER_RECOVERY')).toBe('DEFENDER_MOVE')
    expect(nextPhase('DEFENDER_MOVE')).toBe('DEFENDER_COMBAT')
    expect(nextPhase('DEFENDER_COMBAT')).toBe('GEV_SECOND_MOVE')
  })

  it('wraps from GEV_SECOND_MOVE back to ONION_MOVE', () => {
    expect(nextPhase('GEV_SECOND_MOVE')).toBe('ONION_MOVE')
  })
})

describe('phaseActor', () => {
  it('returns onion for onion phases', () => {
    expect(phaseActor('ONION_MOVE')).toBe('onion')
    expect(phaseActor('ONION_COMBAT')).toBe('onion')
  })

  it('returns engine for DEFENDER_RECOVERY', () => {
    expect(phaseActor('DEFENDER_RECOVERY')).toBe('engine')
  })

  it('returns defender for all defender phases', () => {
    expect(phaseActor('DEFENDER_MOVE')).toBe('defender')
    expect(phaseActor('DEFENDER_COMBAT')).toBe('defender')
    expect(phaseActor('GEV_SECOND_MOVE')).toBe('defender')
  })
})

describe('checkVictoryConditions', () => {
  function makeState(overrides: Partial<GameState> = {}): GameState {
    return makeGameState({
      onions: { onion: makeOnion({ unitId: 'onion' }) },
      defenders: {
        swamp: makeUnit({ typeId: 'Swamp' as any, unitId: 'swamp' }),
        puss: makeUnit({ typeId: 'Puss', unitId: 'puss' }),
      },
      currentPhase: 'ONION_MOVE',
      turn: 1,
      ...overrides,
    })
  }

  it('returns null when game continues', () => {
    const state = makeState()
    expect(checkVictoryConditions(state)).toBe(null)
  })

  it('returns null when Swamp is destroyed but Onion can still move', () => {
    const state = makeState({
      defenders: {
        swamp: makeUnit({ typeId: 'Swamp' as any, unitId: 'swamp', state: 'destroyed' }),
        puss: makeUnit({ typeId: 'Puss', unitId: 'puss' }),
      },
    })
    expect(checkVictoryConditions(state)).toBe(null)
  })

  it('returns defender when Onion treads are 0', () => {
    const state = makeState({
      onions: { onion: makeOnion({ treads: 0 }) },
    })
    expect(checkVictoryConditions(state)).toBe('defender')
  })

  it('returns defender when Onion is destroyed', () => {
    const state = makeState({
      onions: { onion: makeOnion({ state: 'destroyed' }) },
    })
    expect(checkVictoryConditions(state)).toBe('defender')
  })

  it('returns defender when Onion treads are negative', () => {
    const state = makeState({
      onions: { onion: makeOnion({ treads: -5 }) },
    })
    expect(checkVictoryConditions(state)).toBe('defender')
  })

})

describe('advancePhase', () => {
  function makeState(phase: GameState['currentPhase'] = 'ONION_MOVE', defenders: GameState['defenders'] = {}): GameState {
    return makeGameState({
      onions: { onion: makeOnion({ unitId: 'onion' }) },
      defenders,
      currentPhase: phase,
      turn: 1,
    })
  }

  it('advances from ONION_MOVE to ONION_COMBAT', () => {
    const state = makeState('ONION_MOVE')
    advancePhase(state)
    expect(state.currentPhase).toBe('ONION_COMBAT')
  })

  it('advances from ONION_COMBAT through DEFENDER_RECOVERY to DEFENDER_MOVE (auto-process)', () => {
    const state = makeState('ONION_COMBAT')
    advancePhase(state)
    // DEFENDER_RECOVERY is engine-controlled and auto-advances
    expect(state.currentPhase).toBe('DEFENDER_MOVE')
  })

  it('advances from DEFENDER_MOVE to DEFENDER_COMBAT', () => {
    const state = makeState('DEFENDER_MOVE')
    advancePhase(state)
    expect(state.currentPhase).toBe('DEFENDER_COMBAT')
  })

  it('advances from DEFENDER_COMBAT to GEV_SECOND_MOVE', () => {
    const state = makeState('DEFENDER_COMBAT')
    advancePhase(state)
    expect(state.currentPhase).toBe('GEV_SECOND_MOVE')
  })

  it('advances from GEV_SECOND_MOVE to ONION_MOVE (new turn)', () => {
    const state = makeState('GEV_SECOND_MOVE')
    advancePhase(state)
    expect(state.currentPhase).toBe('ONION_MOVE')
  })

  describe('entering ONION_MOVE (new turn)', () => {
    it('increments turn counter', () => {
      const state = makeState('GEV_SECOND_MOVE')
      expect(state.turn).toBe(1)
      advancePhase(state)
      expect(state.turn).toBe(2)
    })

    it('resets Onion ramsRemaining to 2', () => {
      const state = makeState('GEV_SECOND_MOVE')
      state.onions.onion.ramsRemaining = 0
      advancePhase(state)
      expect(state.onions.onion.ramsRemaining).toBe(2)
    })

    it('transitions disabled units to recovering', () => {
      const state = makeState('GEV_SECOND_MOVE', {
        puss: makeUnit({ unitId: 'puss', state: 'disabled' }),
        wolf: makeUnit({ unitId: 'wolf', typeId: 'BigBadWolf', state: 'disabled' }),
        healthy: makeUnit({ unitId: 'healthy', state: 'operational' }),
      })
      advancePhase(state)
      expect(state.defenders['puss'].state).toBe('recovering')
      expect(state.defenders['wolf'].state).toBe('recovering')
      expect(state.defenders['healthy'].state).toBe('operational')
    })

    it('does not affect already-recovering units', () => {
      const state = makeState('GEV_SECOND_MOVE', {
        unit: makeUnit({ unitId: 'unit', state: 'recovering' }),
      })
      advancePhase(state)
      // recovering stays recovering — it will become operational next recovery phase
      expect(state.defenders['unit'].state).toBe('recovering')
    })

    it('refreshes spent Onion weapons to ready', () => {
      const state = makeState('GEV_SECOND_MOVE')
      state.onions.onion.weapons = [
        {
          id: 'main',
          typeId: 'TheOnion.main',
          state: 'spent',
          friendlyName: 'Main Battery',
        } satisfies Weapon,
      ]

      advancePhase(state)
      expect(state.onions.onion.weapons[0].state).toBe('ready')
    })
  })

  describe('entering DEFENDER_RECOVERY (auto-processed)', () => {
    it('transitions recovering units to operational before landing on DEFENDER_MOVE', () => {
      const state = makeState('ONION_COMBAT', {
        puss: makeUnit({ unitId: 'puss', state: 'recovering' }),
        wolf: makeUnit({ unitId: 'wolf', typeId: 'BigBadWolf', state: 'recovering' }),
        newlyDisabled: makeUnit({ unitId: 'newlyDisabled', state: 'disabled' }),
      })
      advancePhase(state)
      expect(state.currentPhase).toBe('DEFENDER_MOVE')
      expect(state.defenders['puss'].state).toBe('operational')
      expect(state.defenders['wolf'].state).toBe('operational')
      // disabled this turn is untouched by recovery
      expect(state.defenders['newlyDisabled'].state).toBe('disabled')
    })

    it('does not affect already-operational or destroyed units', () => {
      const state = makeState('ONION_COMBAT', {
        alive: makeUnit({ unitId: 'alive', state: 'operational' }),
        dead: makeUnit({ unitId: 'dead', state: 'destroyed' }),
      })
      advancePhase(state)
      expect(state.defenders['alive'].state).toBe('operational')
      expect(state.defenders['dead'].state).toBe('destroyed')
    })
  })
})
