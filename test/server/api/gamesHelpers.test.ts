import { describe, expect, it } from 'vitest'

import { buildCombatEvents } from '#server/api/gamesHelpers'
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
