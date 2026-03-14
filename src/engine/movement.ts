/**
 * Movement validation and execution for the Onion game engine.
 *
 * Handles unit movement, path validation, collision detection, and special
 * movement mechanics like Onion ramming and GEV second moves.
 */

import type { HexPos, PlayerRole, Command } from '../types/index.js'
import type { GameMap } from './map.js'
import type { GameUnit, DefenderUnit, EngineGameState } from './units.js'

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
  state: EngineGameState,
  command: Extract<Command, { type: 'MOVE_ONION' }>
): MovementValidation {
  throw new Error('not implemented')
}

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
  state: EngineGameState,
  unitId: string,
  command: Extract<Command, { type: 'MOVE_UNIT' }>
): MovementValidation {
  throw new Error('not implemented')
}

/**
 * Execute an Onion movement.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Movement command to execute
 * @returns Movement result with state changes
 */
export function executeOnionMovement(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'MOVE_ONION' }>
): MovementResult {
  throw new Error('not implemented')
}

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
  state: EngineGameState,
  unitId: string,
  command: Extract<Command, { type: 'MOVE_UNIT' }>
): MovementResult {
  throw new Error('not implemented')
}

/**
 * Check if a hex is occupied by a unit.
 * @param state - Current game state
 * @param pos - Position to check
 * @param excludeUnitId - Unit ID to exclude from check (for movement validation)
 * @returns The occupying unit, or null if empty
 */
export function getOccupyingUnit(
  state: EngineGameState,
  pos: HexPos,
  excludeUnitId?: string
): GameUnit | null {
  throw new Error('not implemented')
}

/**
 * Check if a unit can enter a hex.
 * @param map - The game map
 * @param state - Current game state
 * @param to - Target position
 * @param excludeUnitId - Unit ID to exclude from blocking checks
 * @returns True if the hex cannot be entered
 */
export function isMovementBlocked(
  map: GameMap,
  state: EngineGameState,
  to: HexPos,
  excludeUnitId?: string
): boolean {
  throw new Error('not implemented')
}

/**
 * Calculate ramming damage and results.
 * @param rammedUnit - Unit being rammed
 * @param roll - Optional fixed die roll for testing (1-6); rolls 1d6 if omitted
 * @returns Object with tread cost and destruction result
 */
export function calculateRamming(rammedUnit: DefenderUnit, roll?: number): {
  treadCost: number
  destroyed: boolean
} {
  throw new Error('not implemented')
}

/**
 * Check if a unit can move through another unit's hex.
 * @param movingUnit - Unit attempting to move
 * @param occupyingUnit - Unit occupying the target hex
 * @param movingRole - The player role of the moving unit
 * @returns True if movement is allowed
 */
export function canMoveThrough(
  movingUnit: GameUnit,
  occupyingUnit: GameUnit,
  movingRole: PlayerRole
): boolean {
  throw new Error('not implemented')
}

/**
 * Get all units that would be rammed when moving along a path.
 * @param map - The game map
 * @param state - Current game state
 * @param path - Movement path
 * @returns Array of unit IDs that would be rammed
 */
export function getRammedUnits(
  map: GameMap,
  state: EngineGameState,
  path: HexPos[]
): string[] {
  throw new Error('not implemented')
}
