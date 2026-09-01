import { describe, expect, it } from 'vitest'
import {
  resolveBattlefieldDisplayName,
  resolveBattlefieldFriendlyName,
} from '../../../web/lib/battlefieldNaming'
import { resolveBattlefieldStacksExpandable, shouldExpandBattlefieldStackGroup } from '../../../web/lib/stackSelection'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '../../../web/lib/sessionCatalog'
import type { DefenderUnit } from '#shared/types/index'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function makeTestUnit(overrides: Partial<DefenderUnit> = {}): DefenderUnit {
  return {
    unitId: 'pigs-1',
    typeId: 'LittlePigs',
    position: { q: 2, r: 2 },
    state: 'operational',
    side: 'defender',
    weapons: [],
    friendlyName: 'Little Pigs 1',
    role: 'defender',
    ...overrides,
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
      makeTestUnit(),
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
      makeTestUnit(),
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
      makeTestUnit(),
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
      makeTestUnit({ friendlyName: undefined }),
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
      makeTestUnit(),
      stackNaming,
      stackRoster,
      sessionCatalog,
    )

    expect(label).toBe('Little Pigs group 1')
  })

  it('falls back to the unit name for single units', () => {
    const label = resolveBattlefieldDisplayName(
      makeTestUnit({ unitId: 'puss-1', typeId: 'Puss', friendlyName: 'Puss 1', position: { q: 1, r: 1 } }),
    )

    expect(label).toBe('Puss 1')
  })

  const stackExpansionCases: ReadonlyArray<[string, Parameters<typeof resolveBattlefieldStacksExpandable>[0], boolean]> = [
    ['defender active movement can expand', { activeRole: 'defender', activeTurnActive: true, isCombatPhase: false, isMovementPhase: true }, true],
    ['defender active combat can expand', { activeRole: 'defender', activeTurnActive: true, isCombatPhase: true, isMovementPhase: false }, true],
    ['defender inactive cannot expand', { activeRole: 'defender', activeTurnActive: false, isCombatPhase: true, isMovementPhase: false }, false],
    ['onion active cannot expand', { activeRole: 'onion', activeTurnActive: true, isCombatPhase: false, isMovementPhase: true }, false],
    ['locked defender cannot expand', { activeRole: 'defender', activeTurnActive: true, isCombatPhase: false, isMovementPhase: false }, false],
  ]

  it.each(stackExpansionCases)('%s', (_, input, expected) => {
    expect(resolveBattlefieldStacksExpandable(input)).toBe(expected)
  })

  it.each([
    ['collapsed when expansion is disallowed', { memberCount: 3, selectedCount: 3, stacksExpandable: false }, false],
    ['collapsed when the group is not selected', { memberCount: 3, selectedCount: 0, stacksExpandable: true }, false],
    ['collapsed for single units', { memberCount: 1, selectedCount: 1, stacksExpandable: true }, false],
    ['expanded for selected expandable groups', { memberCount: 3, selectedCount: 3, stacksExpandable: true }, true],
  ])('%s', (_, input: Parameters<typeof shouldExpandBattlefieldStackGroup>[0], expected) => {
    expect(shouldExpandBattlefieldStackGroup(input)).toBe(expected)
  })
})
