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

/**
 * Create a game map from a scenario definition.
 * @param width - Map width in hexes
 * @param height - Map height in hexes
 * @param hexes - Array of hex definitions with terrain
 * @returns Complete game map with all hexes
 */
export function createMap(width: number, height: number, hexes: Array<{ q: number; r: number; t: number }>): GameMap

/**
 * Get a hex at the specified coordinates.
 * @param map - The game map
 * @param pos - Position to look up
 * @returns The hex at the position, or null if out of bounds or doesn't exist
 */
export function getHex(map: GameMap, pos: HexPos): Hex | null

/**
 * Check if a position is within the map bounds.
 * @param map - The game map
 * @param pos - Position to check
 * @returns True if the position is on the map
 */
export function isInBounds(map: GameMap, pos: HexPos): boolean

/**
 * Calculate the distance between two hex positions.
 * @param a - First position
 * @param b - Second position
 * @returns Distance in hexes
 */
export function hexDistance(a: HexPos, b: HexPos): number

/**
 * Get all neighboring hexes within range 1.
 * @param pos - Center position
 * @returns Array of neighboring positions
 */
export function getNeighbors(pos: HexPos): HexPos[]

/**
 * Check line of sight between two positions on the map.
 * @param map - The game map
 * @param from - Starting position
 * @param to - Target position
 * @returns Line of sight result
 */
export function hasLineOfSight(map: GameMap, from: HexPos, to: HexPos): LineOfSightResult

/**
 * Find a movement path between two positions.
 * @param map - The game map
 * @param from - Starting position
 * @param to - Target position
 * @param movementAllowance - Maximum movement points available
 * @param canCrossRidgelines - Whether the unit can cross ridgelines
 * @returns Pathfinding result
 */
export function findPath(
  map: GameMap,
  from: HexPos,
  to: HexPos,
  movementAllowance: number,
  canCrossRidgelines: boolean
): PathResult

/**
 * Calculate movement cost to enter a hex.
 * @param hex - The hex being entered
 * @param canCrossRidgelines - Whether the unit can cross ridgelines
 * @returns Movement cost in points, or null if impassable
 */
export function movementCost(hex: Hex, canCrossRidgelines: boolean): number | null</content>
<parameter name="filePath">/home/zymurge/Dev/onion/src/engine/map.ts