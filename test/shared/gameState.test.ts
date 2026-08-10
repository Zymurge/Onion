import { describe, expect, it } from 'vitest'

import {
  makeDefender,
  makeGameState,
  makeOnion,
  makeStackFixture,
  makeStackNaming,
  makeStackRoster,
  makeWeapon,
} from '#test/utils/gameStateUtils'

describe('GameState test helpers', () => {
  it('creates canonical defaults for units and state', () => {
    const state = makeGameState()

    expect(state.onions['onion-1']).toEqual(makeOnion())
    expect(Object.keys(state.defenders)).toEqual(['swamp-1', 'pigs-1', 'pigs-2', 'puss-1'])
    expect(state.stackNaming).toEqual(makeStackNaming())
    expect(state.stackRoster).toEqual(makeStackRoster())
    expect(state.currentPhase).toBe('ONION_COMBAT')
    expect(state.turn).toBe(1)
  })

  it('allows concise overrides at each setup level', () => {
    const rosterGroup = {
      groupName: 'Little Pigs group 1',
      unitType: 'LittlePigs',
      position: { q: 4, r: 4 },
      unitIds: ['pigs-1', 'pigs-2'],
    }

    const state = makeGameState({
      onions: { 'onion-1': makeOnion({ treads: 12 }) },
      defenders: { 'pigs-1': makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs' }) },
      stackNaming: makeStackNaming({ usedGroupNames: [rosterGroup.groupName] }),
      stackRoster: makeStackRoster({ groupsById: { 'LittlePigs:4,4': rosterGroup } }),
      currentPhase: 'DEFENDER_MOVE',
      turn: 4,
    })

    expect(state.onions['onion-1'].treads).toBe(12)
    expect(state.defenders['pigs-1'].typeId).toBe('LittlePigs')
    expect(state.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1'])
    expect(state.stackRoster.groupsById['LittlePigs:4,4'].unitIds).toEqual(['pigs-1', 'pigs-2'])
    expect(state.currentPhase).toBe('DEFENDER_MOVE')
    expect(state.turn).toBe(4)
  })

  it('allows weapon defaults to be overridden without rebuilding the object', () => {
    expect(makeWeapon({ id: 'missile', typeId: 'TheOnion.secondary_1', ammo: 3 })).toEqual({
      id: 'missile',
      typeId: 'TheOnion.secondary_1',
      weaponClass: 'secondary',
      state: 'ready',
      friendlyName: 'Main Weapon 1',
      ammo: 3,
    })
  })

  it('derives defenders, roster, and naming from stack groups', () => {
    const fixture = makeStackFixture({
      groups: {
        'stack-1': {
          groupName: 'Little Pigs group 4',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-7', 'pigs-8'],
        },
      },
      unitOverrides: {
        'pigs-7': { state: 'disabled', friendlyName: 'Damaged Pig 7' },
      },
    })

    expect(fixture.defenders['pigs-7']).toMatchObject({
      unitId: 'pigs-7',
      typeId: 'LittlePigs',
      position: { q: 4, r: 4 },
      state: 'disabled',
      friendlyName: 'Damaged Pig 7',
    })
    expect(fixture.defenders['pigs-8']).toMatchObject({
      unitId: 'pigs-8',
      typeId: 'LittlePigs',
      position: { q: 4, r: 4 },
    })
    expect(fixture.stackRoster.groupsById['stack-1']?.unitIds).toEqual(['pigs-7', 'pigs-8'])
    expect(fixture.stackNaming).toEqual({
      groupsInUse: [{ groupKey: 'LittlePigs:4,4', groupName: 'Little Pigs group 4', unitType: 'LittlePigs' }],
      usedGroupNames: ['Little Pigs group 4'],
    })
  })

  it('merges stack fixture output into preexisting game state data', () => {
    const baseState = makeGameState()
    const fixture = makeStackFixture({
      groups: {
        'stack-2': {
          groupName: 'Little Pigs group 2',
          unitType: 'LittlePigs',
          position: { q: 2, r: 2 },
          unitIds: ['pigs-3'],
        },
      },
      base: baseState,
    })
    const state = makeGameState({ ...fixture, currentPhase: 'DEFENDER_MOVE' })

    expect(state.defenders['pigs-1']).toBeDefined()
    expect(state.defenders['pigs-3']).toMatchObject({ position: { q: 2, r: 2 } })
    expect(state.stackRoster.groupsById['LittlePigs:1,1']?.unitIds).toEqual(['pigs-1', 'pigs-2'])
    expect(state.stackRoster.groupsById['stack-2']?.unitIds).toEqual(['pigs-3'])
    expect(state.stackNaming.usedGroupNames).toEqual(['Little Pigs group 1', 'Little Pigs group 2'])
    expect(state.currentPhase).toBe('DEFENDER_MOVE')
  })
})
