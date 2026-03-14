import { describe, it, expect } from 'vitest'
import { TURN_PHASES, nextPhase, phaseActor, checkVictoryConditions } from './phases.js'
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
