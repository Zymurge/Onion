import logger from '#server/logger'
/**
 * Onion Game Engine
 *
 * Core game logic for the Shrek-themed OGRE reimplementation.
 * Provides movement, combat, and victory condition systems.
 */

// Map and terrain management
export type {
  TerrainType,
  Hex,
  GameMap,
  LineOfSightResult,
  PathResult,
} from '#server/engine/map'

export {
  createMap,
  getHex,
  isInBounds,
  hasLineOfSight,
  findPath,
  movementCost,
} from '#server/engine/map'

// Unit definitions and capabilities
export type {
  UnitType,
  WeaponStatus,
  Weapon,
  UnitAbilities,
  UnitDefinition,
  GameUnit,
  OnionUnit,
  DefenderUnit,
  EngineGameState,
} from '#server/engine/units'

export {
  getUnitDefinition,
  getAllUnitDefinitions,
  onionMovementAllowance,
  canSecondMove,
  isImmobile,
  getUnitDefense,
  getWeaponDefense,
  getReadyWeapons,
  isDestroyed,
  canTargetWeapon,
  destroyWeapon,
} from '#server/engine/units'

// Movement validation and execution
export type {
  MovementValidation,
  MovementValidationCode,
  MovementCapabilities,
  MovementPlan,
  MovementResult,
} from '#server/engine/movement'

export {
  validateOnionMovement,
  validateUnitMovement,
  executeOnionMovement,
  executeUnitMovement,
  getOccupyingUnit,
  isMovementBlocked,
  calculateRamming,
  canMoveThrough,
  getRammedUnits,
} from '#server/engine/movement'

export { resolveRammingOutcome } from '#shared/rammingCalculator'

// Turn phases and victory conditions
export type { PhaseActor } from '#server/engine/phases'

export {
  TURN_PHASES,
  nextPhase,
  phaseActor,
  advancePhase,
  checkVictoryConditions,
} from '#server/engine/phases'

// Combat resolution system
export type {
  CombatResult,
  CombatRoll,
  CombatResultDetails,
  CombatValidationCode,
  CombatTarget,
  CombatPlan,
  CombatValidation,
  CombatExecutionResult,
} from '#server/engine/combat'

export {
  validateCombatAction,
  executeCombatAction,
  rollCombat,
  calculateOdds,
  applyDamage,
  getValidTargets,
} from '#server/engine/combat'
