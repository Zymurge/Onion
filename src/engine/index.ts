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
} from './map.js'

export {
  createMap,
  getHex,
  isInBounds,
  hexDistance,
  getNeighbors,
  hasLineOfSight,
  findPath,
  movementCost,
} from './map.js'

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
} from './units.js'

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
} from './units.js'

// Movement validation and execution
export type {
  MovementValidation,
  MovementValidationCode,
  MovementCapabilities,
  MovementPlan,
  MovementResult,
} from './movement.js'

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
} from './movement.js'

// Turn phases and victory conditions
export type { PhaseActor } from './phases.js'

export {
  TURN_PHASES,
  nextPhase,
  phaseActor,
  advancePhase,
  checkVictoryConditions,
} from './phases.js'

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
} from './combat.js'

export {
  validateCombatAction,
  validateOnionWeaponFire,
  validateUnitFire,
  validateCombinedFire,
  executeCombatAction,
  executeOnionWeaponFire,
  executeUnitFire,
  executeCombinedFire,
  rollCombat,
  calculateOdds,
  applyDamage,
  getValidTargets,
} from './combat.js'
