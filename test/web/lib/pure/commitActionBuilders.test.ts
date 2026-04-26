import { describe, expect, it } from 'vitest'

import {
  buildCombatCommitAction,
  buildEndPhaseCommitAction,
  buildMoveCommitAction,
} from '#web/lib/commitActionBuilders'

function createStackState() {
  return {
    defenders: {
      'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
      'pigs-2': { id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
      'wolf-1': { id: 'wolf-1', type: 'BigBadWolf', position: { q: 6, r: 4 }, status: 'operational' },
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
}

describe('commitActionBuilders', () => {
  describe('buildEndPhaseCommitAction', () => {
    it('returns the end-phase action directly', () => {
      expect(buildEndPhaseCommitAction()).toEqual({
        ok: true,
        action: { type: 'end-phase' },
      })
    })
  })

  describe('buildMoveCommitAction', () => {
    it('builds a MOVE_STACK action when the active unit is a stack and members are selected', () => {
      const state = createStackState()

      expect(buildMoveCommitAction({
        state,
        unitId: 'pigs-1',
        selectedUnitIds: ['pigs-2', 'pigs-1'],
        to: { q: 5, r: 4 },
        attemptRam: true,
      })).toEqual({
        ok: true,
        action: {
          type: 'MOVE_STACK',
          selection: {
            anchorUnitId: 'pigs-1',
            availableUnitIds: ['pigs-1', 'pigs-2'],
            selectedUnitIds: ['pigs-2', 'pigs-1'],
          },
          to: { q: 5, r: 4 },
          attemptRam: true,
        },
      })
    })

    it('builds a MOVE action when the active unit is not a stack', () => {
      const state = createStackState()

      expect(buildMoveCommitAction({
        state,
        unitId: 'wolf-1',
        selectedUnitIds: [],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: true,
        action: {
          type: 'MOVE',
          unitId: 'wolf-1',
          to: { q: 5, r: 4 },
        },
      })
    })

    it('rejects empty stack submissions instead of defaulting back to a direct move', () => {
      const state = createStackState()

      expect(buildMoveCommitAction({
        state,
        unitId: 'pigs-1',
        selectedUnitIds: [],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: false,
        reason: 'empty-selection',
      })
    })
  })

  describe('buildCombatCommitAction', () => {
    it('builds a FIRE action when the active unit is a stack and members are selected', () => {
      const state = createStackState()

      expect(buildCombatCommitAction({
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-2'],
        targetId: 'onion-1:treads',
      })).toEqual({
        ok: true,
        action: {
          type: 'FIRE',
          attackers: ['pigs-2'],
          targetId: 'onion-1:treads',
        },
      })
    })

    it('builds a FIRE action when the active unit is not a stack', () => {
      const state = createStackState()

      expect(buildCombatCommitAction({
        state,
        anchorUnitId: 'wolf-1',
        selectedUnitIds: ['wolf-1'],
        targetId: 'onion-1:treads',
      })).toEqual({
        ok: true,
        action: {
          type: 'FIRE',
          attackers: ['wolf-1'],
          targetId: 'onion-1:treads',
        },
      })
    })

    it('rejects combat submissions when the target is missing', () => {
      const state = createStackState()

      expect(buildCombatCommitAction({
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
})
