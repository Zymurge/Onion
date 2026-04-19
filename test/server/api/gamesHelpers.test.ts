import { describe, expect, it } from 'vitest'

import { buildCombatEvents, buildVictoryObjectiveStates, computeWinnerUserId } from '#server/api/gamesHelpers'
import { materializeScenarioMap } from '#shared/scenarioMap'
import type { GameState } from '#shared/types/index'

describe('buildCombatEvents', () => {
  it('derives friendly names from unit definitions when live state omits them', () => {
    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [
          { id: 'secondary_3', name: 'Secondary Battery', attack: 3, range: 2, defense: 3, status: 'ready', individuallyTargetable: true },
        ],
        treads: 45,
        batteries: { main: 1, secondary: 4, ap: 8 },
      },
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          position: { q: 1, r: 1 },
          status: 'operational',
          weapons: [],
        },
      },
    }

    const events = buildCombatEvents(
      10,
      { type: 'FIRE', attackers: ['secondary_3'], targetId: 'pigs-1' },
      {
        targetId: 'pigs-1',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        statusChanges: [{ unitId: 'pigs-1', from: 'operational', to: 'destroyed' }],
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      attackerFriendlyNames: ['Secondary Battery 3'],
      targetFriendlyName: 'Little Pigs 1',
    })
    expect(events[1]).toMatchObject({
      type: 'UNIT_STATUS_CHANGED',
      unitFriendlyName: 'Little Pigs 1',
      from: 'operational',
      to: 'destroyed',
    })
  })

  it('uses the weapon friendly name for weapon targets', () => {
    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [
          { id: 'ap_1', name: 'AP Gun', attack: 1, range: 1, defense: 1, status: 'ready', individuallyTargetable: true },
        ],
        treads: 45,
        batteries: { main: 1, secondary: 4, ap: 8 },
      },
      defenders: {
        'pigs-1': {
          id: 'pigs-1',
          type: 'LittlePigs',
          position: { q: 1, r: 1 },
          status: 'operational',
          weapons: [],
        },
      },
    }

    const events = buildCombatEvents(
      20,
      { type: 'FIRE', attackers: ['pigs-1'], targetId: 'ap_1' },
      {
        targetId: 'ap_1',
        roll: { roll: 1, result: 'NE', odds: '1:1' },
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      attackerFriendlyNames: ['Little Pigs 1'],
      targetFriendlyName: 'AP Gun 1',
    })
  })
})

