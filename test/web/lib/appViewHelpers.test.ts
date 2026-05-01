import { describe, expect, it } from 'vitest'
import {
  resolveBattlefieldDisplayName,
  resolveBattlefieldFriendlyName,
  resolveBattlefieldStacksExpandable,
  shouldExpandBattlefieldStackGroup,
} from '../../../web/lib/appViewHelpers'

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
      },
    }

    expect(() => resolveBattlefieldFriendlyName(
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        q: 2,
        r: 2,
        friendlyName: 'Little Pigs 1',
      },
      undefined,
      stackRoster,
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
      },
    }

    expect(() => resolveBattlefieldFriendlyName(
      {
        id: 'pigs-1',
        type: 'LittlePigs',
        q: 2,
        r: 2,
        friendlyName: 'Little Pigs 1',
      },
      stackNaming,
      stackRoster,
    )).toThrow('Conflicting stacked-unit labels for pigs-1')
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
        id: 'pigs-1',
        type: 'LittlePigs',
        q: 2,
        r: 2,
      },
      stackNaming,
    )

    expect(label).toBe('Little Pigs group')
  })

  it('falls back to the unit name for single units', () => {
    const label = resolveBattlefieldDisplayName({
      id: 'puss-1',
      type: 'Puss',
      friendlyName: 'Puss 1',
      q: 1,
      r: 1,
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
