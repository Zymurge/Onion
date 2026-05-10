import { resolveSelectionName } from '../../../web/lib/resolveSelectionName'
import { describe, it, expect } from 'vitest'

describe('resolveSelectionName', () => {
  it('resolves group label from snapshot for group selections', () => {
    const stackNaming = {
      groupsInUse: [
        { groupKey: 'G1', groupName: 'Bravo', unitType: 'Infantry' },
      ],
      usedGroupNames: ['Bravo'],
    }
    const name = resolveSelectionName({ kind: 'group', groupKey: 'G1', stackNaming })
    expect(name).toBe('Bravo')
  })

  it('throws when a group label is missing from snapshot metadata', () => {
    const stackNaming = {
      groupsInUse: [],
      usedGroupNames: [],
    }

    expect(() => resolveSelectionName({ kind: 'group', groupKey: 'G1', stackNaming })).toThrow('Missing stack label for group G1')
  })

  it('returns friendlyName for unit selections', () => {
    const name = resolveSelectionName({ kind: 'unit', unitId: 'U1', unitType: 'Infantry', friendlyName: 'Piglet 2' })
    expect(name).toBe('Piglet 2')
  })

  it('throws when unit friendly name is missing', () => {
    expect(() => resolveSelectionName({ kind: 'unit', unitId: 'U2' })).toThrow('Missing friendly name for unit U2')
  })
})