describe('buildVictoryObjectiveStates', () => {
  it('marks each scenario-defined objective independently', () => {
    const scenarioSnapshot = {
      victoryConditions: {
        onion: {
          escapeHexes: [{ q: 2, r: 2 }],
        },
        objectives: [
          { id: 'destroy-swamp', label: 'Destroy The Swamp', kind: 'destroy-unit', unitType: 'Swamp', required: true },
          { id: 'escape-off-map', label: 'Escape off map', kind: 'escape-map', required: true },
        ],
      },
    }

    const scenarioMap = materializeScenarioMap({
      width: 3,
      height: 3,
      cells: [{ q: 0, r: 0 }],
      hexes: [],
    })

    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 2, r: 2 },
        status: 'operational',
        weapons: [],
        treads: 45,
        batteries: { main: 1, secondary: 4, ap: 8 },
      },
      defenders: {
        swamp: {
          id: 'swamp',
          type: 'Swamp',
          position: { q: 0, r: 0 },
          status: 'destroyed',
          weapons: [],
        },
      },
    }

    const objectives = buildVictoryObjectiveStates(scenarioSnapshot as any, scenarioMap, state, 2)

    expect(objectives).toEqual([
      {
        id: 'destroy-swamp',
        label: 'Destroy The Swamp',
        kind: 'destroy-unit',
        required: true,
        unitType: 'Swamp',
        completed: true,
      },
      {
        id: 'escape-off-map',
        label: 'Escape off map',
        kind: 'escape-map',
        required: true,
        completed: true,
      },
    ])
  })

  it('keeps escape objectives inactive on turn 1', () => {
    const scenarioSnapshot = {
      victoryConditions: {
        onion: {
          escapeHexes: [{ q: 2, r: 2 }],
        },
        objectives: [
          { id: 'destroy-swamp', label: 'Destroy The Swamp', kind: 'destroy-unit', unitType: 'Swamp', required: true },
          { id: 'escape-off-map', label: 'Escape off map', kind: 'escape-map', required: true },
        ],
      },
    }

    const scenarioMap = materializeScenarioMap({
      width: 3,
      height: 3,
      cells: [{ q: 0, r: 0 }],
      hexes: [],
    })

    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 2, r: 2 },
        status: 'operational',
        weapons: [],
        treads: 45,
        batteries: { main: 1, secondary: 4, ap: 8 },
      },
      defenders: {
        swamp: {
          id: 'swamp',
          type: 'Swamp',
          position: { q: 0, r: 0 },
          status: 'destroyed',
          weapons: [],
        },
      },
    }

    const objectives = buildVictoryObjectiveStates(scenarioSnapshot as any, scenarioMap, state, 1)

    expect(objectives).toEqual([
      {
        id: 'destroy-swamp',
        label: 'Destroy The Swamp',
        kind: 'destroy-unit',
        required: true,
        unitType: 'Swamp',
        completed: true,
      },
      {
        id: 'escape-off-map',
        label: 'Escape off map',
        kind: 'escape-map',
        required: true,
        completed: false,
      },
    ])
  })

  it('does not declare a winner until all required objectives are complete', () => {
    const scenarioMap = materializeScenarioMap({
      width: 3,
      height: 3,
      cells: [{ q: 0, r: 0 }],
      hexes: [],
    })

    const match = {
      scenarioSnapshot: {
        map: scenarioMap,
        victoryConditions: {
          onion: {
            escapeHexes: [{ q: 0, r: 0 }],
          },
          objectives: [
            { id: 'destroy-swamp', label: 'Destroy The Swamp', kind: 'destroy-unit', unitType: 'Swamp', required: true },
            { id: 'escape-off-map', label: 'Escape off map', kind: 'escape-map', required: true },
          ],
        },
      },
      players: { onion: 'onion-user', defender: 'defender-user' },
      winner: null,
      events: [],
    }

    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 1, r: 1 },
        status: 'operational',
        weapons: [],
        treads: 45,
        batteries: { main: 1, secondary: 4, ap: 8 },
      },
      defenders: {
        swamp: {
          id: 'swamp',
          type: 'Swamp',
          position: { q: 0, r: 0 },
          status: 'destroyed',
          weapons: [],
        },
      },
    }

    expect(computeWinnerUserId(match as any, state, 'ONION_MOVE', 1)).toBeNull()
  })

  it('declares defender victory when the Onion is immobilized before completing objectives', () => {
    const scenarioMap = materializeScenarioMap({
      width: 3,
      height: 3,
      cells: [{ q: 0, r: 0 }],
      hexes: [],
    })

    const match = {
      scenarioSnapshot: {
        map: scenarioMap,
        victoryConditions: {
          onion: {
            escapeHexes: [{ q: 0, r: 0 }],
          },
          objectives: [
            { id: 'destroy-swamp', label: 'Destroy The Swamp', kind: 'destroy-unit', unitType: 'Swamp', required: true },
            { id: 'escape-off-map', label: 'Escape off map', kind: 'escape-map', required: true },
          ],
        },
      },
      players: { onion: 'onion-user', defender: 'defender-user' },
      winner: null,
      events: [],
    }

    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 1, r: 1 },
        status: 'operational',
        weapons: [],
        treads: 0,
        batteries: { main: 1, secondary: 4, ap: 8 },
      },
      defenders: {
        swamp: {
          id: 'swamp',
          type: 'Swamp',
          position: { q: 0, r: 0 },
          status: 'operational',
          weapons: [],
        },
      },
    }

    expect(computeWinnerUserId(match as any, state, 'ONION_MOVE', 1)).toBe('defender-user')
  })
})
