import { describe, expect, it } from 'vitest'

import { countSelectedBattlefieldStackGroups, countSelectedBattlefieldStackMembers, resolveBattlefieldStackMemberIds } from '#web/lib/stackSelection'
import type { WebStackSourceState } from '#web/lib/stackSelection'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

describe('stackSelection grouping contract', () => {
  it('resolves stack members from explicit stackRoster membership instead of raw co-location', () => {
    const state: WebStackSourceState = {
      catalog: sessionCatalog,
      defenders: {
        'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational' },
        'pigs-2': { unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 5, r: 4 }, state: 'operational' },
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

    expect(resolveBattlefieldStackMemberIds(state, 'pigs-1')).toEqual(['pigs-1', 'pigs-2'])
  })

  it('counts selected stack members from explicit stackRoster membership', () => {
    const state: WebStackSourceState = {
      catalog: sessionCatalog,
      defenders: {
        'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational' },
        'pigs-2': { unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 5, r: 4 }, state: 'operational' },
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

    expect(countSelectedBattlefieldStackMembers(state, 'pigs-1', ['pigs-1', 'pigs-2'])).toBe(2)
  })

  it('returns zero selected stack members when nothing is selected', () => {
    const state: WebStackSourceState = {
      catalog: sessionCatalog,
      defenders: {
        'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational' },
        'pigs-2': { unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 5, r: 4 }, state: 'operational' },
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

    expect(countSelectedBattlefieldStackMembers(state, 'pigs-1', [])).toBe(0)
  })

  it('counts distinct selected stack groups instead of raw unit ids', () => {
    const state: WebStackSourceState = {
      catalog: sessionCatalog,
      defenders: {
        'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational' },
        'pigs-2': { unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 5, r: 4 }, state: 'operational' },
        'wolf-1': { unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 6, r: 4 }, state: 'operational' },
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

    expect(countSelectedBattlefieldStackGroups(state, ['pigs-1', 'pigs-2', 'wolf-1'])).toBe(2)
  })

  it('throws when stackable unit membership is requested without a stack roster', () => {
    const state: WebStackSourceState = {
      catalog: sessionCatalog,
      defenders: {
        'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational' },
        'pigs-2': { unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 5, r: 4 }, state: 'operational' },
      },
    }

    expect(() => resolveBattlefieldStackMemberIds(state, 'pigs-1')).toThrow('Missing stackRoster for grouped unit pigs-1')
  })

    it('throws when a grouped unit is absent from defenders', () => {
      const state: WebStackSourceState = {
        catalog: sessionCatalog,
        defenders: {
          'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 }, state: 'operational' },
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

      expect(() => resolveBattlefieldStackMemberIds(state, 'pigs-1')).toThrow(/missing.*pigs-2/i)
    })
})
