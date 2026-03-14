/**
 * Combat resolution system for the Onion game engine.
 *
 * Implements the Combat Results Table (CRT), damage application,
 * special combat rules, and victory condition checking.
 */

import type { HexPos, GameState, Command } from '../types/index.js'
import type { GameMap } from './map.js'
import type { GameUnit, OnionUnit, DefenderUnit } from './units.js'

/**
 * Combat Results Table outcomes.
 */
export type CombatResult = 'NE' | 'D' | 'X'

/**
 * Weapon system types on the Onion.
 */
export type OnionWeaponType = 'main' | 'secondary' | 'ap' | 'missile'

/**
 * Result of rolling on the Combat Results Table.
 */
export interface CombatRoll {
  /** Die roll result (1-6) */
  roll: number
  /** Combat result */
  result: CombatResult
  /** Odds ratio used */
  odds: string
}

/**
 * Result of a combat action.
 */
export interface CombatResultDetails {
  /** Whether the attack succeeded */
  success: boolean
  /** Combat roll details */
  roll?: CombatRoll
  /** Damage applied */
  damage?: {
    /** Target unit ID */
    targetId: string
    /** Tread damage (for Onion) */
    treads?: number
    /** Weapon destroyed (for individually targetable weapons) */
    weaponDestroyed?: string
    /** Unit destroyed (for defenders) */
    unitDestroyed?: boolean
    /** Squads lost (for infantry) */
    squadsLost?: number
  }
  /** Error message if combat failed */
  error?: string
}

/**
 * Validate an Onion weapon firing command.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Fire weapon command to validate
 * @returns Validation result
 */
export function validateOnionWeaponFire(
  map: GameMap,
  state: GameState,
  command: Extract<Command, { type: 'FIRE_WEAPON' }>
): { valid: boolean; error?: string }

/**
 * Validate a defender unit firing command.
 * @param map - The game map
 * @param state - Current game state
 * @param unitId - ID of firing unit
 * @param command - Fire unit command to validate
 * @returns Validation result
 */
export function validateUnitFire(
  map: GameMap,
  state: GameState,
  unitId: string,
  command: Extract<Command, { type: 'FIRE_UNIT' }>
): { valid: boolean; error?: string }

/**
 * Validate a combined fire command.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Combined fire command to validate
 * @returns Validation result
 */
export function validateCombinedFire(
  map: GameMap,
  state: GameState,
  command: Extract<Command, { type: 'COMBINED_FIRE' }>
): { valid: boolean; error?: string }

/**
 * Execute an Onion weapon firing.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Fire weapon command to execute
 * @returns Combat result details
 */
export function executeOnionWeaponFire(
  map: GameMap,
  state: GameState,
  command: Extract<Command, { type: 'FIRE_WEAPON' }>
): CombatResultDetails

/**
 * Execute a defender unit firing.
 * @param map - The game map
 * @param state - Current game state
 * @param unitId - ID of firing unit
 * @param command - Fire unit command to execute
 * @returns Combat result details
 */
export function executeUnitFire(
  map: GameMap,
  state: GameState,
  unitId: string,
  command: Extract<Command, { type: 'FIRE_UNIT' }>
): CombatResultDetails

/**
 * Execute a combined fire attack.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Combined fire command to execute
 * @returns Combat result details
 */
export function executeCombinedFire(
  map: GameMap,
  state: GameState,
  command: Extract<Command, { type: 'COMBINED_FIRE' }>
): CombatResultDetails

/**
 * Roll on the Combat Results Table.
 * @param attackStrength - Total attack strength
 * @param defenseValue - Target defense value
 * @param roll - Optional fixed roll for testing (1-6)
 * @returns Combat roll result
 */
export function rollCombat(
  attackStrength: number,
  defenseValue: number,
  roll?: number
): CombatRoll

/**
 * Calculate combat odds ratio.
 * @param attackStrength - Total attack strength
 * @param defenseValue - Target defense value
 * @returns Odds ratio as string (e.g., "1:1", "2:1", "1:3")
 */
export function calculateOdds(attackStrength: number, defenseValue: number): string

/**
 * Apply damage from a combat result to a target unit.
 * @param target - Unit to damage
 * @param result - Combat result
 * @param attackStrength - Attack strength used
 * @param weaponId - Weapon ID that was used to attack (for subsystem targeting)
 * @returns Damage details
 */
export function applyDamage(
  target: GameUnit,
  result: CombatResult,
  attackStrength: number,
  weaponId?: string
): {
  treads?: number
  weaponDestroyed?: string
  unitDestroyed?: boolean
  squadsLost?: number
}

/**
 * Check if the game has ended and determine the winner.
 * @param state - Current game state
 * @param turnNumber - Current turn number
 * @param maxTurns - Maximum allowed turns
 * @returns Winner ('onion', 'defender', or null if game continues)
 */
export function checkVictoryConditions(
  state: GameState,
  turnNumber: number,
  maxTurns: number
): 'onion' | 'defender' | null

/**
 * Get all valid targets for a firing unit.
 * @param map - The game map
 * @param state - Current game state
 * @param firingUnit - Unit doing the firing
 * @returns Array of valid target unit IDs
 */
export function getValidTargets(
  map: GameMap,
  state: GameState,
  firingUnit: GameUnit
): string[]</content>
<parameter name="filePath">/home/zymurge/Dev/onion/src/engine/combat.ts