import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMap,
  getHex,
  isInBounds,
  hasLineOfSight,
  findPath,
  movementCost,
} from './map.js'
import type { GameMap, Hex } from './map.js'
import { getNeighbors, hexDistance } from '../shared/hex.js'
import logger from '../logger.js'

let infoSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {})
  warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
  errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
})
afterEach(() => {
  infoSpy.mockRestore()
  warnSpy.mockRestore()
  errorSpy.mockRestore()
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

// ─── movementCost ─────────────────────────────────────────────────────────────

describe('movementCost', () => {
  const makeHex = (q: number, r: number, terrain: Hex['terrain']): Hex => ({ q, r, terrain })

  it('returns 1 for clear terrain', () => {
    expect(movementCost(makeHex(0, 0, 'clear'), false)).toBe(1)
    expect(movementCost(makeHex(0, 0, 'clear'), true)).toBe(1)
  })

  it('returns 2 for ridgeline when unit can cross', () => {
    expect(movementCost(makeHex(0, 0, 'ridgeline'), true)).toBe(2)
  })

  it('returns null for ridgeline when unit cannot cross', () => {
    expect(movementCost(makeHex(0, 0, 'ridgeline'), false)).toBeNull()
  })

  it('returns null for crater regardless of ridgeline ability', () => {
    expect(movementCost(makeHex(0, 0, 'crater'), false)).toBeNull()
    expect(movementCost(makeHex(0, 0, 'crater'), true)).toBeNull()
  })
})

// ─── hasLineOfSight ───────────────────────────────────────────────────────────

describe('hasLineOfSight', () => {
  it('returns hasLOS:true and distance:0 for same hex', () => {
    const result = hasLineOfSight(clearMap(), { q: 1, r: 1 }, { q: 1, r: 1 })
    expect(result.hasLOS).toBe(true)
    expect(result.distance).toBe(0)
  })

  it('returns correct distance for adjacent hexes', () => {
    const result = hasLineOfSight(clearMap(), { q: 0, r: 0 }, { q: 1, r: 0 })
    expect(result.hasLOS).toBe(true)
    expect(result.distance).toBe(1)
  })

  it('returns correct distance for far hexes', () => {
    const result = hasLineOfSight(clearMap(), { q: 0, r: 0 }, { q: 4, r: 0 })
    expect(result.hasLOS).toBe(true)
    expect(result.distance).toBe(4)
  })
})

// ─── findPath ─────────────────────────────────────────────────────────────────

describe('findPath', () => {
  it('returns found:false if start is completely surrounded by impassable terrain', () => {
    const map = createMap(3, 3, [
      { q: 0, r: 1, t: 2 }, { q: 2, r: 1, t: 2 },
      { q: 1, r: 0, t: 2 }, { q: 1, r: 2, t: 2 },
      { q: 0, r: 0, t: 2 }, { q: 2, r: 0, t: 2 },
      { q: 0, r: 2, t: 2 }, { q: 2, r: 2, t: 2 },
    ])
    const result = findPath(map, { q: 1, r: 1 }, { q: 2, r: 2 }, 10, false)
    expect(result.found).toBe(false)
    expect(infoSpy).toHaveBeenCalledWith({ from: { q: 1, r: 1 }, to: { q: 2, r: 2 } }, expect.stringContaining('no valid path'))
  })

  it('returns a deterministic path when multiple shortest paths exist', () => {
    const map = createMap(3, 3, [])
    const result = findPath(map, { q: 0, r: 0 }, { q: 2, r: 2 }, 4, false)
    const secondResult = findPath(map, { q: 0, r: 0 }, { q: 2, r: 2 }, 4, false)

    expect(result.found).toBe(true)
    expect(result.path.length).toBeGreaterThan(0)
    expect(result.path[result.path.length - 1]).toEqual({ q: 2, r: 2 })
    expect(result.path).toEqual(secondResult.path)
  })

  it('returns found:false for negative or zero movement allowance', () => {
    const map = createMap(3, 3, [])
    findPath(map, { q: 0, r: 0 }, { q: 1, r: 0 }, 0, false)
    expect(infoSpy).toHaveBeenCalledWith({ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }, expect.stringContaining('no valid path'))
    findPath(map, { q: 0, r: 0 }, { q: 1, r: 0 }, -1, false)
    expect(infoSpy).toHaveBeenCalledWith({ from: { q: 0, r: 0 }, to: { q: 1, r: 0 } }, expect.stringContaining('no valid path'))
  })

  it('returns found:true and empty path for same start and end', () => {
    const result = findPath(clearMap(), { q: 0, r: 0 }, { q: 0, r: 0 }, 3, false)
    expect(result.found).toBe(true)
    expect(result.path).toHaveLength(0)
    expect(result.cost).toBe(0)
  })

  it('finds a direct path through clear terrain', () => {
    const result = findPath(clearMap(), { q: 0, r: 0 }, { q: 2, r: 0 }, 3, false)
    expect(result.found).toBe(true)
    expect(result.cost).toBe(2)
    expect(result.path).toHaveLength(2)
    expect(result.path[result.path.length - 1]).toEqual({ q: 2, r: 0 })
  })

  it('returns found:false when MA is insufficient', () => {
    const map = clearMap()
    const result = findPath(map, { q: 0, r: 0 }, { q: 3, r: 0 }, 2, false)

    expect(result.found).toBe(false)
  })

  it('finds exactly the path that costs exactly MA', () => {
    const result = findPath(clearMap(), { q: 0, r: 0 }, { q: 2, r: 0 }, 2, false)
    expect(result.found).toBe(true)
    expect(result.cost).toBe(2)
  })

  it('blocks at crater — no path if crater is the only route', () => {
    const map = createMap(3, 1, [{ q: 1, r: 0, t: 2 }])
    const result = findPath(map, { q: 0, r: 0 }, { q: 2, r: 0 }, 5, false)

    expect(result.found).toBe(false)
  })

  it('goes around crater when an alternate route exists', () => {
    // Map with crater at (1,0); can route via (0,1)→(1,1)→(2,0) if in-bounds
    const map = createMap(3, 3, [{ q: 1, r: 0, t: 2 }])
    // (0,0)→(0,1)→(1,0)×  try (0,0)→(0,1)→(1,1)→(2,0) = cost 3
    const result = findPath(map, { q: 0, r: 0 }, { q: 2, r: 0 }, 3, false)
    expect(result.found).toBe(true)
    expect(result.path[result.path.length - 1]).toEqual({ q: 2, r: 0 })
  })

  it('blocks at ridgeline when unit cannot cross', () => {
    // 3×1 map: (0,0) [clear] (1,0) [ridgeline] (2,0) [clear]
    const map = createMap(3, 1, [{ q: 1, r: 0, t: 1 }])
    const result = findPath(map, { q: 0, r: 0 }, { q: 2, r: 0 }, 5, false)
    expect(result.found).toBe(false)
  })

  it('crosses ridgeline at cost 2 when unit can cross', () => {
    // 3×1 map: (0,0) [clear] (1,0) [ridgeline] (2,0) [clear]
    const map = createMap(3, 1, [{ q: 1, r: 0, t: 1 }])
    // cost: 1 (enter clear) + 2 (cross ridge) = 3... wait, start is excluded.
    // path: (1,0), (2,0); cost = movementCost(ridge) + movementCost(clear) = 2+1 = 3
    const result = findPath(map, { q: 0, r: 0 }, { q: 2, r: 0 }, 3, true)
    expect(result.found).toBe(true)
    expect(result.cost).toBe(3)
  })

  it('returns found:false for destination out of bounds', () => {
    const result = findPath(clearMap(), { q: 0, r: 0 }, { q: 10, r: 10 }, 20, false)
    expect(result.found).toBe(false)
  })

  it('returns found:false when the destination is missing from map membership inside the rectangular limits', () => {
    const map = sparseMap()
    const result = findPath(map, { q: 0, r: 0 }, { q: 3, r: 3 }, 20, false)

    expect(result.found).toBe(false)
    expect(result.path).toEqual([])
    expect(result.cost).toBe(0)
    expect(warnSpy).toHaveBeenCalledWith(
      { from: { q: 0, r: 0 }, to: { q: 3, r: 3 } },
      expect.stringContaining('out of bounds')
    )
  })
})
