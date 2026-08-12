import { describe, expect, it } from 'vitest'
import {
  resolveBattlefieldDisplayName,
  resolveBattlefieldFriendlyName,
} from '../../../web/lib/battlefieldNaming'
import { resolveBattlefieldStacksExpandable, shouldExpandBattlefieldStackGroup } from '../../../web/lib/stackSelection'
import type { StackSourceUnit } from '../../../web/lib/stackSelection'
import { UnitStatus } from '#shared/types/index'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '../../../web/lib/sessionCatalog'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function createTestDefendersMap(): Record<string, StackSourceUnit> {
  return {
    'pigs-1': { unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 2, r: 2 }, state: 'operational' },
    'pigs-2': { unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 2, r: 2 }, state: 'operational' },
  }
}

describe('resolveBattlefieldDisplayName', () => {
  it('throws when grouped unit metadata is incomplete', () => {
      const stackRoster = {
      groupsById: {
        'LittlePigs:2,2': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 2, r: 2 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      }
    }

    expect(() => resolveBattlefieldFriendlyName(
      {
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 2 },
        state: 'operational',
        friendlyName: 'Little Pigs 1',
      },
      undefined,
      stackRoster,
      sessionCatalog,
    )).toThrow('Missing stackNaming for grouped unit pigs-1')
  })

  it('throws when grouped unit labels conflict between roster and naming', () => {
      const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:2,2', groupName: 'Little Pigs group 2', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 2'],
    }

    const stackRoster = {
      groupsById: {
        'LittlePigs:2,2': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 2, r: 2 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      }
    }

    expect(() => resolveBattlefieldFriendlyName(
      {
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 2 },
        state: 'operational',
        friendlyName: 'Little Pigs 1',
      },
      stackNaming,
      stackRoster,
      sessionCatalog,
    )).toThrow('Conflicting stacked-unit labels for pigs-1')
  })

  it('throws when grouped unit roster membership is missing from the canonical roster', () => {
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:2,2', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }

    const stackRoster = {
      groupsById: {},
    }

    expect(() => resolveBattlefieldFriendlyName(
      {
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 2 },
        state: 'operational',
        friendlyName: 'Little Pigs 1',
      },
      stackNaming,
      stackRoster,
      sessionCatalog,
    )).toThrow('Missing roster group for grouped unit pigs-1')
  })

  it('resolves a group label from canonical stack naming for a grouped map occupant', () => {
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:2,2', groupName: 'Little Pigs group', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group'],
    }

    const label = resolveBattlefieldDisplayName(
      {
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 2 },
        state: 'operational',
      },
      stackNaming,
    )

    expect(label).toBe('Little Pigs group')
  })

  it('resolves a group label for a stackable singleton roster group', () => {
      const stackNaming = {
      groupsInUse: [
        { groupKey: 'LittlePigs:2,2', groupName: 'Little Pigs group 1', unitType: 'LittlePigs' },
      ],
      usedGroupNames: ['Little Pigs group 1'],
    }

    const stackRoster = {
      groupsById: {
        'LittlePigs:2,2': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 2, r: 2 },
          unitIds: ['pigs-1'],
        },
      }
    }

    const label = resolveBattlefieldFriendlyName(
      {
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 2, r: 2 },
        state: 'operational',
        friendlyName: 'Little Pigs 1',
      },
      stackNaming,
      stackRoster,
      sessionCatalog,
    )

    expect(label).toBe('Little Pigs group 1')
  })

  it('falls back to the unit name for single units', () => {
    const label = resolveBattlefieldDisplayName({
      unitId: 'puss-1',
      typeId: 'Puss',
      friendlyName: 'Puss 1',
      position: { q: 1, r: 1 },
      state: 'operational',
    })

    expect(label).toBe('Puss 1')
  })

  it.each([
    ['defender active movement can expand', { activeRole: 'defender', activeTurnActive: true, isCombatPhase: false, isMovementPhase: true }, true],
    ['defender active combat can expand', { activeRole: 'defender', activeTurnActive: true, isCombatPhase: true, isMovementPhase: false }, true],
    ['defender inactive cannot expand', { activeRole: 'defender', activeTurnActive: false, isCombatPhase: true, isMovementPhase: false }, false],
    ['onion active cannot expand', { activeRole: 'onion', activeTurnActive: true, isCombatPhase: false, isMovementPhase: true }, false],
    ['locked defender cannot expand', { activeRole: 'defender', activeTurnActive: true, isCombatPhase: false, isMovementPhase: false }, false],
  ])('%s', (_, input, expected) => {
    expect(resolveBattlefieldStacksExpandable(input as any)).toBe(expected)
  })

  it.each([
    ['collapsed when expansion is disallowed', { memberCount: 3, selectedCount: 3, stacksExpandable: false }, false],
    ['collapsed when the group is not selected', { memberCount: 3, selectedCount: 0, stacksExpandable: true }, false],
    ['collapsed for single units', { memberCount: 1, selectedCount: 1, stacksExpandable: true }, false],
    ['expanded for selected expandable groups', { memberCount: 3, selectedCount: 3, stacksExpandable: true }, true],
  ])('%s', (_, input, expected) => {
    expect(shouldExpandBattlefieldStackGroup(input)).toBe(expected)
  })
})
