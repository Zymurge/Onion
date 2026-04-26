import { describe, expect, it } from 'vitest'
import { resolveBattlefieldDisplayName } from '../../../web/lib/appViewHelpers'

describe('resolveBattlefieldDisplayName', () => {
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
})
