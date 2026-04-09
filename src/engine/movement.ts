import logger from '../logger.js'
/**
 * Movement validation and execution for the Onion game engine.
 *
 * Handles unit movement, path validation, collision detection, and special
 * movement mechanics like Onion ramming and GEV second moves.
 */

import type { HexPos, PlayerRole, Command } from '../types/index.js'
import { isInBounds } from './map.js'
import type { GameMap } from './map.js'
import { getUnitDefinition, isImmobile } from './units.js'
import type { GameUnit, DefenderUnit, EngineGameState, OnionUnit } from './units.js'
import { findMovePath, type MoveMapSnapshot } from '../shared/movePlanner.js'
import { canUnitCrossRidgelines, canUnitSecondMove, getRemainingUnitMovementAllowance, getUnitMovementAllowance, spendUnitMovement } from '../shared/unitMovement.js'

/**
 * Result of validating a movement command.
 */
export type MovementValidationCode =
  | 'WRONG_PHASE'
  | 'UNIT_NOT_FOUND'
  | 'UNIT_NOT_OPERATIONAL'
  | 'UNIT_IMMOBILE'
  | 'NO_MOVEMENT_ALLOWANCE'
  | 'NO_PATH'
  | 'HEX_OCCUPIED'
  | 'RAM_LIMIT_EXCEEDED'
  | 'SECOND_MOVE_NOT_ALLOWED'

export interface MovementCapabilities {
  canRam: boolean
  hasTreads: boolean
  canSecondMove: boolean
  canCrossRidgelines: boolean
}

export interface MovementPlan {
  unitId: string
  from: HexPos
  to: HexPos
  path: HexPos[]
  cost: number
  movementAllowance: number
  rammedUnitIds: string[]
  ramCapacityUsed: number
  treadCost: number
  capabilities: MovementCapabilities
}

export type MovementValidation =
  | { ok: true; plan: MovementPlan }
  | { ok: false; code: MovementValidationCode; error: string }

type MovementAllowanceResult =
  | { ok: true; movementAllowance: number }
  | { ok: false; code: MovementValidationCode; error: string }

interface LegacyMovementValidation {
  valid: boolean
  error?: string
  path?: HexPos[]
  cost?: number
  rammedUnits?: string[]
}

interface ResolvedUnit {
  unit: GameUnit
  role: PlayerRole
}

/**
 * Result of executing a movement.
 */
export interface MovementResult {
  /** Whether movement succeeded */
  success: boolean
  /** New unit position */
  newPosition?: HexPos
  /** Unit IDs rammed during the move */
  rammedUnitIds?: string[]
  /** Ram capacity used by the move */
  ramCapacityUsed?: number
  /** Tread damage from ramming */
  treadDamage?: number
  /** Units destroyed by ramming */
  destroyedUnits?: string[]
  /** Error message if failed */
  error?: string
}

function hasTreads(unit: GameUnit): unit is OnionUnit {
  return 'treads' in unit && typeof unit.treads === 'number'
}

function resolveUnit(state: EngineGameState, unitId: string): ResolvedUnit | null {
  if (state.onion.id === unitId) {
    return { unit: state.onion, role: 'onion' }
  }

  const defender = state.defenders[unitId]
  if (defender) {
    return { unit: defender, role: 'defender' }
  }

  return null
}

function getCapabilities(unit: GameUnit): MovementCapabilities {
  return {
    canRam: getUnitDefinition(unit.type).abilities.canRam === true,
    hasTreads: hasTreads(unit),
    canSecondMove: canUnitSecondMove(unit.type),
    canCrossRidgelines: canUnitCrossRidgelines(unit.type),
  }
}

