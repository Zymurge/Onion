/**
 * Hex grid and terrain management for the Onion game engine.
 *
 * Provides utilities for working with hexagonal grids, terrain effects,
 * line-of-sight calculations, and movement pathfinding.
 */

import type { HexPos } from '../types/index.js'

/**
 * Terrain types that can exist on hexes.
 */
export type TerrainType = 'clear' | 'ridgeline' | 'crater'

/**
 * A hex on the game map with position and terrain.
 */
export interface Hex extends HexPos {
  /** Terrain type of this hex */
  terrain: TerrainType
}

/**
 * A game map consisting of a collection of hexes.
 */
export interface GameMap {
  /** Width of the map in hexes */
  width: number
  /** Height of the map in hexes */
  height: number
  /** All hexes on the map, keyed by "q,r" coordinates */
  hexes: Record<string, Hex>
}

/**
 * Result of a line-of-sight check between two hexes.
 */
export interface LineOfSightResult {
  /** Whether line of sight exists */
  hasLOS: boolean
  /** Distance in hexes between the positions */
  distance: number
}

/**
 * Result of a pathfinding operation.
 */
export interface PathResult {
  /** Whether a valid path exists */
  found: boolean
  /** The hexes in the path (excluding start, including end) */
  path: HexPos[]
  /** Total movement cost of the path */
  cost: number
}

function hexKey(pos: HexPos): string {
  return `${pos.q},${pos.r}`
}

function terrainFromT(t: number): TerrainType {
  if (t === 1) return 'ridgeline'
  if (t === 2) return 'crater'
  return 'clear'
}

export function createMap(width: number, height: number, hexes: Array<{ q: number; r: number; t: number }>): GameMap {
  const overrides = new Map(hexes.map(h => [hexKey(h), terrainFromT(h.t)]))
  const record: Record<string, Hex> = {}
  for (let q = 0; q < width; q++) {
    for (let r = 0; r < height; r++) {
      const pos = { q, r }
      const key = hexKey(pos)
      record[key] = { q, r, terrain: overrides.get(key) ?? 'clear' }
    }
  }
  return { width, height, hexes: record }
}

export function getHex(map: GameMap, pos: HexPos): Hex | null {
  if (!isInBounds(map, pos)) return null
  return map.hexes[hexKey(pos)] ?? null
}

export function isInBounds(map: GameMap, pos: HexPos): boolean {
  return pos.q >= 0 && pos.q < map.width && pos.r >= 0 && pos.r < map.height
}

export function hexDistance(a: HexPos, b: HexPos): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

const AXIAL_DIRECTIONS: readonly HexPos[] = [
  { q: 1, r: 0 }, { q: -1, r: 0 },
  { q: 0, r: 1 }, { q: 0, r: -1 },
  { q: 1, r: -1 }, { q: -1, r: 1 },
]

export function getNeighbors(pos: HexPos): HexPos[] {
  return AXIAL_DIRECTIONS.map(d => ({ q: pos.q + d.q, r: pos.r + d.r }))
}

export function movementCost(hex: Hex, canCrossRidgelines: boolean): number | null {
  if (hex.terrain === 'crater') return null
  if (hex.terrain === 'ridgeline') return canCrossRidgelines ? 2 : null
  return 1
}

export function hasLineOfSight(map: GameMap, from: HexPos, to: HexPos): LineOfSightResult {
  // Standard OGRE rules: no terrain-based LOS blocking, purely range-based
  return { hasLOS: true, distance: hexDistance(from, to) }
}

export function findPath(
  map: GameMap,
  from: HexPos,
  to: HexPos,
  movementAllowance: number,
  canCrossRidgelines: boolean
): PathResult {
  if (!isInBounds(map, to)) return { found: false, path: [], cost: 0 }
  if (from.q === to.q && from.r === to.r) return { found: true, path: [], cost: 0 }

  // Dijkstra over the hex grid
  type Node = { pos: HexPos; cost: number; prev: HexPos | null }
  const dist = new Map<string, number>()
  const prev = new Map<string, HexPos | null>()
  // Min-heap via sorted insertion — map is small enough
  const queue: Array<{ pos: HexPos; cost: number }> = [{ pos: from, cost: 0 }]
  dist.set(hexKey(from), 0)

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost)
    const { pos, cost } = queue.shift()!

    if (pos.q === to.q && pos.r === to.r) {
      // Reconstruct path
      const path: HexPos[] = []
      let cur: HexPos | null = to
      while (cur && !(cur.q === from.q && cur.r === from.r)) {
        path.unshift(cur)
        cur = prev.get(hexKey(cur)) ?? null
      }
      return { found: true, path, cost }
    }

    for (const neighbor of getNeighbors(pos)) {
      if (!isInBounds(map, neighbor)) continue
      const hex = getHex(map, neighbor)!
      const stepCost = movementCost(hex, canCrossRidgelines)
      if (stepCost === null) continue
      const newCost = cost + stepCost
      if (newCost > movementAllowance) continue
      const key = hexKey(neighbor)
      if (dist.has(key) && dist.get(key)! <= newCost) continue
      dist.set(key, newCost)
      prev.set(key, pos)
      queue.push({ pos: neighbor, cost: newCost })
    }
  }

  return { found: false, path: [], cost: 0 }
}