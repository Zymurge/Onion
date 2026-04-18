/**
 * Unit definitions and capabilities for the Onion game engine.
 */

import type { HexPos, UnitStatus, TurnPhase, Weapon, TargetRules } from '#shared/types/index'
import type { UnitDefinition, UnitType } from '#shared/engineTypes'
import { getAllUnitDefinitions as getSharedUnitDefinitions } from '#shared/unitDefinitions'
import logger from '#server/logger'
import { onionMovementAllowance } from '#shared/movementAllowance'
export type { RamProfile, UnitAbilities, UnitTerrainRule, UnitDefinition, UnitType, WeaponStatus } from '#shared/engineTypes'
export type { Weapon } from '#shared/types/index'

/**
 * A game unit with current state.
 */
export interface GameUnit {
  /** Unique identifier */
  id: string
  /** Unit type */
  type: UnitType
  /** Human-friendly name for display */
  friendlyName?: string
  /** Current position */
  position: HexPos
  /** Current status */
  status: UnitStatus
  /** Number of squads (for infantry) */
  squads?: number
  /** Current weapon states */
  weapons: Weapon[]
  /** Optional target restrictions for this live unit state. */
  targetRules?: TargetRules
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
  /** Number of rams the Onion has performed this turn */
  ramsThisTurn: number
  /** Movement already spent this turn, keyed by phase and unit ID */
  movementSpent?: Record<string, number>
  /** Current phase of play */
  currentPhase: TurnPhase
  /** Current turn number (1-based) */
  turn: number
}

/**
 * Get the definition for a unit type.
 * @param type - Unit type to look up
 * @returns Unit definition with weapons and abilities
 */
export function getUnitDefinition(type: UnitType): UnitDefinition
export function getUnitDefinition(type: string): UnitDefinition | undefined
export function getUnitDefinition(type: UnitType | string): UnitDefinition | undefined {
  logger.debug({ type }, 'getUnitDefinition called')
  const def = UNIT_DEFINITIONS[type as UnitType]
  if (!def) {
    logger.error({ type }, 'getUnitDefinition: unknown unit type')
  }
  return def
}

/**
 * Get all unit definitions.
 * @returns Map of unit type to definition
 */
export function getAllUnitDefinitions(): Record<UnitType, UnitDefinition> {
  return getSharedUnitDefinitions()
}

export { onionMovementAllowance }

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
  if (!weapon) {
    logger.warn({ unitId: unit.id, weaponId }, 'destroyWeapon: weapon not found')
    return false
  }
  weapon.status = 'destroyed'
  return true
}

// ─── Unit Definitions ────────────────────────────────────────────────────────

const UNIT_DEFINITIONS = getSharedUnitDefinitions()
