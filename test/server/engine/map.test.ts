import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMap,
  getHex,
  isInBounds,
} from '#server/engine/map'
import type { GameMap } from '#server/engine/map'
import { getNeighbors, hexDistance } from '#shared/axialHex'
import logger from '#server/logger'

let warnSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  warnSpy.mockRestore()
})

// ─── Fixtures ─────────────────────────────────────────────────────────────────

/** 5×5 all-clear map */
function clearMap(): GameMap {
  return createMap(5, 5, [])
}

/**
 * 5×5 map with:
 *   (2,0) ridgeline  — vertical column to test crossing
 *   (2,1) ridgeline
 *   (2,2) crater     — always impassable
 */
function terrainMap(): GameMap {
  return createMap(5, 5, [
    { q: 2, r: 0, t: 1 }, // ridgeline
    { q: 2, r: 1, t: 1 }, // ridgeline
    { q: 2, r: 2, t: 2 }, // crater
  ])
}

function sparseMap(): GameMap {
  return {
    width: 5,
    height: 5,
    cells: [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 1, r: 1 },
      { q: 2, r: 1 },
    ],
    hexes: {
      '0,0': { q: 0, r: 0, terrain: 'clear' },
      '1,0': { q: 1, r: 0, terrain: 'clear' },
      '1,1': { q: 1, r: 1, terrain: 'clear' },
      '2,1': { q: 2, r: 1, terrain: 'clear' },
    },
  }
}

// ─── createMap ────────────────────────────────────────────────────────────────

describe('createMap', () => {
  it('sets width and height', () => {
    const map = createMap(15, 22, [])
    expect(map.width).toBe(15)
    expect(map.height).toBe(22)
  })

  it('all unspecified in-bounds hexes are clear', () => {
    const map = clearMap()
    expect(getHex(map, { q: 0, r: 0 })?.terrain).toBe('clear')
    expect(getHex(map, { q: 4, r: 4 })?.terrain).toBe('clear')
    expect(getHex(map, { q: 2, r: 3 })?.terrain).toBe('clear')
  })

  it('maps t:1 to ridgeline', () => {
    const map = createMap(5, 5, [{ q: 1, r: 1, t: 1 }])
    expect(getHex(map, { q: 1, r: 1 })?.terrain).toBe('ridgeline')
  })

  it('maps t:2 to crater', () => {
    const map = createMap(5, 5, [{ q: 1, r: 1, t: 2 }])
    expect(getHex(map, { q: 1, r: 1 })?.terrain).toBe('crater')
  })

  it('maps any other t value to clear', () => {
    const map = createMap(5, 5, [{ q: 1, r: 1, t: 3 }])
    expect(getHex(map, { q: 1, r: 1 })?.terrain).toBe('clear')
  })

  it('respects explicit cell membership when provided', () => {
    const map = createMap(5, 5, [], [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 1, r: 1 }])

    expect(isInBounds(map, { q: 1, r: 1 })).toBe(true)
    expect(isInBounds(map, { q: 4, r: 4 })).toBe(false)
  })
})
// ─── getHex ───────────────────────────────────────────────────────────────────

describe('getHex', () => {
  it('returns the hex at a valid position', () => {
    const map = terrainMap()
    const hex = getHex(map, { q: 2, r: 0 })
    expect(hex).not.toBeNull()
    expect(hex?.terrain).toBe('ridgeline')
    expect(hex?.q).toBe(2)
    expect(hex?.r).toBe(0)
  })

  it('returns a clear hex for in-bounds positions with no terrain override', () => {
    const map = clearMap()
    const hex = getHex(map, { q: 1, r: 1 })
    expect(hex?.terrain).toBe('clear')
  })

  it('returns null for negative coordinates', () => {
    getHex(clearMap(), { q: -1, r: 0 })
    expect(warnSpy).toHaveBeenCalledWith({ pos: { q: -1, r: 0 } }, expect.stringContaining('out of bounds'))
    getHex(clearMap(), { q: 0, r: -1 })
    expect(warnSpy).toHaveBeenCalledWith({ pos: { q: 0, r: -1 } }, expect.stringContaining('out of bounds'))
  })

  it('returns null when q >= width', () => {
    getHex(clearMap(), { q: 5, r: 0 })
    expect(warnSpy).toHaveBeenCalledWith({ pos: { q: 5, r: 0 } }, expect.stringContaining('out of bounds'))
  })

  it('returns null when r >= height', () => {
    getHex(clearMap(), { q: 0, r: 5 })
    expect(warnSpy).toHaveBeenCalledWith({ pos: { q: 0, r: 5 } }, expect.stringContaining('out of bounds'))
  })

  it('returns null for positions missing from map membership even when they are inside width and height', () => {
    const map = sparseMap()

    expect(isInBounds(map, { q: 3, r: 3 })).toBe(false)
    expect(getHex(map, { q: 3, r: 3 })).toBeNull()
    expect(warnSpy).toHaveBeenCalledWith({ pos: { q: 3, r: 3 } }, expect.stringContaining('out of bounds'))
  })
})
// ─── isInBounds ───────────────────────────────────────────────────────────────

