import logger from '#server/logger'
/**
 * Movement validation and execution for the Onion game engine.
 *
 * Handles unit movement, path validation, collision detection, and special
 * movement mechanics like Onion ramming and GEV second moves.
 */

import type { HexPos, PlayerRole, SingleUnitMoveCommand } from '#shared/types/index'
import { isInBounds } from '#server/engine/map'
import type { GameMap } from '#server/engine/map'
import type { GameUnit, DefenderUnit, EngineGameState, OnionUnit } from '#server/engine/units'
import { calculateRamming as calculateSharedRamming, resolveRammingOutcome } from '#shared/rammingCalculator'
import { spendUnitMovement } from '#shared/unitMovement'
import { type MoveMapSnapshot } from '#shared/movePlanner'
import { validateMove as validateSharedMove, type MoveValidationResult as SharedMoveValidationResult } from '#shared/moveValidator'
import type { RammingOutcome } from '#shared/rammingCalculator'
import { buildStackRosterIndex, relocateStackRosterUnits } from '#shared/stackRoster'
import { buildStackGroupKey, createStackNamingEngine, refreshStackNamingSnapshotFromRoster } from '#shared/stackNaming'

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

interface ResolvedUnit {
  unit: GameUnit
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
  /** Semantic outcomes for each rammed unit */
  rammedUnitResults?: Array<{
    unitId: string
    unitType: string
    outcome: RammingOutcome
  }>
  /** Error message if failed */
  error?: string
}

function hasTreads(unit: GameUnit): unit is OnionUnit {
  return 'treads' in unit && typeof unit.treads === 'number'
}

