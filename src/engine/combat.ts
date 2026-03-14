/**
 * Combat resolution system for the Onion game engine.
 *
 * Implements the Combat Results Table (CRT), damage application,
 * special combat rules, and victory condition checking.
 */

import type { Command } from '../types/index.js'
import { hexDistance } from './map.js'
import type { GameMap } from './map.js'
import { getUnitDefinition, getReadyWeapons, destroyWeapon } from './units.js'
import type { GameUnit, OnionUnit, DefenderUnit, EngineGameState } from './units.js'

/**
 * Combat Results Table outcomes.
 */
export type CombatResult = 'NE' | 'D' | 'X'

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
  state: EngineGameState,
  command: Extract<Command, { type: 'FIRE_WEAPON' }>
): { valid: boolean; error?: string } {
  if (state.currentPhase !== 'ONION_COMBAT') {
    return { valid: false, error: 'Not the Onion combat phase' }
  }
  const weapon = state.onion.weapons.find(w => w.id === command.weaponId)
  if (!weapon) {
    return { valid: false, error: `Weapon '${command.weaponId}' not found` }
  }
  if (weapon.status === 'destroyed') {
    return { valid: false, error: `Weapon '${command.weaponId}' is destroyed` }
  }
  // Resolve target: could be a defender ID or Onion weapon subsystem
  const target = state.defenders[command.targetId] ?? null
  if (!target) {
    return { valid: false, error: `Target '${command.targetId}' not found` }
  }
  if (hexDistance(state.onion.position, target.position) > weapon.range) {
    return { valid: false, error: 'Target is out of range' }
  }
  return { valid: true }
}

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
  state: EngineGameState,
  unitId: string,
  command: Extract<Command, { type: 'FIRE_UNIT' }>
): { valid: boolean; error?: string } {
  if (state.currentPhase !== 'DEFENDER_COMBAT') {
    return { valid: false, error: 'Not the defender combat phase' }
  }
  const unit = state.defenders[unitId]
  if (!unit) {
    return { valid: false, error: `Unit '${unitId}' not found` }
  }
  if (unit.status !== 'operational') {
    return { valid: false, error: 'Unit is not operational' }
  }
  const maxRange = Math.max(...getReadyWeapons(unit).map(w => w.range), 0)
  if (hexDistance(unit.position, state.onion.position) > maxRange) {
    return { valid: false, error: 'Target is out of range' }
  }
  return { valid: true }
}

/**
 * Validate a combined fire command.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Combined fire command to validate
 * @returns Validation result
 */
export function validateCombinedFire(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'COMBINED_FIRE' }>
): { valid: boolean; error?: string } {
  if (state.currentPhase !== 'DEFENDER_COMBAT') {
    return { valid: false, error: 'Not the defender combat phase' }
  }
  if (command.unitIds.length === 0) {
    return { valid: false, error: 'No units specified for combined fire' }
  }
  for (const id of command.unitIds) {
    const unit = state.defenders[id]
    if (!unit) return { valid: false, error: `Unit '${id}' not found` }
    if (unit.status !== 'operational') return { valid: false, error: `Unit '${id}' is not operational` }
    const maxRange = Math.max(...getReadyWeapons(unit).map(w => w.range), 0)
    if (hexDistance(unit.position, state.onion.position) > maxRange) {
      return { valid: false, error: `Unit '${id}' is out of range` }
    }
  }
  return { valid: true }
}

/**
 * Execute an Onion weapon firing.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Fire weapon command to execute
 * @param roll - Optional fixed die roll (1-6) for testing
 * @returns Combat result details
 */
export function executeOnionWeaponFire(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'FIRE_WEAPON' }>,
  roll?: number
): CombatResultDetails {
  const weapon = state.onion.weapons.find(w => w.id === command.weaponId)
  if (!weapon) return { success: false, error: `Weapon '${command.weaponId}' not found` }

  const target = state.defenders[command.targetId] ?? null
  if (!target) return { success: false, error: `Target '${command.targetId}' not found` }

  const defense = getUnitDefinition(target.type).defense
  const combatRoll = rollCombat(weapon.attack, defense, roll)
  const damage = applyDamage(target, combatRoll.result, weapon.attack)

  return {
    success: true,
    roll: combatRoll,
    damage: { targetId: command.targetId, ...damage },
  }
}

/**
 * Execute a defender unit firing.
 * @param map - The game map
 * @param state - Current game state
 * @param unitId - ID of firing unit
 * @param command - Fire unit command to execute
 * @param roll - Optional fixed die roll (1-6) for testing
 * @returns Combat result details
 */
export function executeUnitFire(
  map: GameMap,
  state: EngineGameState,
  unitId: string,
  command: Extract<Command, { type: 'FIRE_UNIT' }>,
  roll?: number
): CombatResultDetails {
  const unit = state.defenders[unitId]
  if (!unit) return { success: false, error: `Unit '${unitId}' not found` }

  const def = getUnitDefinition(unit.type)
  const attackStrength = def.weapons.reduce((sum, w) => sum + w.attack, 0)
  // Special rule 7.13.2: all tread attacks resolved at 1:1 odds
  const combatRoll = rollCombat(attackStrength, attackStrength, roll)
  const damage = applyDamage(state.onion, combatRoll.result, attackStrength)

  return {
    success: true,
    roll: combatRoll,
    damage: { targetId: command.targetId, ...damage },
  }
}

