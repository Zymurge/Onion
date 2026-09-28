/**
 * Movement validation and execution for the Onion game engine.
 *
 * Handles unit movement, path validation, collision detection, and special
 * movement mechanics like Onion ramming and GEV second moves.
 */

import logger from '#server/logger'
import type { HexPos, SingleUnitMoveCommand, GameState, GameUnit, OnionUnit } from '#shared/types/index'
import type { GameMap } from '#server/engine/map'
import { resolveRammingOutcome } from '#shared/rammingCalculator'
import { spendUnitMovement } from '#shared/unitMovement'
import { type MoveMapSnapshot } from '#shared/movePlanner'
import { validateMove as validateSharedMove, type MoveValidationResult as SharedMoveValidationResult } from '#shared/moveValidator'
import type { RammingOutcome } from '#shared/rammingCalculator'
import { reconcileStackRosterMoveLifecycle, refreshStackRosterNamingSnapshot } from '#shared/stackRoster'

type EngineGameState = GameState
/**
 * Error codes returned when validating a movement command.
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

/** Injection seam for a caller-supplied die value; production callers never set this, so ramming stays on Math.random(). */
export type RollSource = {
  next(): number
}

export type MovementExecutionOptions = {
  reconcileStackRoster?: boolean
  /** Consumed once per rammed unit, in order; omit to keep normal random ramming. */
  ramRolls?: RollSource
}

function hasTreads(unit: GameUnit): unit is OnionUnit {
  return 'treads' in unit && typeof unit.treads === 'number'
}

function resolveUnit(state: EngineGameState, unitId: string): ResolvedUnit | null {
  const onion = state.onions[unitId]
  if (onion !== undefined) {
    return { unit: onion }
  }

  const defender = state.defenders[unitId]
  if (defender) {
    return { unit: defender }
  }

  return null
}

function toMoveMapSnapshot(map: GameMap, state: EngineGameState, movingUnitId: string): MoveMapSnapshot {
  const occupiedHexes: NonNullable<MoveMapSnapshot['occupiedHexes']> = [
    ...Object.values(state.onions)
      .filter((unit) => unit.unitId !== movingUnitId && unit.state !== 'destroyed')
      .map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'onion' as const, unitType: unit.typeId })),
    ...Object.values(state.defenders)
      .filter((unit) => unit.unitId !== movingUnitId && unit.state !== 'destroyed')
      .map((unit) => ({ q: unit.position.q, r: unit.position.r, role: 'defender' as const, unitType: unit.typeId })),
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

export function reconcileStackStateAfterMoves(state: EngineGameState, movedUnitIds: ReadonlyArray<string>): void {
  const movedDefenderId = movedUnitIds.find((unitId) => state.defenders[unitId] !== undefined)
  const movedDefender = movedDefenderId === undefined ? undefined : state.defenders[movedDefenderId]
  if (movedDefender === undefined || movedDefender.state === 'destroyed') {
    logger.debug(
      {
      movedUnitIds,
      reason: movedDefender === undefined ? 'missing-defender' : 'destroyed-defender',
      },
      'Refreshing stack naming after move for non-operational unit',
    )
    state.stackNaming = refreshStackRosterNamingSnapshot(state.stackRoster, state.stackNaming, state.defenders)
    return
  }

  const activeStackRoster = {
    groupsById: Object.fromEntries(
      Object.entries(state.stackRoster.groupsById).flatMap(([groupId, group]) => {
        const unitIds = group.unitIds.filter((unitId) => state.defenders[unitId]?.state !== 'destroyed')
        return unitIds.length > 0 ? [[groupId, { ...group, unitIds }] as const] : []
      }),
    ),
  }

  const reconciled = reconcileStackRosterMoveLifecycle({
    stackRoster: activeStackRoster,
    stackNaming: state.stackNaming,
    defenders: state.defenders,
    movedUnitId: movedDefender.unitId,
    movedUnitIds,
    unitType: movedDefender.typeId,
    destinationPosition: movedDefender.position,
    movedUnitFriendlyName: movedDefender.friendlyName,
  })

  logger.debug(
    {
      movedUnitIds,
      unitType: movedDefender.typeId,
      destinationGroupId: reconciled.destinationGroupId,
      selectedNameSource: reconciled.selectedNameSource,
      selectedName: reconciled.destinationGroupName,
      destinationPosition: movedDefender.position,
    },
    'Selected destination stack name for move',
  )

  const relocateInput = {
    movedUnitIds,
    unitType: movedDefender.typeId,
    destinationPosition: movedDefender.position,
    destinationGroupName: reconciled.destinationGroupName,
  }

  // Debug: record roster state before relocation and the relocate input
  try {
    logger.debug({ movedUnitIds, relocateInput, beforeGroups: Object.keys(state.stackRoster?.groupsById ?? {}) }, 'RelocateStackRosterUnits - before')
  } catch (err) {
    // swallow logging errors
    logger.debug({ movedUnitIds, err: String(err) }, 'RelocateStackRosterUnits - before(log-failed)')
  }

  state.stackRoster = reconciled.stackRoster

  // Debug: record roster state after relocation for diagnosis
  try {
    logger.debug({ movedUnitIds, relocateInput, afterGroups: Object.keys(state.stackRoster?.groupsById ?? {}), afterGroupsDetail: state.stackRoster?.groupsById }, 'RelocateStackRosterUnits - after')
  } catch (err) {
    logger.debug({ movedUnitIds, err: String(err) }, 'RelocateStackRosterUnits - after(log-failed)')
  }

  state.stackNaming = reconciled.stackNaming

  logger.debug(
    {
      movedUnitIds,
      destinationGroupId: reconciled.destinationGroupId,
      refreshedGroupName: state.stackNaming.groupsInUse.find((entry) => entry.groupKey === reconciled.destinationGroupId)?.groupName ?? null,
      refreshedGroupsInUse: state.stackNaming.groupsInUse,
      usedGroupNames: state.stackNaming.usedGroupNames,
    },
    'Refreshed stack naming after move',
  )
}

