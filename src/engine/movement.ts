/**
 * Movement validation and execution for the Onion game engine.
 *
 * Handles unit movement, path validation, collision detection, and special
 * movement mechanics like Onion ramming and GEV second moves.
 */

import type { HexPos, GameState, Command } from '../types/index.js'
import type { GameMap } from './map.js'
import type { GameUnit, OnionUnit, DefenderUnit } from './units.js'

/**
 * Result of validating a movement command.
 */
export interface MovementValidation {
  /** Whether the movement is valid */
  valid: boolean
  /** Error message if invalid */
  error?: string
  /** Expected path if valid */
  path?: HexPos[]
  /** Total movement cost */
  cost?: number
  /** Units that would be rammed */
  rammedUnits?: string[]
}

/**
 * Result of executing a movement.
 */
export interface MovementResult {
  /** Whether movement succeeded */
  success: boolean
  /** New unit position */
  newPosition?: HexPos
  /** Tread damage from ramming */
  treadDamage?: number
  /** Units destroyed by ramming */
  destroyedUnits?: string[]
  /** Error message if failed */
  error?: string
}

/**
 * Validate an Onion movement command.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Movement command to validate
 * @returns Validation result
 */
export function validateOnionMovement(
  map: GameMap,
  state: GameState,
  command: Extract<Command, { type: 'MOVE_ONION' }>
): MovementValidation

/**
 * Validate a defender unit movement command.
 * @param map - The game map
 * @param state - Current game state
 * @param unitId - ID of unit to move
 * @param command - Movement command to validate
 * @returns Validation result
 */
export function validateUnitMovement(
  map: GameMap,
  state: GameState,
  unitId: string,
  command: Extract<Command, { type: 'MOVE_UNIT' }>
): MovementValidation

/**
 * Execute an Onion movement.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Movement command to execute
 * @returns Movement result with state changes
 */
export function executeOnionMovement(
  map: GameMap,
  state: GameState,
  command: Extract<Command, { type: 'MOVE_ONION' }>
): MovementResult

/**
 * Execute a defender unit movement.
 * @param map - The game map
 * @param state - Current game state
 * @param unitId - ID of unit to move
 * @param command - Movement command to execute
 * @returns Movement result with state changes
 */
export function executeUnitMovement(
  map: GameMap,
  state: GameState,
  unitId: string,
  command: Extract<Command, { type: 'MOVE_UNIT' }>
): MovementResult

/**
 * Check if a hex is occupied by a unit.
 * @param state - Current game state
 * @param pos - Position to check
 * @param excludeUnitId - Unit ID to exclude from check (for movement validation)
 * @returns The occupying unit, or null if empty
 */
export function getOccupyingUnit(
  state: GameState,
  pos: HexPos,
  excludeUnitId?: string
): GameUnit | null

/**
 * Check if movement between positions is blocked.
 * @param map - The game map
 * @param state - Current game state
 * @param from - Starting position
 * @param to - Target position
 * @param excludeUnitId - Unit ID to exclude from blocking checks
 * @returns True if movement is blocked
 */
export function isMovementBlocked(
  map: GameMap,
  state: GameState,
  from: HexPos,
  to: HexPos,
  excludeUnitId?: string
): boolean

/**
 * Calculate ramming damage and results.
 * @param rammedUnit - Unit being rammed
 * @returns Object with tread cost and destruction result
 */
export function calculateRamming(rammedUnit: DefenderUnit): {
  treadCost: number
  destroyed: boolean
}

/**
 * Check if a unit can move through another unit's hex.
 * @param movingUnit - Unit attempting to move
 * @param occupyingUnit - Unit occupying the target hex
 * @returns True if movement is allowed
 */
export function canMoveThrough(
  movingUnit: GameUnit,
  occupyingUnit: GameUnit
): boolean

/**
 * Get all units that would be rammed when moving along a path.
 * @param map - The game map
 * @param state - Current game state
 * @param path - Movement path
 * @returns Array of unit IDs that would be rammed
 */
export function getRammedUnits(
  map: GameMap,
  state: GameState,
  path: HexPos[]
): string[]</content>
<parameter name="filePath">/home/zymurge/Dev/onion/src/engine/movement.ts