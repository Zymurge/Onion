import { describe, expect, it } from 'vitest'

import { resolveActionSubject, type ActionSubjectReference } from '#shared/actionSubject'
import { makeDefender, makeGameState } from '#test/utils/gameStateUtils'

describe('action subjects', () => {
  it('resolves any individual unit through the common subject shape', () => {
    const state = makeGameState({
      defenders: {
        'pigs-1': makeDefender({
          unitId: 'pigs-1',
          typeId: 'LittlePigs',
          friendlyName: 'Little Pigs 1',
          position: { q: 1, r: 1 },
        }),
        'puss-1': makeDefender({
          unitId: 'puss-1',
          typeId: 'Puss',
          friendlyName: 'Puss 1',
          position: { q: 2, r: 0 },
        }),
      },
      stackRoster: { groupsById: {}, nextGroupOrdinal: 1 },
    })

    const references: ActionSubjectReference[] = [
      { kind: 'unit', id: 'puss-1' },
      { kind: 'unit', id: 'pigs-1' },
    ]

    expect(references.map((reference) => resolveActionSubject(state, reference))).toEqual([
      {
        id: 'puss-1',
        kind: 'unit',
        typeId: 'Puss',
        position: { q: 2, r: 0 },
        label: 'Puss 1',
        size: 1,
        memberUnitIds: ['puss-1'],
      },
      {
        id: 'pigs-1',
        kind: 'unit',
        typeId: 'LittlePigs',
        position: { q: 1, r: 1 },
        label: 'Little Pigs 1',
        size: 1,
        memberUnitIds: ['pigs-1'],
      },
    ])
  })

  it('resolves a stack from its group ID and roster membership', () => {
    const state = makeGameState({
      defenders: {
        'pigs-1': makeDefender({
          unitId: 'pigs-1',
          typeId: 'LittlePigs',
          friendlyName: 'Little Pigs 1',
          position: { q: 8, r: 8 },
        }),
        'pigs-2': makeDefender({
          unitId: 'pigs-2',
          typeId: 'LittlePigs',
          friendlyName: 'Little Pigs 2',
          position: { q: 8, r: 8 },
        }),
      },
      stackRoster: {
        nextGroupOrdinal: 43,
        groupsById: {
          'group-42': {
            groupName: 'Little Pigs 1',
            unitType: 'LittlePigs',
            position: { q: 4, r: 2 },
            unitIds: ['pigs-1', 'pigs-2'],
          },
        },
      },
    })

    expect(resolveActionSubject(state, { kind: 'group', id: 'group-42' })).toEqual({
      id: 'group-42',
      kind: 'group',
      typeId: 'LittlePigs',
      position: { q: 4, r: 2 },
      label: 'Little Pigs 1',
      size: 2,
      memberUnitIds: ['pigs-1', 'pigs-2'],
    })

    expect(resolveActionSubject(state, { kind: 'unit', id: 'pigs-1' })).toMatchObject({
      id: 'pigs-1',
      kind: 'unit',
      typeId: 'LittlePigs',
      size: 1,
      memberUnitIds: ['pigs-1'],
    })
  })

  it('does not infer a stack from units that merely share a position', () => {
    const state = makeGameState({
      defenders: {
        'pigs-1': makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 2 } }),
        'pigs-2': makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 4, r: 2 } }),
      },
      stackRoster: { groupsById: {}, nextGroupOrdinal: 1 },
    })

    expect(() => resolveActionSubject(state, { kind: 'group', id: 'group-42' })).toThrow("Action subject group 'group-42' not found")
  })
})
