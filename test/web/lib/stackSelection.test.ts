import { describe, expect, it } from 'vitest'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'
import {
  buildClientStackSelection,
  buildWebStackSourceState,
  countSelectedBattlefieldStackGroups,
  countSelectedBattlefieldStackMembers,
  resolveBattlefieldStackMemberIds,
  resolveBattlefieldStacksExpandable,
  type WebStackSourceState,
} from '../../../web/lib/stackSelection'

const catalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function createStackSourceState(overrides: Partial<WebStackSourceState> = {}): WebStackSourceState {
  return {
    onions: {
      'onion-1': {
        unitId: 'onion-1',
        typeId: 'TheOnion',
        position: { q: 0, r: 0 },
        state: 'operational',
      },
    },
    defenders: {
      'pigs-1': {
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 1, r: 1 },
        state: 'operational',
      },
      'pigs-2': {
        unitId: 'pigs-2',
        typeId: 'LittlePigs',
        position: { q: 1, r: 1 },
        state: 'operational',
      },
      'wolf-1': {
        unitId: 'wolf-1',
        typeId: 'BigBadWolf',
        position: { q: 2, r: 2 },
        state: 'operational',
      },
    },
    stackRoster: {
      groupsById: {
        'LittlePigs:1,1': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 1, r: 1 },
          unitIds: ['pigs-1', 'pigs-2'],
        },
      },
    },
    catalog,
    ...overrides,
  }
}

describe('stackSelection', () => {
  it('allows active defenders to expand stacks during movement or combat', () => {
    expect(resolveBattlefieldStacksExpandable({
      activeRole: 'defender',
      activeTurnActive: true,
      isCombatPhase: true,
      isMovementPhase: false,
    })).toBe(true)
  })

  it('resolves canonical active stack members and selection counts', () => {
    const state = createStackSourceState()

    expect(resolveBattlefieldStackMemberIds(state, 'pigs-1')).toEqual(['pigs-1', 'pigs-2'])
    expect(resolveBattlefieldStackMemberIds(state, 'wolf-1')).toEqual(['wolf-1'])
    expect(resolveBattlefieldStackMemberIds(state, 'onion-1')).toEqual(['onion-1'])
    expect(countSelectedBattlefieldStackMembers(state, 'pigs-1', ['pigs-1'])).toBe(1)
    expect(countSelectedBattlefieldStackGroups(state, ['pigs-1', 'pigs-2', 'wolf-1'])).toBe(2)
  })

  it('builds a filtered client stack selection and defaults empty selections to all members', () => {
    const state = createStackSourceState()

    expect(buildClientStackSelection(state, null, [])).toBeNull()
    expect(buildClientStackSelection(state, 'wolf-1', ['wolf-1'])).toBeNull()
    expect(buildClientStackSelection(state, 'pigs-1', ['pigs-2', 'missing'])).toEqual({
      anchorUnitId: 'pigs-1',
      availableUnitIds: ['pigs-1', 'pigs-2'],
      selectedUnitIds: ['pigs-2'],
    })
    expect(buildClientStackSelection(state, 'pigs-1', ['missing'])).toEqual({
      anchorUnitId: 'pigs-1',
      availableUnitIds: ['pigs-1', 'pigs-2'],
      selectedUnitIds: ['pigs-1', 'pigs-2'],
    })
  })

  it('reports canonical roster failures instead of inferring stack membership', () => {
    const missingRoster = createStackSourceState({ stackRoster: undefined })
    const missingGroup = createStackSourceState({
      stackRoster: { groupsById: {} },
    })

    expect(() => resolveBattlefieldStackMemberIds(missingRoster, 'pigs-1')).toThrow('Missing stackRoster for grouped unit pigs-1')
    expect(() => resolveBattlefieldStackMemberIds(missingGroup, 'pigs-1')).toThrow('Missing stackRoster entry for grouped unit pigs-1')
  })

  it('does not return destroyed members as active stack selections', () => {
    const state = createStackSourceState({
      defenders: {
        ...createStackSourceState().defenders,
        'pigs-2': {
          ...createStackSourceState().defenders?.['pigs-2'],
          state: 'destroyed',
        },
      },
    })

    expect(resolveBattlefieldStackMemberIds(state, 'pigs-1')).toEqual(['pigs-1'])
  })

  it('expands stacks only for the active defender in movement or combat', () => {
    for (const phase of [{ isCombatPhase: true, isMovementPhase: false }, { isCombatPhase: false, isMovementPhase: true }]) {
      expect(resolveBattlefieldStacksExpandable({
        activeRole: 'defender',
        activeTurnActive: true,
        ...phase,
      })).toBe(true)
    }

    expect(resolveBattlefieldStacksExpandable({
      activeRole: 'onion',
      activeTurnActive: true,
      isCombatPhase: true,
      isMovementPhase: true,
    })).toBe(false)
    expect(resolveBattlefieldStacksExpandable({
      activeRole: 'defender',
      activeTurnActive: false,
      isCombatPhase: true,
      isMovementPhase: true,
    })).toBe(false)
  })

  it('builds web stack source data from authoritative game state', () => {
    const source = buildWebStackSourceState({
      onions: {},
      defenders: {},
      stackNaming: undefined as never,
      stackRoster: { groupsById: {} },
      currentPhase: 'DEFENDER_MOVE',
      turn: 1,
    }, catalog)

    expect(source).toMatchObject({ onions: {}, defenders: {}, stackRoster: { groupsById: {} }, catalog })
  })
})