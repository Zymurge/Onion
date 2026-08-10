import { describe, expect, it } from 'vitest'

import { parseScenarioSnapshot, ScenarioValidationError } from '#server/api/gamesHelpers'

const validScenario = {
  id: 'valid-scenario',
  name: 'Valid Scenario',
  description: 'A complete scenario fixture.',
  map: {
    radius: 1,
    hexes: [],
  },
  initialState: {
    onions: {
      'onion-1': {
        type: 'TheOnion',
        position: { q: 1, r: 1 },
      },
    },
    defenders: {},
  },
  victoryConditions: {},
}

describe('parseScenarioSnapshot', () => {
  it('validates and materializes a complete authored scenario', () => {
    const scenario = parseScenarioSnapshot(validScenario)

    expect(scenario.id).toBe('valid-scenario')
    expect(scenario.map).toMatchObject({ width: 3, height: 3 })
    expect(scenario.initialState).toEqual(expect.objectContaining(validScenario.initialState))
  })

  it('accepts multiple authored Onions without static catalog fields', () => {
    const scenario = parseScenarioSnapshot({
      ...validScenario,
      initialState: {
        ...validScenario.initialState,
        onions: {
          ...validScenario.initialState.onions,
          'onion-2': {
            type: 'TheOnion',
            position: { q: 2, r: 2 },
          },
        },
      },
    })

    expect(Object.keys(scenario.initialState.onions ?? {})).toEqual(['onion-1', 'onion-2'])
    expect(scenario.initialState.onions?.['onion-2']?.position).toEqual({ q: 1, r: 2 })
  })

  it.each([
    ['missing initialState', (() => {
      const { initialState: _initialState, ...scenario } = validScenario
      return scenario
    })()],
    ['missing map', (() => {
      const { map: _map, ...scenario } = validScenario
      return scenario
    })()],
    ['missing victoryConditions', (() => {
      const { victoryConditions: _victoryConditions, ...scenario } = validScenario
      return scenario
    })()],
    ['invalid unit state', {
      ...validScenario,
      initialState: {
        ...validScenario.initialState,
        onions: { ...validScenario.initialState.onions, 'onion-1': { ...validScenario.initialState.onions['onion-1'], status: 'unknown' } },
      },
    }],
    ['empty explicit map', {
      ...validScenario,
      map: { width: 1, height: 1, cells: [], hexes: [] },
    }],
    ['unknown Onion deployment fields', {
      ...validScenario,
      initialState: {
        ...validScenario.initialState,
        onions: {
          ...validScenario.initialState.onions,
          'onion-1': {
            ...validScenario.initialState.onions['onion-1'],
            treads: 45,
            unexpectedWeaponMetadata: { main: 1, secondary: 4, ap: 8 },
            weapons: [],
          },
        },
      },
    }],
  ])('rejects a scenario with %s', (_description, scenario) => {
    expect(() => parseScenarioSnapshot(scenario)).toThrow(ScenarioValidationError)
  })
})