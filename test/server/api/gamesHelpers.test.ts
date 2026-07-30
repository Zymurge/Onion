import { beforeEach, describe, expect, it } from 'vitest'

import { buildCombatEvents, buildMoveEvents, buildVictoryObjectiveStates, computeWinnerUserId } from '#server/api/gamesHelpers'
import { materializeScenarioMap } from '#shared/scenarioMap'
import type { GameState } from '#shared/types/index'
import { buildGameStateResponse } from '#server/api/gamesHelpers'
import { DEFAULT_ONION_UNIT_TYPE_ID } from '#shared/unitDefinitions'
import { makeDefender, makeGameState, makeOnion, makeStackGroup, makeStackRoster } from '#test/utils/gameStateUtils'

let state: GameState = makeGameState()

function makeGameStateWithUnits(): GameState {
  return makeGameState({
    onions: { 'onion-1': makeOnion() },
    defenders: {
      'pigs-1':  makeDefender({ unitId: 'pigs-1',  typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [] }),
      'pigs-2':  makeDefender({ unitId: 'pigs-2',  typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [] }),
      'swamp-1': makeDefender({ unitId: 'swamp-1', typeId: 'Swamp',      position: { q: 2, r: 2 }, weapons: [] }),
    },
    stackRoster: makeStackRoster({
      groupsById: {
        'LittlePigs:1,1': makeStackGroup({
          position: { q: 1, r: 1 },
          unitIds: ['pigs-1', 'pigs-2'],
        }),
      },
    }),
    stackNaming: {
      groupsInUse: [
        'LittlePigs:1,1',
      ],
    },
  })
}

beforeEach(() => {
  state = makeGameStateWithUnits()
})

