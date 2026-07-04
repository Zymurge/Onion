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

function createBrokenStackState() {
  return {
    defenders: {
      'pigs-1': { id: 'pigs-1', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
      'pigs-2': { id: 'pigs-2', type: 'LittlePigs', position: { q: 4, r: 4 }, status: 'operational' },
    },
  }
}

function createSingletonStackState() {
  return {
    defenders: {
      'pigs-5': { id: 'pigs-5', type: 'LittlePigs', position: { q: 4, r: 8 }, status: 'operational' },
      'wolf-1': { id: 'wolf-1', type: 'BigBadWolf', position: { q: 6, r: 4 }, status: 'operational' },
    },
    stackRoster: {
      groupsById: {
        'LittlePigs:4,8': {
          groupName: 'Little Pigs group 2',
          unitType: 'LittlePigs',
          position: { q: 4, r: 8 },
          unitIds: ['pigs-5'],
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
    it('builds a MOVE action with movers when the active unit is a stack and members are selected', () => {
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
          type: 'MOVE',
          movers: ['pigs-2', 'pigs-1'],
          to: { q: 5, r: 4 },
          attemptRam: true,
        },
      })
    })

    it('builds a MOVE action with a single mover when the active unit is not a stack', () => {
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
          movers: ['wolf-1'],
          to: { q: 5, r: 4 },
        },
      })
    })

    it.each([
      ['multi-unit stack', createStackState(), 'pigs-1', { q: 5, r: 4 }],
      ['singleton stack', createSingletonStackState(), 'pigs-5', { q: 5, r: 8 }],
    ])('rejects empty stack submissions for %s instead of defaulting back to a direct move', (_, state, unitId, to) => {
      expect(buildMoveCommitAction({
        state,
        unitId,
        selectedUnitIds: [],
        to,
      })).toEqual({
        ok: false,
        reason: 'empty-selection',
      })
    })

    it('rejects stackable move submissions when stack data is missing instead of inferring movers', () => {
      const state = createBrokenStackState()

      expect(buildMoveCommitAction({
        state,
        unitId: 'pigs-1',
        selectedUnitIds: ['pigs-1'],
        to: { q: 5, r: 4 },
      })).toEqual({
        ok: false,
        reason: 'missing-stack-selection',
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

    it('rejects stackable combat submissions when stack data is missing instead of inferring attackers', () => {
      const state = createBrokenStackState()

      expect(buildCombatCommitAction({
        state,
        anchorUnitId: 'pigs-1',
        selectedUnitIds: ['pigs-1'],
        targetId: 'onion-1:treads',
      })).toEqual({
        ok: false,
        reason: 'missing-stack-selection',
      })
    })
  })
})
