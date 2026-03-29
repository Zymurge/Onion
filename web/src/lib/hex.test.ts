import { describe, expect, it } from 'vitest'

import { hexDistance, hexKey, hexesWithinRange } from './hex'

describe('hexDistance', () => {
  it('returns 0 for the same hex', () => {
    expect(hexDistance({ q: 3, r: 3 }, { q: 3, r: 3 })).toBe(0)
  })

  it('returns 1 for all six direct neighbors', () => {
    const origin = { q: 2, r: 2 }

    expect(hexDistance(origin, { q: 3, r: 2 })).toBe(1)
    expect(hexDistance(origin, { q: 1, r: 2 })).toBe(1)
    expect(hexDistance(origin, { q: 2, r: 3 })).toBe(1)
    expect(hexDistance(origin, { q: 2, r: 1 })).toBe(1)
    expect(hexDistance(origin, { q: 3, r: 1 })).toBe(1)
    expect(hexDistance(origin, { q: 1, r: 3 })).toBe(1)
  })

  it('is symmetric', () => {
    const a = { q: 1, r: 4 }
    const b = { q: 5, r: 2 }

    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
  })
})

describe('hexesWithinRange', () => {
  it('returns all hexes within range 2, excluding the origin by default', () => {
    const keys = hexesWithinRange({ q: 0, r: 0 }, 2).map(hexKey)

    expect(keys).toHaveLength(18)
    expect(keys).not.toContain('0,0')
    expect(new Set(keys)).toEqual(new Set([
      '-2,0', '-2,1', '-2,2',
      '-1,-1', '-1,0', '-1,1', '-1,2',
      '0,-2', '0,-1', '0,1', '0,2',
      '1,-2', '1,-1', '1,0', '1,1',
      '2,-2', '2,-1', '2,0',
    ]))
  })

  it('supports a minimum distance for annular overlays', () => {
    const coords = hexesWithinRange({ q: 0, r: 0 }, 3, 2)

    expect(coords).toHaveLength(30)
    expect(coords.some((coord) => hexDistance({ q: 0, r: 0 }, coord) === 1)).toBe(false)
    expect(coords.some((coord) => hexDistance({ q: 0, r: 0 }, coord) === 2)).toBe(true)
    expect(coords.some((coord) => hexDistance({ q: 0, r: 0 }, coord) === 3)).toBe(true)
  })

  it('returns an empty array when the requested range is invalid', () => {
    expect(hexesWithinRange({ q: 0, r: 0 }, 1, 2)).toEqual([])
  })
})