function resolveUnit(state: EngineGameState, unitId: string): ResolvedUnit | null {
  if (state.onion.id === unitId) {
    return { unit: state.onion }
  }

  const defender = state.defenders[unitId]
  if (defender) {
    return { unit: defender }
  }

  return null
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

function validateMovePlan(
  map: GameMap,
  state: EngineGameState,
  command: SingleUnitMoveCommand
): MovementValidation {
  return toMovementValidation(validateSharedMove(toMoveMapSnapshot(map, state, command.unitId), state, command))
}

function toMovementValidation(result: SharedMoveValidationResult): MovementValidation {
  if (!result.valid) {
    return { ok: false, code: result.code, error: result.error }
  }

  return {
    ok: true,
    plan: {
      unitId: result.unitId,
      from: result.from,
      to: result.to,
      path: result.path,
      cost: result.cost,
      movementAllowance: result.movementAllowance,
      rammedUnitIds: result.rammedUnitIds,
      ramCapacityUsed: result.ramCapacityUsed,
      treadCost: result.treadCost,
      capabilities: result.capabilities,
    },
  }
}

function reconcileStackStateAfterMove(state: EngineGameState, movedUnitId: string): void {
  const movedDefender = state.defenders[movedUnitId]
  if (movedDefender === undefined || movedDefender.status === 'destroyed') {
    logger.debug(
      {
        movedUnitId,
        reason: movedDefender === undefined ? 'missing-defender' : 'destroyed-defender',
      },
      'Refreshing stack naming after move for non-operational unit',
    )
    state.stackNaming = refreshStackNamingSnapshotFromRoster(
      state.stackNaming,
      state.stackRoster,
      Object.values(state.defenders).map((unit) => ({
        id: unit.id,
        type: unit.type,
        position: unit.position,
        status: unit.status,
        squads: unit.squads,
        friendlyName: unit.friendlyName,
      })),
    )
    return
  }

  const rosterIndex = buildStackRosterIndex(state.stackRoster)
  const sourceGroup = rosterIndex.getUnitGroup(movedUnitId)
  const destinationGroupId = buildStackGroupKey(movedDefender.type, movedDefender.position)
  const destinationGroup = rosterIndex.groupsById[destinationGroupId] ?? null
  const sourceGroupUnitCount = sourceGroup?.unitIds?.length ?? sourceGroup?.units?.length ?? 0
  const sourceRemainingUnitCount = Math.max(sourceGroupUnitCount - 1, 0)
  const destinationGroupUnitCount = destinationGroup?.unitIds?.length ?? destinationGroup?.units?.length ?? 0
  const destinationResultUnitCount = destinationGroupUnitCount + 1
  const persistedDestinationName = state.stackNaming?.groupsInUse.find((entry) => entry.groupKey === destinationGroupId)?.groupName
  const shouldAllocateFreshDestinationName =
    destinationResultUnitCount > 1
    && persistedDestinationName === undefined
    && destinationGroupUnitCount === 1
    && (
      destinationGroup?.groupName === undefined
      || sourceGroup?.groupName !== destinationGroup.groupName
      || sourceRemainingUnitCount > 1
    )
  const allocatedDestinationName = shouldAllocateFreshDestinationName
    ? createStackNamingEngine(state.stackNaming).resolveGroupName(
        destinationGroupId,
        movedDefender.type,
        movedDefender.id,
        movedDefender.friendlyName,
        destinationResultUnitCount,
      )
    : undefined
  const selectedNameSource = persistedDestinationName !== undefined
    ? 'persisted-stack-naming'
    : allocatedDestinationName !== undefined
      ? 'allocated-destination-group'
    : destinationGroup?.groupName !== undefined
      ? 'destination-roster-group'
      : sourceGroup?.groupName !== undefined
        ? 'source-roster-group'
        : movedDefender.friendlyName !== undefined
          ? 'defender-friendly-name'
          : 'unit-type-fallback'
  const movedGroupName = state.stackNaming?.groupsInUse.find((entry) => entry.groupKey === destinationGroupId)?.groupName
    ?? allocatedDestinationName
    ?? destinationGroup?.groupName
    ?? sourceGroup?.groupName
    ?? movedDefender.friendlyName
    ?? movedDefender.type

  logger.debug(
    {
      movedUnitId,
      unitType: movedDefender.type,
      sourceGroup: sourceGroup?.groupName ?? null,
      destinationGroupId,
      destinationGroup: destinationGroup?.groupName ?? null,
      persistedDestinationName: persistedDestinationName ?? null,
      selectedNameSource,
      selectedName: movedGroupName,
      destinationPosition: movedDefender.position,
    },
    'Selected destination stack name for move',
  )

  state.stackRoster = relocateStackRosterUnits(state.stackRoster, {
    movedUnitIds: [movedUnitId],
    unitType: movedDefender.type,
    destinationPosition: movedDefender.position,
    destinationGroupName: movedGroupName,
  })

  state.stackNaming = refreshStackNamingSnapshotFromRoster(
    state.stackNaming,
    state.stackRoster,
    Object.values(state.defenders).map((unit) => ({
      id: unit.id,
      type: unit.type,
      position: unit.position,
      status: unit.status,
      squads: unit.squads,
      friendlyName: unit.friendlyName,
    })),
  )

  logger.debug(
    {
      movedUnitId,
      destinationGroupId,
      refreshedGroupName: state.stackNaming.groupsInUse.find((entry) => entry.groupKey === destinationGroupId)?.groupName ?? null,
      refreshedGroupsInUse: state.stackNaming.groupsInUse,
      usedGroupNames: state.stackNaming.usedGroupNames,
    },
    'Refreshed stack naming after move',
  )
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
  const rammedUnitResults: NonNullable<MovementResult['rammedUnitResults']> = []
  if (plan.capabilities.canRam && plan.ramCapacityUsed > 0) {
    state.ramsThisTurn += plan.ramCapacityUsed
    for (const rammedUnitId of plan.rammedUnitIds) {
      const rammedUnit = state.defenders[rammedUnitId]
      if (!rammedUnit) continue
      const outcome = resolveRammingOutcome(rammedUnit.type)
      rammedUnitResults.push({
        unitId: rammedUnitId,
        unitType: rammedUnit.type,
        outcome,
      })
      if (outcome.effect === 'destroyed') {
        rammedUnit.status = 'destroyed'
        destroyedUnits.push(rammedUnitId)
      }
    }
  }

  const treadDamage = plan.capabilities.hasTreads ? plan.treadCost : 0
  if (treadDamage > 0 && hasTreads(unit)) {
    unit.treads = Math.max(0, unit.treads - treadDamage)
  }

  reconcileStackStateAfterMove(state, plan.unitId)

  return {
    success: true,
    newPosition: plan.to,
    rammedUnitIds: plan.rammedUnitIds,
    ramCapacityUsed: plan.ramCapacityUsed,
    treadDamage,
    destroyedUnits,
    rammedUnitResults,
  }
}

export function validateUnitMovement(
  map: GameMap,
  state: EngineGameState,
  command: SingleUnitMoveCommand
): MovementValidation
export function validateUnitMovement(
  map: GameMap,
  state: EngineGameState,
  command: SingleUnitMoveCommand
): MovementValidation {
  return validateMovePlan(map, state, command)
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
  command: SingleUnitMoveCommand
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
  state: EngineGameState,
  plan: MovementPlan
): MovementResult {
  return executeMovePlan(state, plan)
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
  return calculateSharedRamming(rammedUnit.type, roll)
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
      if (unit.status === 'destroyed') continue
      if (unit.position.q === pos.q && unit.position.r === pos.r) {
        result.push(id)
      }
    }
  }
  return result
}
