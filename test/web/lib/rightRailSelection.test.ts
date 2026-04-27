import { describe, expect, it } from 'vitest'

import {
  buildRightRailCombatAction,
  clearRightRailStackSelection,
  buildRightRailMoveAction,
  buildRightRailStackSubmissionAction,
  buildRightRailStackSelectionModel,
  buildRightRailStackSelectionViewModel,
  selectRightRailStackMembers,
  toggleRightRailStackMemberSelection,
} from '#web/lib/rightRailSelection'

function createStackState() {
  return {
    defenders: {
      'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
      'pigs-2': { id: 'pigs-2', type: 'LittlePigs', position: { q: 5, r: 4 }, status: 'operational' },
      'pigs-3': { id: 'pigs-3', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'destroyed' },
      'wolf-1': { id: 'wolf-1', type: 'BigBadWolf', position: { q: 6, r: 4 }, status: 'operational' },
    },
    stackRoster: {
      groupsById: {
        'stack-a': {
          groupName: 'Little Pigs group 1',
          unitType: 'LittlePigs',
          position: { q: 4, r: 4 },
          unitIds: ['pigs-1', 'pigs-2', 'pigs-3'],
        },
      },
    },
  }
}

describe('rightRailSelection', () => {
  describe('buildRightRailStackSelectionModel', () => {
    it('prefers explicit stack selection and reports the selected count within that stack', () => {
      const state = createStackState()

      expect(buildRightRailStackSelectionModel({
        state,
        inspectedUnitId: 'wolf-1',
        selectedStackUnitIds: ['pigs-2', 'pigs-1'],
        activeSelectedUnitIds: ['pigs-2'],
      })).toEqual({
        anchorUnitId: 'pigs-2',
        groupId: 'stack-a',
        memberUnitIds: ['pigs-2', 'pigs-1'],
        selectedUnitIds: ['pigs-2'],
        selectedCount: 1,
      })
    })

    it('falls back to canonical stack membership from the inspected unit', () => {
      const state = createStackState()

      expect(buildRightRailStackSelectionModel({
        state,
        inspectedUnitId: 'pigs-1',
        selectedStackUnitIds: ['pigs-1'],
        activeSelectedUnitIds: ['pigs-1', 'pigs-2', 'wolf-1'],
      })).toEqual({
        anchorUnitId: 'pigs-1',
        groupId: 'stack-a',
        memberUnitIds: ['pigs-1', 'pigs-2'],
        selectedUnitIds: ['pigs-1', 'pigs-2'],
        selectedCount: 2,
      })
    })

    it('returns an empty model when there is no active inspected or selected stack', () => {
      const state = createStackState()

      expect(buildRightRailStackSelectionModel({
        state,
        inspectedUnitId: null,
        selectedStackUnitIds: [],
        activeSelectedUnitIds: ['pigs-1'],
      })).toEqual({
        anchorUnitId: null,
        groupId: null,
        memberUnitIds: [],
        selectedUnitIds: [],
        selectedCount: 0,
      })
    })
  })

  describe('buildRightRailStackSelectionViewModel', () => {
    it('returns canonical stack member views from the roster instead of raw local clustering', () => {
      const state = createStackState()

      expect(buildRightRailStackSelectionViewModel({
        state,
        inspectedUnitId: 'pigs-1',
        selectedStackUnitIds: ['pigs-1'],
        activeSelectedUnitIds: ['pigs-1', 'pigs-2'],
        displayedDefenders: [
          { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
          { id: 'pigs-2', type: 'LittlePigs', position: { q: 5, r: 4 }, status: 'operational' },
          { id: 'wolf-1', type: 'BigBadWolf', position: { q: 6, r: 4 }, status: 'operational' },
        ],
        displayedOnion: null,
      })).toEqual({
        anchorUnitId: 'pigs-1',
        groupId: 'stack-a',
        memberUnitIds: ['pigs-1', 'pigs-2'],
        selectedUnitIds: ['pigs-1', 'pigs-2'],
        selectedCount: 2,
        selectedStackMembers: [
          { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
          { id: 'pigs-2', type: 'LittlePigs', position: { q: 5, r: 4 }, status: 'operational' },
        ],
        selectedStackSelectionCount: 2,
      })
    })
  })

  describe('buildRightRailMoveAction', () => {
    it('builds a MOVE action from the selected members of the active stack', () => {
      const state = createStackState()

      expect(buildRightRailMoveAction({
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-2', 'pigs-1', 'wolf-1'],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: true,
        action: {
          type: 'MOVE',
          movers: ['pigs-2', 'pigs-1'],
          to: { q: 5, r: 4 },
        },
      })
    })

    it('rejects empty stack move submissions instead of defaulting back to the full group', () => {
      const state = createStackState()

      expect(buildRightRailMoveAction({
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['wolf-1'],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: false,
        reason: 'empty-selection',
      })
    })
  })

  describe('buildRightRailCombatAction', () => {
    it('builds a FIRE action from the selected stack members and target', () => {
      const state = createStackState()

      expect(buildRightRailCombatAction({
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-2'],
        targetId: 'onion-1',
      })).toEqual({
        ok: true,
        action: {
          type: 'FIRE',
          attackers: ['pigs-2'],
          targetId: 'onion-1',
        },
      })
    })

    it('rejects combat submission when the target is missing', () => {
      const state = createStackState()

      expect(buildRightRailCombatAction({
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-1'],
        targetId: null,
      })).toEqual({
        ok: false,
        reason: 'missing-target',
      })
    })
  })

  describe('buildRightRailStackSubmissionAction', () => {
    it('builds a MOVE payload from normalized selected ids without re-deriving selection defaults', () => {
      const state = createStackState()

      expect(buildRightRailStackSubmissionAction({
        kind: 'move',
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-2', 'pigs-1'],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: true,
        action: {
          type: 'MOVE',
          movers: ['pigs-2', 'pigs-1'],
          to: { q: 5, r: 4 },
        },
      })
    })

    it('keeps a lone stack anchor selection scoped to that member', () => {
      const state = createStackState()

      expect(buildRightRailStackSubmissionAction({
        kind: 'move',
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-1'],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: true,
        action: {
          type: 'MOVE',
          movers: ['pigs-1'],
          to: { q: 5, r: 4 },
        },
      })
    })

    it('maps reloaded stack-member ids to their corresponding stack members', () => {
      const state = createStackState()

      expect(buildRightRailStackSubmissionAction({
        kind: 'combat',
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['stack-member:pigs-1:2'],
        targetId: 'onion-1',
      })).toEqual({
        ok: true,
        action: {
          type: 'FIRE',
          attackers: ['pigs-2'],
          targetId: 'onion-1',
        },
      })
    })

    it('rejects empty stack submissions instead of auto-filling the full group', () => {
      const state = createStackState()

      expect(buildRightRailStackSubmissionAction({
        kind: 'combat',
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: [],
        targetId: 'onion-1',
      })).toEqual({
        ok: false,
        reason: 'empty-selection',
      })
    })
  })

  describe('stack selection mutation helpers', () => {
    it('toggles only stack members while preserving the selected order', () => {
      expect(toggleRightRailStackMemberSelection(['pigs-1', 'wolf-1'], ['pigs-1', 'pigs-2'], 'pigs-2')).toEqual(['pigs-1', 'pigs-2'])
      expect(toggleRightRailStackMemberSelection(['pigs-1', 'pigs-2'], ['pigs-1', 'pigs-2'], 'pigs-1')).toEqual(['pigs-2'])
    })

    it('selects and clears stack membership explicitly', () => {
      expect(selectRightRailStackMembers(['pigs-2', 'pigs-1', 'pigs-2'])).toEqual(['pigs-2', 'pigs-1'])
      expect(clearRightRailStackSelection()).toEqual([])
    })
  })
})