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
  GameState,
  GameUnit,
  OnionUnit,
  DefenderUnit,
  UnitAbilities,
  UnitType,
  UnitTypeBase,
  UnitTypeCatalog,
  Weapon,
  WeaponType,
  WeaponTypeCatalog,
} from '#shared/types/index'

export {
  getUnitDefinition,
  getAllUnitDefinitions,
  getWeaponType,
  onionMovementAllowance,
  canSecondMove,
  isImmobile,
  getUnitDefense,
  getWeaponDefense,
  isWeaponAvailable,
  getAvailableWeapons,
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
