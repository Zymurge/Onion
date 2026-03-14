/**
 * Unit definitions and capabilities for the Onion game engine.
 *
 * Defines all unit types, their weapons, special abilities, and game mechanics.
 */

import type { HexPos, UnitStatus } from '../types/index.js'

/**
 * All possible unit types in the game.
 */
export type UnitType =
  | 'TheOnion'      // Super-unit with multiple weapon systems
  | 'BigBadWolf'    // GEV - can move and fire in same turn
  | 'Puss'          // Heavy Tank
  | 'Witch'         // Missile Tank
  | 'LordFarquaad'  // Howitzer - immobile artillery
  | 'Pinocchio'     // Light Tank
  | 'Dragon'        // Superheavy Tank
  | 'LittlePigs'    // Infantry - can stack multiple squads
  | 'Castle'        // Command Post - primary objective

/**
 * Status that a weapon can have.
 */
export type WeaponStatus = 'ready' | 'destroyed'

/**
 * A weapon system that a unit can use to attack.
 */
export interface Weapon {
  /** Weapon identifier (e.g., 'main', 'secondary', 'ap', 'missile') */
  id: string
  /** Display name */
  name: string
  /** Attack strength */
  attack: number
  /** Range in hexes (0 for melee-only) */
  range: number
  /** Defense value when this weapon is targeted */
  defense: number
  /** Current status of this weapon */
  status: WeaponStatus
  /** Whether this weapon can be individually targeted (true for Onion subsystems) */
  individuallyTargetable: boolean
}

/**
 * Special abilities that units can have.
 */
export interface UnitAbilities {
  /** Can move and fire in the same turn (GEV) */
  secondMove?: boolean
  /** Maximum stacks per hex (1 for most units, 3 for infantry) */
  maxStacks: number
  /** Can cross ridgelines (Onion) */
  canCrossRidgelines?: boolean
  /** Is an armored unit (affects ramming costs) */
  isArmor?: boolean
  /** Immobile once placed (artillery) - for code readability */
  immobile?: boolean
}

/**
 * Complete unit definition combining weapons and abilities.
 */
export interface UnitDefinition {
  /** Display name */
  name: string
  /** Unit type identifier */
  type: UnitType
  /** Movement allowance in hexes */
  movement: number
  /** Cost in victory points (for defender units) */
  cost?: number
  /** Special abilities */
  abilities: UnitAbilities
  /** Weapon systems */
  weapons: Weapon[]
}

/**
 * A game unit with current state.
 */
export interface GameUnit {
  /** Unique identifier */
  id: string
  /** Unit type */
  type: UnitType
  /** Current position */
  position: HexPos
  /** Current status */
  status: UnitStatus
  /** Number of squads (for infantry) */
  squads?: number
  /** Current weapon states */
  weapons: Weapon[]
}

/**
 * The Onion super-unit with detailed subsystem state.
 */
export interface OnionUnit extends GameUnit {
  type: 'TheOnion'
  /** Current tread points (0-45) */
  treads: number
}

/**
 * Defender unit (any non-Onion unit).
 */
export interface DefenderUnit extends GameUnit {
  type: Exclude<UnitType, 'TheOnion'>
}

/**
 * Full game state as used by the engine.
 */
export interface EngineGameState {
  /** The Onion super-unit */
  onion: OnionUnit
  /** All defender units, keyed by unit ID */
  defenders: Record<string, DefenderUnit>
}

/**
 * Get the definition for a unit type.
 * @param type - Unit type to look up
 * @returns Unit definition with weapons and abilities
 */
export function getUnitDefinition(type: UnitType): UnitDefinition

/**
 * Get all unit definitions.
 * @returns Map of unit type to definition
 */
export function getAllUnitDefinitions(): Record<UnitType, UnitDefinition>

/**
 * Calculate movement allowance based on current tread points.
 * @param treads - Current tread points (0-45)
 * @returns Movement allowance (0-3)
 */
export function onionMovementAllowance(treads: number): number

/**
 * Check if a unit can perform a second move (GEV ability).
 * @param unit - Unit to check
 * @returns True if unit can perform second move
 */
export function canSecondMove(unit: GameUnit): boolean

/**
 * Check if a unit is immobilized (cannot move).
 * @param unit - Unit to check
 * @returns True if unit cannot move
 */
export function isImmobile(unit: GameUnit): boolean

/**
 * Get the effective defense value for a unit when targeted.
 * @param unit - Unit to check
 * @param inCover - Whether unit is in terrain providing cover
 * @returns Effective defense value
 */
export function getUnitDefense(unit: GameUnit, inCover: boolean): number

/**
 * Get the defense value of a specific weapon when individually targeted.
 * @param unit - Unit containing the weapon
 * @param weaponId - Weapon to check
 * @returns Weapon defense value, or unit defense if not individually targetable
 */
export function getWeaponDefense(unit: GameUnit, weaponId: string): number

/**
 * Get all ready (non-destroyed) weapons for a unit.
 * @param unit - Unit to check
 * @returns Array of ready weapons
 */
export function getReadyWeapons(unit: GameUnit): Weapon[]

/**
 * Check if a unit is destroyed (has no remaining combat capability).
 * @param unit - Unit to check
 * @returns True if unit is destroyed
 */
export function isDestroyed(unit: GameUnit): boolean

/**
 * Check if a weapon can be individually targeted.
 * @param unit - Unit containing the weapon
 * @param weaponId - Weapon to check
 * @returns True if weapon can be individually targeted
 */
export function canTargetWeapon(unit: GameUnit, weaponId: string): boolean

/**
 * Destroy a specific weapon on a unit.
 * @param unit - Unit to modify
 * @param weaponId - Weapon to destroy
 * @returns True if weapon was found and destroyed
 */
export function destroyWeapon(unit: GameUnit, weaponId: string): boolean</content>
<parameter name="filePath">/home/zymurge/Dev/onion/src/engine/units.ts