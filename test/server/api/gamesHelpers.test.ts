import { describe, expect, it } from 'vitest'

import { buildCombatEvents, buildMoveEvents, buildVictoryObjectiveStates, computeWinnerUserId } from '#server/api/gamesHelpers'
import { materializeScenarioMap } from '#shared/scenarioMap'
import type { GameState } from '#shared/types/index'
import { buildGameStateResponse } from '#server/api/gamesHelpers'

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

  it('uses the declared stack name for stacked Little Pigs move events', () => {
    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [],
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
          squads: 3,
        },
      },
      stackNaming: {
        groupsInUse: [{ groupKey: 'LittlePigs:1,1', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' }],
        usedGroupNames: ['Little Pigs group 1'],
      },
    }

    const events = buildMoveEvents(
      40,
      'pigs-1',
      { type: 'MOVE', unitId: 'pigs-1', to: { q: 2, r: 2 } },
      {
        success: true,
        rammedUnitIds: [],
        destroyedUnits: [],
        treadDamage: 0,
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'UNIT_MOVED',
      unitFriendlyName: 'Little Pigs group 1',
      unitId: 'pigs-1',
    })
  })

  it('uses the declared stack name for stacked Little Pigs combat events', () => {
    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [
          { id: 'main', name: 'Main Gun', attack: 4, range: 3, defense: 4, status: 'ready', individuallyTargetable: true },
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
          squads: 3,
        },
      },
      stackNaming: {
        groupsInUse: [{ groupKey: 'LittlePigs:1,1', groupName: 'Little Pigs group 7', unitType: 'LittlePigs' }],
        usedGroupNames: ['Little Pigs group 7'],
      },
    }

    const events = buildCombatEvents(
      50,
      { type: 'FIRE', attackers: ['main'], targetId: 'pigs-1' },
      {
        targetId: 'pigs-1',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        statusChanges: [{ unitId: 'pigs-1', from: 'operational', to: 'destroyed' }],
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      targetFriendlyName: 'Little Pigs group 7',
    })
    expect(events[1]).toMatchObject({
      type: 'UNIT_STATUS_CHANGED',
      unitFriendlyName: 'Little Pigs group 7',
      from: 'operational',
      to: 'destroyed',
    })
  })

  it('uses the persisted stack name when one is available', () => {
    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [
          { id: 'main', name: 'Main Gun', attack: 4, range: 3, defense: 4, status: 'ready', individuallyTargetable: true },
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
          squads: 3,
        },
      },
      stackNaming: {
        groupsInUse: [{ groupKey: 'LittlePigs:1,1', groupName: 'Little Pigs group 7', unitType: 'LittlePigs' }],
        usedGroupNames: ['Little Pigs group 7'],
      },
    }

    const events = buildCombatEvents(
      51,
      { type: 'FIRE', attackers: ['main'], targetId: 'pigs-1' },
      {
        targetId: 'pigs-1',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        statusChanges: [{ unitId: 'pigs-1', from: 'operational', to: 'destroyed' }],
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      targetFriendlyName: 'Little Pigs group 7',
    })
  })

  it('includes unitFriendlyName on UNIT_SQUADS_LOST events', () => {
    const state: GameState = {
      onion: {
        id: 'onion-1',
        type: 'TheOnion',
        position: { q: 0, r: 0 },
        status: 'operational',
        weapons: [],
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
      30,
      { type: 'FIRE', attackers: ['onion-1'], targetId: 'pigs-1' },
      {
        targetId: 'pigs-1',
        roll: { roll: 3, result: 'D', odds: '1:1' },
        squadsLost: 1,
      },
      state,
    )

    expect(events[1]).toMatchObject({
      type: 'UNIT_SQUADS_LOST',
      unitId: 'pigs-1',
      unitFriendlyName: 'Little Pigs 1',
      amount: 1,
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

  it('serializes stackRoster in the game state response', () => {
    const response = buildGameStateResponse(
      {
        gameId: 1,
        scenarioId: 'scenario-1',
        scenarioSnapshot: { name: 'Scenario 1', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: 'TheOnion',
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'pigs-1': {
              id: 'pigs-1',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 1',
              weapons: [],
            },
            'pigs-2': {
              id: 'pigs-2',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 2',
              weapons: [],
            },
          },
          stackRoster: {
            groupsById: {
              'LittlePigs:4,4': {
                groupName: 'Little Pigs group 1',
                unitType: 'LittlePigs',
                position: { q: 4, r: 4 },
                units: [
                  { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
                  { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2' },
                ],
              },
            },
          },
        },
        events: [],
      },
      'defender-1',
    )

    expect(response.state.stackRoster).toMatchObject({
      groupsById: {
        'LittlePigs:4,4': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    })

    expect(response.state.stackRoster?.groupsById['LittlePigs:4,4']?.units).toBeUndefined()
  })

  it('keeps stack groups as metadata-only references with unitIds and no embedded unit detail copies', () => {
    const response = buildGameStateResponse(
      {
        gameId: 2,
        scenarioId: 'scenario-2',
        scenarioSnapshot: { name: 'Scenario 2', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: 'TheOnion',
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'pigs-1': {
              id: 'pigs-1',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              friendlyName: 'Little Pigs 1',
              weapons: [],
            },
            'pigs-2': {
              id: 'pigs-2',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              friendlyName: 'Little Pigs 2',
              weapons: [],
            },
          },
          stackRoster: {
            groupsById: {
              'LittlePigs:4,4': {
                groupName: 'Little Pigs group 1',
                unitType: 'LittlePigs',
                position: { q: 4, r: 4 },
                unitIds: ['pigs-1', 'pigs-2'],
                units: [
                  { id: 'pigs-1', status: 'operational', friendlyName: 'Little Pigs 1' },
                  { id: 'pigs-2', status: 'operational', friendlyName: 'Little Pigs 2' },
                ],
              },
            },
          },
        },
        events: [],
      },
      'defender-1',
    )

    const group = response.state.stackRoster?.groupsById['LittlePigs:4,4'] as unknown as { unitIds?: string[]; units?: unknown[] }
    expect(group.unitIds).toEqual(['pigs-1', 'pigs-2'])
    expect(group.units).toBeUndefined()
  })

  it('does not allow non-stackable defenders to be represented as stack groups in the response contract', () => {
    const response = buildGameStateResponse(
      {
        gameId: 3,
        scenarioId: 'scenario-3',
        scenarioSnapshot: { name: 'Scenario 3', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: 'TheOnion',
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'wolf-1': {
              id: 'wolf-1',
              type: 'BigBadWolf',
              position: { q: 6, r: 6 },
              status: 'operational',
              friendlyName: 'Big Bad Wolf 1',
              weapons: [],
            },
          },
          stackRoster: {
            groupsById: {
              'BigBadWolf:6,6': {
                groupName: 'Big Bad Wolf 1',
                unitType: 'BigBadWolf',
                position: { q: 6, r: 6 },
                unitIds: ['wolf-1'],
              },
            },
          },
        },
        events: [],
      },
      'defender-1',
    )

    expect(response.state.stackRoster?.groupsById['BigBadWolf:6,6']).toBeUndefined()
  })

  it('does not derive stackRoster from defender co-location when canonical stackRoster is absent', () => {
    const response = buildGameStateResponse(
      {
        gameId: 4,
        scenarioId: 'scenario-4',
        scenarioSnapshot: { name: 'Scenario 4', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: 'TheOnion',
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'pigs-1': {
              id: 'pigs-1',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              friendlyName: 'Little Pigs 1',
              weapons: [],
            },
            'pigs-2': {
              id: 'pigs-2',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              friendlyName: 'Little Pigs 2',
              weapons: [],
            },
          },
        },
        events: [],
      } as any,
      'defender-1',
    )

    expect(response.state.stackRoster).toEqual({ groupsById: {} })
  })

  it('omits legacy squads from defenders in API transport state', () => {
    const response = buildGameStateResponse(
      {
        gameId: 5,
        scenarioId: 'scenario-5',
        scenarioSnapshot: { name: 'Scenario 5', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: 'TheOnion',
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'pigs-1': {
              id: 'pigs-1',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              squads: 3,
              friendlyName: 'Little Pigs 1',
              weapons: [],
            },
          },
          stackRoster: {
            groupsById: {
              'LittlePigs:4,4': {
                groupName: 'Little Pigs group 1',
                unitType: 'LittlePigs',
                position: { q: 4, r: 4 },
                unitIds: ['pigs-1'],
              },
            },
          },
        },
        events: [],
      },
      'defender-1',
    )

    expect((response.state.defenders['pigs-1'] as { squads?: number }).squads).toBeUndefined()
  })

  it('throws when persisted stack group names disagree with canonical roster naming', () => {
    expect(() => buildGameStateResponse(
      {
        gameId: 6,
        scenarioId: 'scenario-6',
        scenarioSnapshot: { name: 'Scenario 6', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: 'TheOnion',
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'pigs-1': {
              id: 'pigs-1',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 1',
              weapons: [],
            },
            'pigs-2': {
              id: 'pigs-2',
              type: 'LittlePigs',
              position: { q: 4, r: 4 },
              status: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 2',
              weapons: [],
            },
          },
          stackRoster: {
            groupsById: {
              'LittlePigs:4,4': {
                groupName: 'Little Pigs group 99',
                unitType: 'LittlePigs',
                position: { q: 4, r: 4 },
                unitIds: ['pigs-1', 'pigs-2'],
              },
            },
          },
          stackNaming: {
            groupsInUse: [
              {
                groupKey: 'LittlePigs:4,4',
                groupName: '--CONFLICTING NAME---',
              },
            ],
          },
        },
        events: [],
      } as any,
      'onion-user',
    )).toThrow('Conflicting persisted stack group name for LittlePigs:4,4')
  })
})
