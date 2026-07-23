import { describe, expect, it } from 'vitest'

import {
  makeDefender,
  makeGameState,
  makeOnion,
  makeStackNaming,
  makeStackRoster,
  makeWeapon,
} from './gameStateUtils'

describe('GameState test helpers', () => {
  it('creates canonical defaults for units and state', () => {
    const state = makeGameState()

    expect(state.onions['onion-1']).toEqual(makeOnion())
    expect(state.defenders).toEqual({})
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
      state: 'ready',
      ammo: 3,
    })
  })
})