function getMovementAllowance(
  state: EngineGameState,
  unit: GameUnit,
  role: PlayerRole,
  capabilities: MovementCapabilities
): MovementAllowanceResult {
  if (role === 'onion') {
    if (state.currentPhase !== 'ONION_MOVE') {
      return { ok: false, code: 'WRONG_PHASE', error: 'Not the Onion movement phase' }
    }

    const movementAllowance = getRemainingUnitMovementAllowance(
      unit.type,
      state.currentPhase,
      state,
      unit.id,
      capabilities.hasTreads ? (unit as OnionUnit).treads : undefined,
    )

    if (movementAllowance === 0) {
      return { ok: false, code: 'NO_MOVEMENT_ALLOWANCE', error: 'Unit has no movement allowance' }
    }

    return { ok: true, movementAllowance }
  }

  if (state.currentPhase === 'GEV_SECOND_MOVE') {
    if (!capabilities.canSecondMove) {
      return { ok: false, code: 'SECOND_MOVE_NOT_ALLOWED', error: 'Unit cannot perform a second move' }
    }

    const movementAllowance = getRemainingUnitMovementAllowance(unit.type, state.currentPhase, state, unit.id)
    if (movementAllowance === 0) {
      return { ok: false, code: 'NO_MOVEMENT_ALLOWANCE', error: 'Unit has no movement allowance' }
    }

    return { ok: true, movementAllowance }
  }

  if (state.currentPhase !== 'DEFENDER_MOVE') {
    return { ok: false, code: 'WRONG_PHASE', error: 'Not a defender movement phase' }
  }

  const movementAllowance = getRemainingUnitMovementAllowance(unit.type, state.currentPhase, state, unit.id)

  if (movementAllowance === 0) {
    return { ok: false, code: 'NO_MOVEMENT_ALLOWANCE', error: 'Unit has no movement allowance' }
  }

  return { ok: true, movementAllowance }
}

function collectPathOccupants(
  state: EngineGameState,
  path: HexPos[],
  movingUnitId: string
): DefenderUnit[] {
  const occupants: DefenderUnit[] = []

  for (const pos of path) {
    for (const unit of Object.values(state.defenders)) {
      if (unit.id === movingUnitId) continue
      if (unit.position.q === pos.q && unit.position.r === pos.r) {
        occupants.push(unit)
      }
    }
  }

  return occupants
}

function validateDestinationStacking(
  state: EngineGameState,
  movingUnit: GameUnit,
  role: PlayerRole,
  destination: HexPos,
  capabilities: MovementCapabilities
): MovementValidation | null {
  const defendersAtDestination = Object.values(state.defenders).filter(
    (unit) =>
      unit.id !== movingUnit.id &&
      unit.status !== 'destroyed' &&
      unit.position.q === destination.q &&
      unit.position.r === destination.r,
  )

  if (role === 'onion') {
    if (defendersAtDestination.length > 0 && !capabilities.canRam) {
      return { ok: false, code: 'HEX_OCCUPIED', error: 'Destination hex is occupied' }
    }
    return null
  }

  const onionOccupiesDestination =
    state.onion.id !== movingUnit.id &&
    state.onion.status !== 'destroyed' &&
    state.onion.position.q === destination.q &&
    state.onion.position.r === destination.r

  if (onionOccupiesDestination) {
    return { ok: false, code: 'HEX_OCCUPIED', error: 'Destination hex is occupied by the Onion' }
  }

  if (movingUnit.type === 'LittlePigs') {
    if (defendersAtDestination.some((unit) => unit.type !== 'LittlePigs')) {
      return { ok: false, code: 'HEX_OCCUPIED', error: 'Little Pigs can only stack with other Little Pigs' }
    }

    const incomingSquads = movingUnit.squads ?? 1
    const destinationSquads = defendersAtDestination.reduce((sum, unit) => sum + (unit.squads ?? 1), 0)
    if (incomingSquads + destinationSquads > 3) {
      return { ok: false, code: 'HEX_OCCUPIED', error: 'Little Pigs stack limit is 3 squads per hex' }
    }

    return null
  }

  if (defendersAtDestination.length > 0) {
    return { ok: false, code: 'HEX_OCCUPIED', error: 'Destination hex is occupied' }
  }

  return null
}

