import { describe, expect, it } from 'vitest'

import { buildCombatRangeHexKeys } from '#web/lib/combatRange'

describe('buildCombatRangeHexKeys', () => {
  it('returns an empty set when no sources are selected', () => {
    expect(buildCombatRangeHexKeys([])).toEqual(new Set())
  })

  it('intersects overlapping ranges from multiple sources', () => {
    const keys = buildCombatRangeHexKeys(
      [
        { q: 1, r: 1, range: 1 },
        { q: 1, r: 1, range: 1 },
      ],
      { width: 3, height: 3, cells: Array.from({ length: 3 }, (_, r) => Array.from({ length: 3 }, (_, q) => ({ q, r }))).flat() },
    )

    expect(keys).toEqual(new Set([
      '0,1', '0,2',
      '1,0', '1,2',
      '2,0', '2,1',
    ]))
  })

  it('clips the range to the current board bounds', () => {
    const keys = buildCombatRangeHexKeys(
      [{ q: 0, r: 0, range: 2 }],
      { width: 2, height: 2, cells: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 0 }, { q: 1, r: 1 }] },
    )

    expect(keys).toEqual(new Set(['0,1', '1,0', '1,1']))
  })
})