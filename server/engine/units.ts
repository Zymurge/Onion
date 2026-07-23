/**
 * Unit definitions and capabilities for the Onion game engine.
 */

export type { 
  GameState, 
  GameUnit, 
  OnionUnit, 
  UnitType, 
  UnitTypeBase, 
  UnitTypeCatalog, 
  Weapon, 
  WeaponType, 
  WeaponTypeCatalog 
} from '#shared/types/index'

export { getUnitDefinition, getAllUnitDefinitions, getWeaponType, getWeaponDefense } from '#shared/unitDefinitions'
export { canSecondMove, isImmobile, getUnitDefense, isWeaponAvailable, getAvailableWeapons, isDestroyed, canTargetWeapon, destroyWeapon, getOnion } from '#shared/unitState'
import { onionMovementAllowance } from '#shared/movementAllowance'

export { onionMovementAllowance }
