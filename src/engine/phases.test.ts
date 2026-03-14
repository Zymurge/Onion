import { describe, it, expect } from 'vitest'
import { TURN_PHASES, nextPhase, phaseActor } from './phases.js'

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