describe('isInBounds', () => {
  it('returns true for positions within the map', () => {
    const map = createMap(15, 22, [])
    expect(isInBounds(map, { q: 0, r: 0 })).toBe(true)
    expect(isInBounds(map, { q: 14, r: 21 })).toBe(true)
    expect(isInBounds(map, { q: 7, r: 10 })).toBe(true)
  })

  it('returns false for negative coordinates', () => {
    expect(isInBounds(clearMap(), { q: -1, r: 0 })).toBe(false)
    expect(isInBounds(clearMap(), { q: 0, r: -1 })).toBe(false)
  })

  it('returns false at exactly width/height', () => {
    const map = createMap(5, 5, [])
    expect(isInBounds(map, { q: 5, r: 0 })).toBe(false)
    expect(isInBounds(map, { q: 0, r: 5 })).toBe(false)
  })

  it('returns false for positions absent from map membership', () => {
    const map = sparseMap()

    expect(isInBounds(map, { q: 0, r: 0 })).toBe(true)
    expect(isInBounds(map, { q: 2, r: 1 })).toBe(true)
    expect(isInBounds(map, { q: 3, r: 3 })).toBe(false)
  })
})

// ─── hexDistance ──────────────────────────────────────────────────────────────

describe('hexDistance', () => {
  it('returns 0 for the same hex', () => {
    expect(hexDistance({ q: 3, r: 3 }, { q: 3, r: 3 })).toBe(0)
  })

  it('returns 1 for all six direct neighbors', () => {
    const origin = { q: 2, r: 2 }
    // six axial directions
    expect(hexDistance(origin, { q: 3, r: 2 })).toBe(1)
    expect(hexDistance(origin, { q: 1, r: 2 })).toBe(1)
    expect(hexDistance(origin, { q: 2, r: 3 })).toBe(1)
    expect(hexDistance(origin, { q: 2, r: 1 })).toBe(1)
    expect(hexDistance(origin, { q: 3, r: 1 })).toBe(1)
    expect(hexDistance(origin, { q: 1, r: 3 })).toBe(1)
  })

  it('returns correct distance for further hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2)
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 3 })).toBe(3)
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3)
  })

  it('is symmetric', () => {
    const a = { q: 1, r: 4 }
    const b = { q: 5, r: 2 }
    expect(hexDistance(a, b)).toBe(hexDistance(b, a))
  })
})

// ─── getNeighbors ─────────────────────────────────────────────────────────────

describe('getNeighbors', () => {
  it('returns exactly 6 neighbors', () => {
    expect(getNeighbors({ q: 3, r: 3 })).toHaveLength(6)
  })

  it('all neighbors are at distance 1', () => {
    const pos = { q: 3, r: 3 }
    for (const n of getNeighbors(pos)) {
      expect(hexDistance(pos, n)).toBe(1)
    }
  })

  it('returns the correct 6 axial neighbor positions', () => {
    const neighbors = getNeighbors({ q: 0, r: 0 })
    const expected = [
      { q: 1, r: 0 }, { q: -1, r: 0 },
      { q: 0, r: 1 }, { q: 0, r: -1 },
      { q: 1, r: -1 }, { q: -1, r: 1 },
    ]
    for (const exp of expected) {
      expect(neighbors).toContainEqual(exp)
    }
  })
})
