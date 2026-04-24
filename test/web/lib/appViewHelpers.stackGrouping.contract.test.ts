import { describe, expect, it } from 'vitest'

import { countSelectedBattlefieldStackMembers, resolveBattlefieldStackMemberIds } from '#web/lib/appViewHelpers'

describe('appViewHelpers stack-grouping contract', () => {
  it('resolves stack members from explicit stackRoster membership instead of raw co-location', () => {
    const state = {
      defenders: {
        'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
        'pigs-2': { id: 'pigs-2', type: 'LittlePigs', position: { q: 5, r: 4 }, status: 'operational' },
      },
      stackRoster: {
        groupsById: {
          'stack-a': {
            groupName: 'Little Pigs group 1',
            unitType: 'LittlePigs',
            position: { q: 4, r: 4 },
            unitIds: ['pigs-1', 'pigs-2'],
          },
        },
      },
    }

    expect(resolveBattlefieldStackMemberIds(state as any, 'pigs-1')).toEqual(['pigs-1', 'pigs-2'])
  })

  it('counts selected stack members from explicit stackRoster membership', () => {
    const state = {
      defenders: {
        'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
        'pigs-2': { id: 'pigs-2', type: 'LittlePigs', position: { q: 5, r: 4 }, status: 'operational' },
      },
      stackRoster: {
        groupsById: {
          'stack-a': {
            groupName: 'Little Pigs group 1',
            unitType: 'LittlePigs',
            position: { q: 4, r: 4 },
            unitIds: ['pigs-1', 'pigs-2'],
          },
        },
      },
    }

    expect(countSelectedBattlefieldStackMembers(state as any, 'pigs-1', ['pigs-1', 'pigs-2'])).toBe(2)
  })
})
