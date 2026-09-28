import logger from '#server/logger'
/**
 * Hex grid and terrain management for the Onion game engine.
 *
 * Provides utilities for working with hexagonal grids, terrain effects,
 * line-of-sight calculations, and movement pathfinding.
 */

import type { HexPos } from '#shared/types/index'
import { hexDistance, hexKey } from '#shared/axialHex'

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
 *
 * The map is defined as a bounded axial region, not a rectangle.
 * Implementations should treat membership as a shape concern: a hex is valid
 * only when it belongs to the scenario's declared region. Width and height are
 * retained as viewport and presentation hints, but they do not define map
 * membership on their own.
 *
 * Shape-aware code should rely on a future shared helper or shape contract to
 * enumerate valid cells and test membership. Rectangular q/r loops are only
 * acceptable for legacy compatibility layers, not as the canonical model.
 */
export interface GameMap {
  /** Width of the map in hexes */
  width: number
  /** Height of the map in hexes */
  height: number
  /** Explicit cell membership for the map shape */
  cells: HexPos[]
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

function terrainFromT(t: number): TerrainType {
  if (t === 1) return 'ridgeline'
  if (t === 2) return 'crater'
  return 'clear'
}

export function createMap(
  width: number,
  height: number,
  hexes: Array<{ q: number; r: number; t: number }>,
  cells?: HexPos[],
): GameMap {
  const overrides = new Map(hexes.map(h => [hexKey(h), terrainFromT(h.t)]))
  const record: Record<string, Hex> = {}
  const cellList =
    cells ??
    Array.from({ length: height }, (_, r) => Array.from({ length: width }, (_, q) => ({ q, r }))).flat()

  for (const pos of cellList) {
    const key = hexKey(pos)
    record[key] = { q: pos.q, r: pos.r, terrain: overrides.get(key) ?? 'clear' }
  }

  return { width, height, cells: cellList, hexes: record }
}

function hasHex(map: GameMap, pos: HexPos): boolean {
  return Boolean(map.hexes[hexKey(pos)])
}

export function getHex(map: GameMap, pos: HexPos): Hex | null {
  if (!isInBounds(map, pos)) {
    logger.warn({ pos }, 'getHex: position out of bounds')
    return null
  }
  const hex = map.hexes[hexKey(pos)]
  if (!hex) {
    logger.warn({ pos }, 'getHex: hex not found in map')
    return null
  }
  return hex
}

export function isInBounds(map: GameMap, pos: HexPos): boolean {
  return hasHex(map, pos)
}

/**
 * Legacy line-of-sight helper retained for compatibility.
 * It is not part of the current live movement or combat command path.
 * @deprecated Use the combat-specific shared rules instead.
 */
export function hasLineOfSight(map: GameMap, from: HexPos, to: HexPos): LineOfSightResult {
  // Standard OGRE rules: no terrain-based LOS blocking, purely range-based
  return { hasLOS: true, distance: hexDistance(from, to) }
}