/**
 * Execute a combined fire attack.
 * @param map - The game map
 * @param state - Current game state
 * @param command - Combined fire command to execute
 * @param roll - Optional fixed die roll (1-6) for testing
 * @returns Combat result details
 */
export function executeCombinedFire(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'COMBINED_FIRE' }>,
  roll?: number
): CombatResultDetails {
  // Combined attack strength from all participating units
  const totalAttack = command.unitIds.reduce((sum, id) => {
    const unit = state.defenders[id]
    if (!unit) return sum
    return sum + unit.weapons.reduce((s, w) => s + w.attack, 0)
  }, 0)

  // Combined fire targets the Onion; targetId may be onion ID or a weapon subsystem ID
  const weaponTarget = state.onion.weapons.find(w => w.id === command.targetId)
  const defense = weaponTarget
    ? weaponTarget.defense
    : getUnitDefinition(state.onion.type).defense

  const combatRoll = rollCombat(totalAttack, defense, roll)
  const damage = applyDamage(state.onion, combatRoll.result, totalAttack, weaponTarget ? command.targetId : undefined)

  return {
    success: true,
    roll: combatRoll,
    damage: { targetId: command.targetId, ...damage },
  }
}

/**
 * Roll on the Combat Results Table.
 * @param attackStrength - Total attack strength
 * @param defenseValue - Target defense value
 * @param roll - Optional fixed roll for testing (1-6)
 * @returns Combat roll result
 */
// CRT[odds][roll-1]: rows = odds column, cols = die 1–6
const CRT: Record<string, CombatResult[]> = {
  '1:3': ['NE', 'NE', 'NE', 'NE', 'NE', 'NE'],
  '1:2': ['NE', 'NE', 'NE', 'NE', 'D',  'X' ],
  '1:1': ['NE', 'NE', 'D',  'D',  'X',  'X' ],
  '2:1': ['NE', 'D',  'D',  'X',  'X',  'X' ],
  '3:1': ['D',  'D',  'X',  'X',  'X',  'X' ],
  '4:1': ['D',  'X',  'X',  'X',  'X',  'X' ],
  '5:1': ['X',  'X',  'X',  'X',  'X',  'X' ],
}

export function rollCombat(
  attackStrength: number,
  defenseValue: number,
  roll?: number
): CombatRoll {
  const odds = calculateOdds(attackStrength, defenseValue)
  const d6 = roll ?? (Math.floor(Math.random() * 6) + 1)
  const result = CRT[odds][d6 - 1]
  return { roll: d6, result, odds }
}

/**
 * Calculate combat odds ratio.
 * @param attackStrength - Total attack strength
 * @param defenseValue - Target defense value
 * @returns Odds ratio as string (e.g., "1:1", "2:1", "1:3")
 */
export function calculateOdds(attackStrength: number, defenseValue: number): string {
  if (defenseValue === 0) return '5:1'
  const ratio = attackStrength / defenseValue
  if (ratio >= 5) return '5:1'
  if (ratio >= 4) return '4:1'
  if (ratio >= 3) return '3:1'
  if (ratio >= 2) return '2:1'
  if (ratio >= 1) return '1:1'
  if (ratio >= 0.5) return '1:2'
  return '1:3'
}

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
} {
  if (target.type === 'TheOnion') {
    const onion = target as OnionUnit
    if (result !== 'X') return {}
    if (weaponId) {
      destroyWeapon(onion, weaponId)
      return { weaponDestroyed: weaponId }
    }
    // Tread attack: X → lose treads equal to attack strength
    const lost = attackStrength
    onion.treads = Math.max(0, onion.treads - lost)
    return { treads: lost }
  }

  // Defender unit
  if (result === 'NE') return {}

  if (target.type === 'LittlePigs') {
    if (result === 'X') {
      target.status = 'destroyed'
      return { unitDestroyed: true }
    }
    // D: remove one squad
    const squads = (target.squads ?? 1) - 1
    target.squads = squads
    if (squads <= 0) {
      target.status = 'destroyed'
    }
    return { squadsLost: 1 }
  }

  if (result === 'D') {
    target.status = 'disabled'
    return {}
  }
  // X
  target.status = 'destroyed'
  return { unitDestroyed: true }
}

/**
 * Get all valid targets for a firing unit.
 * @param map - The game map
 * @param state - Current game state
 * @param firingUnit - Unit doing the firing
 * @returns Array of valid target unit IDs
 */
export function getValidTargets(
  map: GameMap,
  state: EngineGameState,
  firingUnit: GameUnit
): string[] {
  const maxRange = Math.max(...getReadyWeapons(firingUnit).map(w => w.range), 0)
  const results: string[] = []

  if (firingUnit.type === 'TheOnion') {
    // Onion targets defenders
    for (const [id, unit] of Object.entries(state.defenders)) {
      if (unit.status === 'destroyed') continue
      if (hexDistance(firingUnit.position, unit.position) <= maxRange) {
        results.push(id)
      }
    }
  } else {
    // Defender targets Onion
    if (hexDistance(firingUnit.position, state.onion.position) <= maxRange) {
      results.push(state.onion.id)
    }
  }
  return results
}
