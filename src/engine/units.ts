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
  /** Base defense rating (for infantry: defense per squad) */
  defense: number
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
export function getUnitDefinition(type: UnitType): UnitDefinition {
  return UNIT_DEFINITIONS[type]
}

/**
 * Get all unit definitions.
 * @returns Map of unit type to definition
 */
export function getAllUnitDefinitions(): Record<UnitType, UnitDefinition> {
  return { ...UNIT_DEFINITIONS }
}

/**
 * Calculate movement allowance based on current tread points.
 * @param treads - Current tread points (0-45)
 * @returns Movement allowance (0-3)
 */
export function onionMovementAllowance(treads: number): number {
  if (treads === 0) return 0
  if (treads <= 15) return 1
  if (treads <= 30) return 2
  return 3
}

/**
 * Check if a unit can perform a second move (GEV ability).
 * @param unit - Unit to check
 * @returns True if unit can perform second move
 */
export function canSecondMove(unit: GameUnit): boolean {
  return getUnitDefinition(unit.type).abilities.secondMove === true
}

/**
 * Check if a unit is immobilized (cannot move).
 * @param unit - Unit to check
 * @returns True if unit cannot move
 */
export function isImmobile(unit: GameUnit): boolean {
  return getUnitDefinition(unit.type).abilities.immobile === true
}

/**
 * Get the effective defense value for a unit when targeted.
 * @param unit - Unit to check
 * @param inCover - Whether unit is in terrain providing cover
 * @returns Effective defense value
 */
export function getUnitDefense(unit: GameUnit, inCover: boolean): number {
  const def = getUnitDefinition(unit.type)
  if (unit.type === 'LittlePigs') {
    const squads = unit.squads ?? 1
    return squads * def.defense + (inCover ? 1 : 0)
  }
  return def.defense
}

/**
 * Get the defense value of a specific weapon when individually targeted.
 * @param unit - Unit containing the weapon
 * @param weaponId - Weapon to check
 * @returns Weapon defense value, or unit defense if not individually targetable
 */
export function getWeaponDefense(unit: GameUnit, weaponId: string): number {
  const weapon = unit.weapons.find(w => w.id === weaponId)
  if (weapon && weapon.individuallyTargetable) {
    return weapon.defense
  }
  return getUnitDefense(unit, false)
}

/**
 * Get all ready (non-destroyed) weapons for a unit.
 * @param unit - Unit to check
 * @returns Array of ready weapons
 */
export function getReadyWeapons(unit: GameUnit): Weapon[] {
  return unit.weapons.filter(w => w.status === 'ready')
}

/**
 * Check if a unit is destroyed (has no remaining combat capability).
 * @param unit - Unit to check
 * @returns True if unit is destroyed
 */
export function isDestroyed(unit: GameUnit): boolean {
  return unit.status === 'destroyed'
}

/**
 * Check if a weapon can be individually targeted.
 * @param unit - Unit containing the weapon
 * @param weaponId - Weapon to check
 * @returns True if weapon can be individually targeted
 */
export function canTargetWeapon(unit: GameUnit, weaponId: string): boolean {
  const weapon = unit.weapons.find(w => w.id === weaponId)
  return weapon?.individuallyTargetable === true
}

/**
 * Destroy a specific weapon on a unit.
 * @param unit - Unit to modify
 * @param weaponId - Weapon to destroy
 * @returns True if weapon was found and destroyed
 */
export function destroyWeapon(unit: GameUnit, weaponId: string): boolean {
  const weapon = unit.weapons.find(w => w.id === weaponId)
  if (!weapon) return false
  weapon.status = 'destroyed'
  return true
}

// ─── Unit Definitions ────────────────────────────────────────────────────────

function makeWeapon(
  id: string,
  name: string,
  attack: number,
  range: number,
  defense: number,
  individuallyTargetable = false
): Weapon {
  return { id, name, attack, range, defense, status: 'ready', individuallyTargetable }
}

const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  Puss: {
    name: 'Puss',
    type: 'Puss',
    movement: 3,
    defense: 3,
    cost: 1,
    abilities: { maxStacks: 1, isArmor: true },
    weapons: [makeWeapon('main', 'Main Gun', 4, 2, 3)],
  },

  BigBadWolf: {
    name: 'Big Bad Wolf',
    type: 'BigBadWolf',
    movement: 2,
    defense: 4,
    cost: 1,
    abilities: { maxStacks: 1, isArmor: true, secondMove: true },
    weapons: [makeWeapon('main', 'Cannon', 2, 2, 4)],
  },

  Witch: {
    name: 'Witch',
    type: 'Witch',
    movement: 2,
    defense: 2,
    cost: 1,
    abilities: { maxStacks: 1, isArmor: true },
    weapons: [makeWeapon('main', 'Missile Launcher', 3, 4, 2)],
  },

  LordFarquaad: {
    name: 'Lord Farquaad',
    type: 'LordFarquaad',
    movement: 0,
    defense: 0,
    cost: 2,
    abilities: { maxStacks: 1, immobile: true },
    weapons: [makeWeapon('main', 'Howitzer', 6, 8, 0)],
  },

  Pinocchio: {
    name: 'Pinocchio',
    type: 'Pinocchio',
    movement: 2,
    defense: 3,
    cost: 0.5,
    abilities: { maxStacks: 1, isArmor: true },
    weapons: [makeWeapon('main', 'Light Gun', 2, 2, 3)],
  },

  Dragon: {
    name: 'Dragon',
    type: 'Dragon',
    movement: 5,
    defense: 3,
    cost: 2,
    abilities: { maxStacks: 1, isArmor: true },
    weapons: [
      makeWeapon('main_1', 'Heavy Gun A', 6, 3, 3),
      makeWeapon('main_2', 'Heavy Gun B', 6, 3, 3),
    ],
  },

  LittlePigs: {
    name: 'Little Pigs',
    type: 'LittlePigs',
    movement: 1,
    defense: 1,     // per squad; getUnitDefense multiplies by unit.squads
    cost: 1,        // per 3 squads
    abilities: { maxStacks: 3, canCrossRidgelines: true },
    weapons: [makeWeapon('rifle', 'Rifle', 1, 1, 1)],
  },

  Castle: {
    name: 'Castle',
    type: 'Castle',
    movement: 0,
    defense: 0,
    abilities: { maxStacks: 1 },
    weapons: [],
  },

  TheOnion: {
    name: 'The Onion',
    type: 'TheOnion',
    movement: 3,    // max MA (at 31–45 treads); onionMovementAllowance() gives actual MA
    defense: 0,     // Onion has no unit-level defense; each subsystem has its own
    abilities: { maxStacks: 1, canCrossRidgelines: true },
    weapons: [
      makeWeapon('main', 'Main Battery', 4, 3, 4, true),
      makeWeapon('secondary_1', 'Secondary Battery', 3, 2, 3, true),
      makeWeapon('secondary_2', 'Secondary Battery', 3, 2, 3, true),
      makeWeapon('secondary_3', 'Secondary Battery', 3, 2, 3, true),
      makeWeapon('secondary_4', 'Secondary Battery', 3, 2, 3, true),
      makeWeapon('ap_1', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_2', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_3', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_4', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_5', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_6', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_7', 'AP Gun', 1, 1, 1, true),
      makeWeapon('ap_8', 'AP Gun', 1, 1, 1, true),
      makeWeapon('missile_1', 'Missile', 6, 5, 3, true),
      makeWeapon('missile_2', 'Missile', 6, 5, 3, true),
    ],
  },
}
