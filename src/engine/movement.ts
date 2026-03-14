/**
 * Movement validation and execution for the Onion game engine.
 *
 * Handles unit movement, path validation, collision detection, and special
 * movement mechanics like Onion ramming and GEV second moves.
 */

import type { HexPos, PlayerRole, Command } from '../types/index.js'
import { isInBounds, findPath, movementCost } from './map.js'
import type { GameMap } from './map.js'
import { getUnitDefinition, onionMovementAllowance, isImmobile } from './units.js'
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
  if (state.currentPhase !== 'ONION_MOVE') {
    return { valid: false, error: 'Not the Onion movement phase' }
  }
  const ma = onionMovementAllowance(state.onion.treads)
  if (ma === 0) {
    return { valid: false, error: 'Onion has no movement allowance (0 treads)' }
  }
  const canCross = true // Onion can cross ridgelines
  const pathResult = findPath(map, state.onion.position, command.to, ma, canCross)
  if (!pathResult.found) {
    return { valid: false, error: 'No valid path to destination within movement allowance' }
  }
  const rammed = getRammedUnits(map, state, pathResult.path)
  if (state.ramsThisTurn + rammed.length > 2) {
    return { valid: false, error: `Would exceed ram limit (${state.ramsThisTurn} used, ${rammed.length} on path)` }
  }
  return { valid: true, path: pathResult.path, cost: pathResult.cost, rammedUnits: rammed }
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
  const validPhases = ['DEFENDER_MOVE', 'GEV_SECOND_MOVE']
  if (!validPhases.includes(state.currentPhase)) {
    return { valid: false, error: 'Not a defender movement phase' }
  }
  const unit = state.defenders[unitId]
  if (!unit) {
    return { valid: false, error: `Unit '${unitId}' not found` }
  }
  if (unit.status !== 'operational') {
    return { valid: false, error: 'Unit is not operational' }
  }
  if (isImmobile(unit)) {
    return { valid: false, error: 'Unit is immobile' }
  }
  const def = getUnitDefinition(unit.type)
  if (state.currentPhase === 'GEV_SECOND_MOVE') {
    if (!def.abilities.secondMove) {
      return { valid: false, error: 'Unit cannot perform a second move' }
    }
  }
  const ma = state.currentPhase === 'GEV_SECOND_MOVE'
    ? (def.abilities.secondMoveAllowance ?? 0)
    : def.movement
  const canCross = def.abilities.canCrossRidgelines ?? false
  const pathResult = findPath(map, unit.position, command.to, ma, canCross)
  if (!pathResult.found) {
    return { valid: false, error: 'No valid path to destination within movement allowance' }
  }
  return { valid: true, path: pathResult.path, cost: pathResult.cost }
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
  const ma = onionMovementAllowance(state.onion.treads)
  const pathResult = findPath(map, state.onion.position, command.to, ma, true)
  if (!pathResult.found) {
    return { success: false, error: 'No valid path to destination' }
  }
  const rammed = getRammedUnits(map, state, pathResult.path)
  let treadDamage = 0
  const destroyedUnits: string[] = []
  for (const id of rammed) {
    const unit = state.defenders[id]
    const { treadCost, destroyed } = calculateRamming(unit)
    treadDamage += treadCost
    if (destroyed) {
      unit.status = 'destroyed'
      destroyedUnits.push(id)
    }
  }
  state.onion.treads = Math.max(0, state.onion.treads - treadDamage)
  state.ramsThisTurn += rammed.length
  state.onion.position = command.to
  return { success: true, newPosition: command.to, treadDamage, destroyedUnits }
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
  const unit = state.defenders[unitId]
  if (!unit) {
    return { success: false, error: `Unit '${unitId}' not found` }
  }
  unit.position = command.to
  return { success: true, newPosition: command.to }
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
  if (state.onion.id !== excludeUnitId &&
      state.onion.position.q === pos.q && state.onion.position.r === pos.r) {
    return state.onion
  }
  for (const unit of Object.values(state.defenders)) {
    if (unit.id !== excludeUnitId &&
        unit.position.q === pos.q && unit.position.r === pos.r) {
      return unit
    }
  }
  return null
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
  if (!isInBounds(map, to)) return true
  const hex = map.hexes[`${to.q},${to.r}`]
  if (!hex || hex.terrain === 'crater') return true
  return getOccupyingUnit(state, to, excludeUnitId) !== null
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
  const def = getUnitDefinition(rammedUnit.type)
  let treadCost: number
  if (rammedUnit.type === 'LittlePigs') {
    treadCost = 0
  } else if (def.abilities.isArmor && rammedUnit.type === 'Dragon') {
    treadCost = 2
  } else {
    treadCost = 1
  }
  const d6 = roll ?? (Math.floor(Math.random() * 6) + 1)
  return { treadCost, destroyed: d6 <= 4 }
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
  if (movingRole === 'onion') {
    // Onion can move through any defender hex (ramming)
    return occupyingUnit.type !== 'TheOnion'
  }
  // Defender can move through friendly defenders but not through the Onion
  return occupyingUnit.type !== 'TheOnion'
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
  const result: string[] = []
  for (const pos of path) {
    for (const [id, unit] of Object.entries(state.defenders)) {
      if (unit.position.q === pos.q && unit.position.r === pos.r) {
        result.push(id)
      }
    }
  }
  return result
}