function validateMovePlan(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'MOVE' }>
): MovementValidation {
  const resolved = resolveUnit(state, command.unitId)
  if (!resolved) {
    return { ok: false, code: 'UNIT_NOT_FOUND', error: `Unit '${command.unitId}' not found` }
  }

  const { unit, role } = resolved
  if (unit.status !== 'operational') {
    return { ok: false, code: 'UNIT_NOT_OPERATIONAL', error: 'Unit is not operational' }
  }
  if (isImmobile(unit)) {
    return { ok: false, code: 'UNIT_IMMOBILE', error: 'Unit is immobile' }
  }

  const capabilities = getCapabilities(unit)
  const allowance = getMovementAllowance(state, unit, role, capabilities)
  if (!allowance.ok) {
    return allowance
  }

  const destinationStackingError = validateDestinationStacking(state, unit, role, command.to, capabilities)
  if (destinationStackingError) {
    return destinationStackingError
  }

  const pathResult = findMovePath({
    map: toMoveMapSnapshot(map, state, unit.id),
    from: unit.position,
    to: command.to,
    movementAllowance: allowance.movementAllowance,
    canCrossRidgelines: capabilities.canCrossRidgelines,
    movingRole: role,
    movingUnitType: unit.type,
  })
  if (!pathResult.found) {
    return {
      ok: false,
      code: 'NO_PATH',
      error: `No valid path to destination within movement allowance of ${allowance.movementAllowance}`,
    }
  }

  const rammedUnits = capabilities.canRam ? collectPathOccupants(state, pathResult.path, unit.id) : []
  const ramCapacityUsed = rammedUnits.length

  if (capabilities.canRam && state.ramsThisTurn + ramCapacityUsed > 2) {
    return {
      ok: false,
      code: 'RAM_LIMIT_EXCEEDED',
      error: `Would exceed ram limit (${state.ramsThisTurn} used, ${ramCapacityUsed} on path)`,
    }
  }

  const treadCost = capabilities.hasTreads
    ? rammedUnits.reduce((total, rammedUnit) => total + calculateRamming(rammedUnit, 6).treadCost, 0)
    : 0

  return {
    ok: true,
    plan: {
      unitId: unit.id,
      from: unit.position,
      to: command.to,
      path: pathResult.path,
      cost: pathResult.cost,
      movementAllowance: allowance.movementAllowance,
      rammedUnitIds: rammedUnits.map((rammedUnit) => rammedUnit.id),
      ramCapacityUsed,
      treadCost,
      capabilities,
    },
  }
}

function toMoveMapSnapshot(map: GameMap, state: EngineGameState, movingUnitId: string): MoveMapSnapshot {
  const occupiedHexes: NonNullable<MoveMapSnapshot['occupiedHexes']> = [
    ...(state.onion.id !== movingUnitId && state.onion.status !== 'destroyed'
      ? [{ q: state.onion.position.q, r: state.onion.position.r, role: 'onion' as const, unitType: state.onion.type ?? 'TheOnion', squads: 1 }]
      : []),
    ...Object.values(state.defenders)
      .filter((unit) => unit.id !== movingUnitId && unit.status !== 'destroyed')
      .map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'defender' as const, unitType: unit.type, squads: unit.squads })),
  ]

  return {
    width: map.width,
    height: map.height,
    cells: map.cells,
    hexes: Object.values(map.hexes).map((hex) => ({
      q: hex.q,
      r: hex.r,
      t: hex.terrain === 'ridgeline' ? 1 : hex.terrain === 'crater' ? 2 : 0,
    })),
    occupiedHexes,
  }
}