function executeMovePlan(state: EngineGameState, plan: MovementPlan, options: MovementExecutionOptions = {}): MovementResult {
  const resolved = resolveUnit(state, plan.unitId)
  if (!resolved) {
    return { success: false, error: `Unit '${plan.unitId}' not found` }
  }

  const { unit } = resolved
  const requiresRamming = plan.capabilities.canRam && plan.ramCapacityUsed > 0
  if (requiresRamming && !hasTreads(unit)) {
    return { success: false, error: 'Ramming requires an Onion unit' }
  }

  unit.position = plan.to
  spendUnitMovement(unit, state.currentPhase, plan.cost)

  const destroyedUnits: string[] = []
  const rammedUnitResults: NonNullable<MovementResult['rammedUnitResults']> = []
  if (requiresRamming) {
    unit.ramsRemaining = Math.max(0, (unit.ramsRemaining ?? 0) - plan.ramCapacityUsed)
    for (const rammedUnitId of plan.rammedUnitIds) {
      const rammedUnit = state.defenders[rammedUnitId]
      if (!rammedUnit) continue
      const outcome = resolveRammingOutcome(rammedUnit.typeId, options.ramRolls?.next())
      rammedUnitResults.push({
        unitId: rammedUnitId,
        unitType: rammedUnit.typeId,
        outcome,
      })
      if (outcome.effect === 'destroyed') {
        rammedUnit.state = 'destroyed'
        destroyedUnits.push(rammedUnitId)
      }
    }
  }

  const treadDamage = plan.capabilities.hasTreads ? plan.treadCost : 0
  if (treadDamage > 0 && hasTreads(unit)) {
    unit.treads = Math.max(0, (unit.treads ?? 0) - treadDamage)
  }

  if (options.reconcileStackRoster !== false) {
    reconcileStackStateAfterMoves(state, [plan.unitId])
  }

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

export function executeOnionMovement(
  map: GameMap,
  state: EngineGameState,
  command: SingleUnitMoveCommand
): MovementResult {
  const onion = state.onions[command.unitId]
  logger.debug({ position: onion?.position, command }, '[executeOnionMovement] called')
  if (onion === undefined) {
    logger.info({ command }, 'executeOnionMovement: Not an Onion move command')
    return { success: false, error: 'Not an Onion move command' }
  }
  const validation = validateMovePlan(map, state, command)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  return executeMovePlan(state, validation.plan)
}

/**
 * Execute a movement from a validated plan.
 * @param state - Current game state
 * @param plan - Validated movement plan to execute
 * @param options - Optional execution hooks and stack reconciliation settings
 * @returns Movement result with state changes
 */
export function executeUnitMovement(
  state: EngineGameState,
  plan: MovementPlan,
  options: MovementExecutionOptions = {},
): MovementResult {
  return executeMovePlan(state, plan, options)
}