describe('buildCombatEvents', () => {
  it('uses an explicit tread target identity and friendly label', () => {
    const events = buildCombatEvents(
      10,
      { type: 'FIRE', attackers: ['pigs-1'], targetId: 'onion-1:treads', onionId: 'onion-1' },
      {
        targetId: 'onion-1:treads',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        treadsLost: 2,
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      targetId: 'onion-1:treads',
      targetFriendlyName: 'The Onion 1 treads',
    })
    expect(events[1]).toMatchObject({
      type: 'ONION_TREADS_LOST',
      onionId: 'onion-1',
      targetId: 'onion-1:treads',
      targetFriendlyName: 'The Onion 1 treads',
      amount: 2,
    })
  })

  it('uses the weapon friendly name for weapon targets', () => {
    const events = buildCombatEvents(
      20,
      { type: 'FIRE', attackers: ['pigs-1'], targetId: 'ap_1', onionId: 'onion-1' },
      {
        targetId: 'ap_1',
        roll: { roll: 1, result: 'NE', odds: '1:1' },
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      attackerFriendlyNames: ['Little Pigs group 1'],
      targetFriendlyName: 'AP Gun 1',
    })
  })

  it('uses the declared stack name for each stack member move event', () => {
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

  it('recognizes any matching onion in the canonical onions map', () => {
    state = makeGameState({
      onions: {
        'onion-1': makeOnion(),
        'onion-2': makeOnion({ unitId: 'onion-2', friendlyName: 'The Onion 2', position: { q: 0, r: 1 } }),
      },
    })

    const events = buildMoveEvents(
      41,
      'onion-2',
      { type: 'MOVE', unitId: 'onion-2', to: { q: 0, r: 3 } },
      { success: true, rammedUnitIds: [], destroyedUnits: [], treadDamage: 0 },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'ONION_MOVED',
      unitFriendlyName: 'The Onion 2',
    })
    expect(events[0]).not.toHaveProperty('unitId')
    expect(events[0]).toMatchObject({ onionId: 'onion-2' })
  })

  it('uses the declared stack name for stacked Little Pigs combat events', () => {
    const events = buildCombatEvents(
      50,
      { type: 'FIRE', attackers: ['main'], targetId: 'pigs-1', onionId: 'onion-1' },
      {
        targetId: 'pigs-1',
        roll: { roll: 6, result: 'X', odds: '1:1' },
        statusChanges: [{ unitId: 'pigs-1', from: 'operational', to: 'destroyed' }],
      },
      state,
    )

    expect(events[0]).toMatchObject({
      type: 'FIRE_RESOLVED',
      targetFriendlyName: 'Little Pigs group 1',
    })
    expect(events[1]).toMatchObject({
      type: 'UNIT_STATUS_CHANGED',
      unitFriendlyName: 'Little Pigs group 1',
      from: 'operational',
      to: 'destroyed',
    })
  })

  it('includes unitFriendlyName on UNIT_SQUADS_LOST events', () => {
    const events = buildCombatEvents(
      30,
      { type: 'FIRE', attackers: ['onion-1'], targetId: 'pigs-1', onionId: 'onion-1' },
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
      unitFriendlyName: 'Little Pigs group 1',
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

    const objectives = buildVictoryObjectiveStates(scenarioSnapshot as any, scenarioMap, state, 2)

    expect(objectives).toEqual([
      {
        id: 'destroy-swamp',
        label: 'Destroy The Swamp',
        kind: 'destroy-unit',
        required: true,
        unitType: 'Swamp',
        completed: false,
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

    const objectives = buildVictoryObjectiveStates(scenarioSnapshot as any, scenarioMap, state, 1)

    expect(objectives).toEqual([
      {
        id: 'destroy-swamp',
        label: 'Destroy The Swamp',
        kind: 'destroy-unit',
        required: true,
        unitType: 'Swamp',
        completed: false,
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

    state.defenders['swamp-1'].state = 'destroyed'

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

    state.onions['onion-1'].treads = 0
    state.defenders['swamp-1'].state = 'destroyed'

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
        state: state,
        events: [],
      },
      'defender-1',
    )

    expect(response.state.stackRoster).toMatchObject({
      groupsById: {
        'LittlePigs:1,1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 1, r: 1 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    })

    expect(response.state.stackRoster?.groupsById['LittlePigs:1,1']).toMatchObject({
      groupName: 'Little Pigs group 1',
      unitType: 'LittlePigs',
      position: { q: 1, r: 1 },
      unitIds: ['pigs-1', 'pigs-2'],
    })
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
        state: state,
        events: [],
      },
      'defender-1',
    )

    const group = response.state.stackRoster?.groupsById['LittlePigs:1,1'] as unknown as { unitIds?: string[] }
    expect(group.unitIds).toEqual(['pigs-1', 'pigs-2'])
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
        state: state,
        events: [],
      },
      'defender-1',
    )

    expect(response.state.stackRoster?.groupsById['BigBadWolf:6,6']).toBeUndefined()
  })

  it('does not derive stackRoster from defender co-location when canonical stackRoster is absent', () => {
    state.stackRoster = makeStackRoster({ groupsById: {} })
    expect(() => buildGameStateResponse(
      {
        gameId: 4,
        scenarioId: 'scenario-4',
        scenarioSnapshot: { name: 'Scenario 4', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: state,
        events: [],
      } as any,
      'defender-1',
    )).toThrow('Invalid stack roster for response')
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
        state: state,
        events: [],
      },
      'defender-1',
    )

    expect((response.state.defenders['pigs-1'] as { squads?: number }).squads).toBeUndefined()
  })

  it('throws when persisted stack group names disagree with canonical roster naming', () => {
    state.stackNaming = {
      groupsInUse: [
        {
          groupKey: 'LittlePigs:1,1',
          groupName: '--CONFLICTING NAME---',
        },
      ],
    }
    expect(() => buildGameStateResponse(
      {
        gameId: 6,
        scenarioId: 'scenario-6',
        scenarioSnapshot: { name: 'Scenario 6', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: state,
        events: [],
      } as any,
      'onion-user',
    )).toThrow('Conflicting persisted stack group name for LittlePigs:1,1')
  })

  it('throws when a stackable defender is missing from all stack roster groups', () => {
    expect(() => buildGameStateResponse(
      {
        gameId: 7,
        scenarioId: 'scenario-7',
        scenarioSnapshot: { name: 'Scenario 7', map: { width: 1, height: 1, cells: [{ q: 0, r: 0 }], hexes: [{ q: 0, r: 0, t: 0 }] } },
        players: { onion: 'onion-1', defender: 'defender-1' },
        phase: 'DEFENDER_MOVE',
        turnNumber: 1,
        winner: null,
        state: {
          onion: {
            id: 'onion-1',
            type: DEFAULT_ONION_UNIT_TYPE_ID,
            position: { q: 0, r: 0 },
            status: 'operational',
            treads: 45,
            batteries: { main: 1, secondary: 1, ap: 1 },
            weapons: [],
          },
          defenders: {
            'pigs-1': {
              role: "defender",
              unitId: 'pigs-1',
              typeId: 'LittlePigs',
              position: { q: 4, r: 4 },
              state: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 1',
              weapons: [],
            },
            'pigs-2': {
              role: "defender",
              unitId: 'pigs-2',
              typeId: 'LittlePigs',
              position: { q: 4, r: 4 },
              state: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 2',
              weapons: [],
            },
            'pigs-5': {
              role: "defender",
              unitId: 'pigs-5',
              typeId: 'LittlePigs',
              position: { q: 4, r: 8 },
              state: 'operational',
              squads: 2,
              friendlyName: 'Little Pigs 5',
              weapons: [],
            },
          },
          stackRoster: makeStackRoster({
            groupsById: {
              'LittlePigs:4,4': makeStackGroup({
                position: { q: 4, r: 4 },
                unitIds: ['pigs-1', 'pigs-2'],
              }),
            },
          }),
        },
        events: [],
      } as any,
      'defender-1',
    )).toThrow('Invalid stack roster for response')
  })
})
