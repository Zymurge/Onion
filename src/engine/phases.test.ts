import { describe, it, expect } from 'vitest'
import { TURN_PHASES, nextPhase, phaseActor, checkVictoryConditions, advancePhase } from './phases.js'
import type { EngineGameState, DefenderUnit, OnionUnit } from './units.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
  return {
    id: 'u1',
    type: 'Puss',
    position: { q: 0, r: 0 },
    status: 'operational',
    weapons: [],
    ...overrides,
  } as DefenderUnit
}

function makeOnion(overrides: Partial<OnionUnit> = {}): OnionUnit {
  return {
    id: 'onion',
    type: 'TheOnion',
    position: { q: 0, r: 0 },
    status: 'operational',
    treads: 45,
    weapons: [],
    ...overrides,
  }
}

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
  function makeState(overrides: Partial<EngineGameState> = {}): EngineGameState {
    return {
      onion: makeOnion(),
      defenders: {
        castle: makeUnit({ type: 'Castle', id: 'castle' }),
        puss: makeUnit({ type: 'Puss', id: 'puss' }),
      },
      ramsThisTurn: 0,
      currentPhase: 'ONION_MOVE',
      turn: 1,
      ...overrides,
    }
  }

  it('returns null when game continues', () => {
    const state = makeState()
    expect(checkVictoryConditions(state, 1, 10)).toBe(null)
  })

  it('returns onion when Castle is destroyed', () => {
    const state = makeState({
      defenders: {
        castle: makeUnit({ type: 'Castle', id: 'castle', status: 'destroyed' }),
        puss: makeUnit({ type: 'Puss', id: 'puss' }),
      },
    })
    expect(checkVictoryConditions(state, 1, 10)).toBe('onion')
  })

  it('returns defender when Onion treads are 0', () => {
    const state = makeState({
      onion: makeOnion({ treads: 0 }),
    })
    expect(checkVictoryConditions(state, 1, 10)).toBe('defender')
  })

  it('returns defender when Onion is destroyed', () => {
    const state = makeState({
      onion: makeOnion({ status: 'destroyed' }),
    })
    expect(checkVictoryConditions(state, 1, 10)).toBe('defender')
  })

  it('returns defender when Onion treads are negative', () => {
    const state = makeState({
      onion: makeOnion({ treads: -5 }),
    })
    expect(checkVictoryConditions(state, 1, 10)).toBe('defender')
  })

  it('prioritizes Castle destruction over Onion immobilization', () => {
    const state = makeState({
      onion: makeOnion({ treads: 0 }),
      defenders: {
        castle: makeUnit({ type: 'Castle', id: 'castle', status: 'destroyed' }),
        puss: makeUnit({ type: 'Puss', id: 'puss' }),
      },
    })
    expect(checkVictoryConditions(state, 1, 10)).toBe('onion')
  })
})

describe('advancePhase', () => {
  function makeState(phase: EngineGameState['currentPhase'] = 'ONION_MOVE', defenders: Record<string, DefenderUnit> = {}): EngineGameState {
    return {
      onion: makeOnion(),
      defenders,
      ramsThisTurn: 0,
      currentPhase: phase,
      turn: 1,
    }
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

    it('resets ramsThisTurn to 0', () => {
      const state = makeState('GEV_SECOND_MOVE')
      state.ramsThisTurn = 2
      advancePhase(state)
      expect(state.ramsThisTurn).toBe(0)
    })

    it('transitions disabled units to recovering', () => {
      const state = makeState('GEV_SECOND_MOVE', {
        puss: makeUnit({ id: 'puss', status: 'disabled' }),
        wolf: makeUnit({ id: 'wolf', type: 'BigBadWolf', status: 'disabled' }),
        healthy: makeUnit({ id: 'healthy', status: 'operational' }),
      })
      advancePhase(state)
      expect(state.defenders['puss'].status).toBe('recovering')
      expect(state.defenders['wolf'].status).toBe('recovering')
      expect(state.defenders['healthy'].status).toBe('operational')
    })

    it('does not affect already-recovering units', () => {
      const state = makeState('GEV_SECOND_MOVE', {
        unit: makeUnit({ id: 'unit', status: 'recovering' }),
      })
      advancePhase(state)
      // recovering stays recovering — it will become operational next recovery phase
      expect(state.defenders['unit'].status).toBe('recovering')
    })

    it('refreshes spent Onion weapons to ready', () => {
      const state = makeState('GEV_SECOND_MOVE')
      state.onion.weapons = [
        {
          id: 'main',
          name: 'Main Gun',
          attack: 4,
          range: 3,
          defense: 4,
          status: 'spent',
          individuallyTargetable: true,
        },
      ]

      advancePhase(state)
      expect(state.onion.weapons[0].status).toBe('ready')
    })
  })

  describe('entering DEFENDER_RECOVERY (auto-processed)', () => {
    it('transitions recovering units to operational before landing on DEFENDER_MOVE', () => {
      const state = makeState('ONION_COMBAT', {
        puss: makeUnit({ id: 'puss', status: 'recovering' }),
        wolf: makeUnit({ id: 'wolf', type: 'BigBadWolf', status: 'recovering' }),
        newlyDisabled: makeUnit({ id: 'newlyDisabled', status: 'disabled' }),
      })
      advancePhase(state)
      expect(state.currentPhase).toBe('DEFENDER_MOVE')
      expect(state.defenders['puss'].status).toBe('operational')
      expect(state.defenders['wolf'].status).toBe('operational')
      // disabled this turn is untouched by recovery
      expect(state.defenders['newlyDisabled'].status).toBe('disabled')
    })

    it('does not affect already-operational or destroyed units', () => {
      const state = makeState('ONION_COMBAT', {
        alive: makeUnit({ id: 'alive', status: 'operational' }),
        dead: makeUnit({ id: 'dead', status: 'destroyed' }),
      })
      advancePhase(state)
      expect(state.defenders['alive'].status).toBe('operational')
      expect(state.defenders['dead'].status).toBe('destroyed')
    })
  })
})
