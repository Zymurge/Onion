import { describe, expect, it } from 'vitest'
import { resolveBattlefieldDisplayName } from '../../../web/lib/battlefieldNaming'

describe('battlefieldNaming', () => {
  it('falls back to the unit name for an ungrouped unit', () => {
    expect(resolveBattlefieldDisplayName({
      id: 'puss-1',
      type: 'Puss',
      friendlyName: 'Puss 1',
      q: 1,
      r: 1,
    })).toBe('Puss 1')
  })
})