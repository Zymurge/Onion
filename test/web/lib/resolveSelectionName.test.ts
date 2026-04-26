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

  it('falls back to the group key when the snapshot has no matching group', () => {
    const stackNaming = {
      groupsInUse: [],
      usedGroupNames: [],
    }

    const name = resolveSelectionName({ kind: 'group', groupKey: 'G1', stackNaming })
    expect(name).toBe('G1')
  })

  it('returns friendlyName for unit selections', () => {
    const name = resolveSelectionName({ kind: 'unit', unitId: 'U1', unitType: 'Infantry', friendlyName: 'Piglet 2' })
    expect(name).toBe('Piglet 2')
  })

  it('builds friendly name from type and id', () => {
    const name = resolveSelectionName({ kind: 'unit', unitId: 'Infantry', unitType: 'Infantry' })
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('returns unitId if nothing else', () => {
    const name = resolveSelectionName({ kind: 'unit', unitId: 'U2' })
    expect(name).toBe('U2')
  })

  it('returns empty string if no info', () => {
    const name = resolveSelectionName({ kind: 'unit' })
    expect(name).toBe('')
  })
})
