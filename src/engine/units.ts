/**
 * Unit definitions and capabilities for the Onion game engine.
 *
 * Defines all unit types, their stats, special abilities, and game mechanics.
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
 * Unit stats that define capabilities and combat values.
 */
export interface UnitStats {
  /** Attack strength */
  attack: number
  /** Defense value */
  defense: number
  /** Movement allowance in hexes */
  movement: number
  /** Range in hexes (0 for melee-only) */
  range: number
  /** Cost in victory points (for defender units) */
  cost?: number
}

/**
 * Special abilities that units can have.
 */
export interface UnitAbilities {
  /** Can move and fire in the same turn (GEV) */
  secondMove?: boolean
  /** Can stack multiple squads in one hex (infantry) */
  stackable?: boolean
  /** Maximum squads per hex (for stackable units) */
  maxSquads?: number
  /** Immobile once placed (artillery) */
  immobile?: boolean
  /** Multiple attack systems (Dragon has 2 attacks) */
  multiAttack?: number
  /** Special terrain movement (Onion can cross ridgelines) */
  canCrossRidgelines?: boolean
}

/**
 * Complete unit definition combining stats and abilities.
 */
export interface UnitDefinition {
  /** Display name */
  name: string
  /** Unit type identifier */
  type: UnitType
  /** Base stats */
  stats: UnitStats
  /** Special abilities */
  abilities: UnitAbilities
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
}

/**
 * The Onion super-unit with detailed subsystem state.
 */
export interface OnionUnit extends GameUnit {
  type: 'TheOnion'
  /** Current tread points (0-45) */
  treads: number
  /** Remaining missiles (0-2) */
  missiles: number
  /** Battery counts by type */
  batteries: {
    main: number      // 0-1
    secondary: number // 0-4
    ap: number        // 0-8
  }
}

/**
 * Defender unit (any non-Onion unit).
 */
export interface DefenderUnit extends GameUnit {
  type: Exclude<UnitType, 'TheOnion'>
}

/**
 * Get the definition for a unit type.
 * @param type - Unit type to look up
 * @returns Unit definition with stats and abilities
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
 * Get the effective defense value for a unit.
 * @param unit - Unit to check
 * @param inCover - Whether unit is in terrain providing cover
 * @returns Effective defense value
 */
export function getEffectiveDefense(unit: GameUnit, inCover: boolean): number

/**
 * Check if a unit is destroyed (has no remaining combat capability).
 * @param unit - Unit to check
 * @returns True if unit is destroyed
 */
export function isDestroyed(unit: GameUnit): boolean</content>
<parameter name="filePath">/home/zymurge/Dev/onion/src/engine/units.ts