function executeMovePlan(state: EngineGameState, plan: MovementPlan): MovementResult {
  const resolved = resolveUnit(state, plan.unitId)
  if (!resolved) {
    return { success: false, error: `Unit '${plan.unitId}' not found` }
  }

  const { unit } = resolved
  unit.position = plan.to
  spendUnitMovement(state, state.currentPhase, unit.id, plan.cost)

  const destroyedUnits: string[] = []
  if (plan.capabilities.canRam && plan.ramCapacityUsed > 0) {
    state.ramsThisTurn += plan.ramCapacityUsed
    for (const rammedUnitId of plan.rammedUnitIds) {
      const rammedUnit = state.defenders[rammedUnitId]
      if (!rammedUnit) continue
      const outcome = calculateRamming(rammedUnit)
      if (outcome.destroyed) {
        rammedUnit.status = 'destroyed'
        destroyedUnits.push(rammedUnitId)
      }
    }
  }

  const treadDamage = plan.capabilities.hasTreads ? plan.treadCost : 0
  if (treadDamage > 0 && hasTreads(unit)) {
    unit.treads = Math.max(0, unit.treads - treadDamage)
  }

  return {
    success: true,
    newPosition: plan.to,
    rammedUnitIds: plan.rammedUnitIds,
    ramCapacityUsed: plan.ramCapacityUsed,
    treadDamage,
    destroyedUnits,
  }
}

function toLegacyValidation(result: MovementValidation): LegacyMovementValidation {
  if (!result.ok) {
    return { valid: false, error: result.error }
  }

  return {
    valid: true,
    path: result.plan.path,
    cost: result.plan.cost,
    rammedUnits: result.plan.rammedUnitIds,
  }
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
  command: Extract<Command, { type: 'MOVE' }>
): LegacyMovementValidation {
  logger.debug({ position: state.onion.position, command }, '[validateOnionMovement] called')
  if (command.unitId !== state.onion.id) {
    return { valid: false, error: 'Not an Onion move command' }
  }

  return toLegacyValidation(validateMovePlan(map, state, command))
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
  command: Extract<Command, { type: 'MOVE' }>
): MovementValidation

export function validateUnitMovement(
  map: GameMap,
  state: EngineGameState,
  unitId: string,
  command: Extract<Command, { type: 'MOVE' }>
): LegacyMovementValidation

export function validateUnitMovement(
  map: GameMap,
  state: EngineGameState,
  unitIdOrCommand: string | Extract<Command, { type: 'MOVE' }>,
  commandMaybe?: Extract<Command, { type: 'MOVE' }>
): MovementValidation | LegacyMovementValidation {
  const command = typeof unitIdOrCommand === 'string' ? commandMaybe : unitIdOrCommand
  if (!command) {
    return { valid: false, error: 'Missing move command' }
  }

  const result = validateMovePlan(map, state, command)
  if (typeof unitIdOrCommand === 'string') {
    return toLegacyValidation(result)
  }

  return result
}

/**
 * Execute an Onion movement.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Movement command to execute
 * @returns Movement result with state changes
 */


/**
 * Execute a defender unit movement.
 * @param map - The game map
 * @param state - Current game state
 * @param unitId - ID of unit to move
 * @param command - Movement command to execute
 * @returns Movement result with state changes
 */

export function executeOnionMovement(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'MOVE' }>
): MovementResult {
  logger.debug({ position: state.onion.position, command }, '[executeOnionMovement] called')
  if (command.unitId !== state.onion.id) {
    logger.info({ command }, 'executeOnionMovement: Not an Onion move command')
    return { success: false, error: 'Not an Onion move command' }
  }
  const validation = validateMovePlan(map, state, command)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  return executeMovePlan(state, validation.plan)
}

export function executeUnitMovement(
  state: EngineGameState,
  plan: MovementPlan
): MovementResult

export function executeUnitMovement(
  map: GameMap,
  state: EngineGameState,
  unitId: string,
  command: Extract<Command, { type: 'MOVE' }>
): MovementResult

export function executeUnitMovement(
  mapOrState: GameMap | EngineGameState,
  stateOrPlan: EngineGameState | MovementPlan,
  unitId?: string,
  command?: Extract<Command, { type: 'MOVE' }>
): MovementResult {
  if ('width' in mapOrState) {
    if (!unitId || !command) {
      return { success: false, error: 'Missing move execution inputs' }
    }

    const validation = validateMovePlan(mapOrState, stateOrPlan as EngineGameState, command)
    if (!validation.ok) {
      return { success: false, error: validation.error }
    }

    return executeMovePlan(stateOrPlan as EngineGameState, validation.plan)
  }

  return executeMovePlan(mapOrState, stateOrPlan as MovementPlan)
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
