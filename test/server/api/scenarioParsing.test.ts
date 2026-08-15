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

const targetDeploymentScenario = {
  id: 'target-deployment-scenario',
  name: 'Target Deployment Scenario',
  description: 'A mixed-side deployment contract fixture.',
  map: {
    radius: 2,
    hexes: [],
  },
  initialState: {
    deployments: {
      'puss-1': {
        type: 'Puss',
        side: 'onion',
        position: { q: 1, r: 1 },
      },
      'onion-1': {
        type: 'TheOnion',
        side: 'defender',
        position: { q: 2, r: 1 },
        startingAmmoByWeaponType: { 'TheOnion.missile_1': 0 },
      },
      'pigs-stack-1': {
        kind: 'stack-group',
        unitType: 'LittlePigs',
        side: 'defender',
        position: { q: 1, r: 2 },
        count: 2,
      },
    },
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

  it('DEP-001 accepts regular deployments for either side', () => {
    const scenario = parseScenarioSnapshot(targetDeploymentScenario)
    const deployments = (scenario.initialState as unknown as { deployments: Record<string, unknown> }).deployments

    expect(deployments).toMatchObject({
      'puss-1': { type: 'Puss', side: 'onion', position: { q: 2, r: 1 } },
      'onion-1': { type: 'TheOnion', side: 'defender', position: { q: 3, r: 1 } },
    })
  })

  it('DEP-005 preserves full weapon type IDs and starting ammo overrides', () => {
    const scenario = parseScenarioSnapshot(targetDeploymentScenario)
    const deployments = (scenario.initialState as unknown as { deployments: Record<string, unknown> }).deployments

    expect(deployments['onion-1']).toMatchObject({
      startingAmmoByWeaponType: { 'TheOnion.missile_1': 0 },
    })
  })

  it('DEP-007 accepts side and ammo overrides on stack groups', () => {
    const scenario = parseScenarioSnapshot(targetDeploymentScenario)
    const deployments = (scenario.initialState as unknown as { deployments: Record<string, unknown> }).deployments

    expect(deployments['pigs-stack-1']).toMatchObject({
      kind: 'stack-group',
      side: 'defender',
      count: 2,
    })
  })

  it.each([
    ['missing side', { type: 'Puss', position: { q: 1, r: 1 } }],
    ['invalid side', { type: 'Puss', side: 'neutral', position: { q: 1, r: 1 } }],
    ['invalid ammo', { type: 'TheOnion', side: 'onion', position: { q: 1, r: 1 }, startingAmmoByWeaponType: { 'TheOnion.missile_1': -1 } }],
    ['unknown field', { type: 'Puss', side: 'onion', position: { q: 1, r: 1 }, role: 'onion' }],
  ])('DEP-002/003/006/004 rejects %s', (_description, deployment) => {
    const invalidScenario = {
      ...targetDeploymentScenario,
      initialState: { deployments: { 'unit-1': deployment } },
    }

    expect(() => parseScenarioSnapshot(invalidScenario)).toThrow(ScenarioValidationError)
  })

  it('DEP-010 rejects the legacy split deployment shape after cutover', () => {
    expect(() => parseScenarioSnapshot(validScenario)).toThrow(ScenarioValidationError)
  })

  it.todo('DEP-008 rejects scenarios with no Onion-side deployment')

  it.each([
    ['missing initialState', (() => {
      const { initialState: _initialState, ...scenario } = validScenario
      void _initialState
      return scenario
    })()],
    ['missing map', (() => {
      const { map: _map, ...scenario } = validScenario
      void _map
      return scenario
    })()],
    ['missing victoryConditions', (() => {
      const { victoryConditions: _victoryConditions, ...scenario } = validScenario
      void _victoryConditions
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