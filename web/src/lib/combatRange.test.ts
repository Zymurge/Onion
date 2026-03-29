import { describe, expect, it } from 'vitest'

import { buildCombatRangeHexKeys } from './combatRange'

describe('buildCombatRangeHexKeys', () => {
  it('returns an empty set when no sources are selected', () => {
    expect(buildCombatRangeHexKeys([])).toEqual(new Set())
  })

  it('intersects overlapping ranges from multiple sources', () => {
    const keys = buildCombatRangeHexKeys(
      [
        { q: 0, r: 0, range: 4 },
        { q: 0, r: 0, range: 2 },
      ],
      { width: 10, height: 10 },
    )

    expect(keys.has('2,0')).toBe(true)
    expect(keys.has('3,0')).toBe(false)
    expect(keys.has('0,0')).toBe(false)
  })

  it('clips the range to the current board bounds', () => {
    const keys = buildCombatRangeHexKeys(
      [{ q: 0, r: 0, range: 2 }],
      { width: 2, height: 2 },
    )

    expect(keys).toEqual(new Set(['0,1', '1,0', '1,1']))
  })
})