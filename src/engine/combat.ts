import logger from '../logger.js'
/**
 * Combat resolution system for the Onion game engine.
 *
 * Implements the Combat Results Table (CRT), damage application,
 * special combat rules, and victory condition checking.
 */

import type { Command } from '../types/index.js'
import { hexDistance } from './map.js'
import type { GameMap } from './map.js'
import { getReadyWeapons, getUnitDefense, getWeaponDefense, destroyWeapon } from './units.js'
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

export type CombatValidationCode =
  | 'WRONG_PHASE'
  | 'WEAPON_NOT_FOUND'
  | 'WEAPON_EXHAUSTED'
  | 'ATTACKER_NOT_FOUND'
  | 'ATTACKER_NOT_OPERATIONAL'
  | 'NO_READY_WEAPONS'
  | 'NO_TARGET'
  | 'TARGET_OUT_OF_RANGE'
  | 'NO_ATTACKERS'
  | 'COMBINED_FIRE_TREAD_TARGET'
  | 'DUPLICATE_ATTACKER'

export type CombatTarget =
  | { kind: 'defender'; id: string }
  | { kind: 'treads'; id: string }
  | { kind: 'weapon'; id: string }

export interface CombatPlan {
  actionType: Extract<Command, { type: 'FIRE' }>['type'] | Extract<Command, { type: 'FIRE_WEAPON' | 'FIRE_UNIT' | 'COMBINED_FIRE' }>['type']
  actor: 'onion' | 'defender'
  attackerIds: string[]
  target: CombatTarget
  attackStrength: number
  defense: number
  weaponId?: string
  weaponIds?: string[]
}

export type CombatValidation =
  | { ok: true; plan: CombatPlan }
  | { ok: false; code: CombatValidationCode; error: string }

export interface CombatExecutionResult {
  success: boolean
  actionType: CombatPlan['actionType']
  attackerIds: string[]
  targetId: string
  roll?: CombatRoll
  treadsLost?: number
  destroyedWeaponId?: string
  statusChanges?: Array<{ unitId: string; from: string; to: string }>
  squadsLost?: number
  error?: string
}

type FireCommand = Extract<Command, { type: 'FIRE' }>
type FireWeaponCommand = Extract<Command, { type: 'FIRE_WEAPON' }>
type FireUnitCommand = Extract<Command, { type: 'FIRE_UNIT' }>
type CombinedFireCommand = Extract<Command, { type: 'COMBINED_FIRE' }>

function resolveOnionWeaponId(onion: OnionUnit, command: FireWeaponCommand): string | null {
  if (command.weaponType === 'main') {
    return command.weaponIndex === 0 && onion.weapons.some((weapon) => weapon.id === 'main')
      ? 'main'
      : null
  }

  const candidateId = `${command.weaponType}_${command.weaponIndex + 1}`
  return onion.weapons.some((weapon) => weapon.id === candidateId) ? candidateId : null
}

function resolveOnionTarget(state: EngineGameState, targetId: string): CombatTarget | null {
  const normalizedTargetId = targetId.trim().toLowerCase()
  if (
    normalizedTargetId === state.onion.id.toLowerCase() ||
    normalizedTargetId === 'onion' ||
    normalizedTargetId === 'tread' ||
    normalizedTargetId === 'treads'
  ) {
    return { kind: 'treads', id: state.onion.id }
  }

  const weapon = state.onion.weapons.find((candidate) => candidate.id === targetId && candidate.individuallyTargetable)
  if (weapon) {
    return { kind: 'weapon', id: weapon.id }
  }

  return null
}

function getWeaponTypeFromId(weaponId: string): 'main' | 'secondary' | 'ap' | 'missile' | null {
  if (weaponId === 'main') return 'main'
  if (weaponId.startsWith('secondary_')) return 'secondary'
  if (weaponId.startsWith('ap_')) return 'ap'
  if (weaponId.startsWith('missile_')) return 'missile'
  return null
}

function applyOnionWeaponCounterDelta(onion: OnionUnit, weaponId: string, delta: number): void {
  const onionState = onion as OnionUnit & {
    missiles?: number
    batteries?: { main: number; secondary: number; ap: number }
  }

  const weaponType = getWeaponTypeFromId(weaponId)
  if (!weaponType) {
    return
  }

  if (weaponType === 'missile') {
    if (onionState.missiles !== undefined) {
      onionState.missiles = Math.max(0, onionState.missiles + delta)
    }
    return
  }

  if (!onionState.batteries) {
    return
  }

  onionState.batteries[weaponType] = Math.max(0, (onionState.batteries[weaponType] ?? 0) + delta)
}

function applyWeaponStatusTransition(onion: OnionUnit, weaponId: string, from: 'ready' | 'spent' | 'destroyed', to: 'ready' | 'spent' | 'destroyed'): void {
  if (from === to) {
    return
  }

  if (from === 'ready' && to !== 'ready') {
    applyOnionWeaponCounterDelta(onion, weaponId, -1)
    return
  }

  if (from !== 'ready' && to === 'ready') {
    applyOnionWeaponCounterDelta(onion, weaponId, 1)
  }
}

function toLegacyValidation(result: CombatValidation): { valid: boolean; error?: string } {
  if (result.ok) {
    return { valid: true }
  }

  return { valid: false, error: result.error }
}

function toLegacyResult(result: CombatExecutionResult): CombatResultDetails {
  if (!result.success) {
    return { success: false, error: result.error }
  }

  const statusChange = result.statusChanges?.[0]

  return {
    success: true,
    roll: result.roll,
    damage: {
      targetId: result.targetId,
      ...(result.treadsLost !== undefined ? { treads: result.treadsLost } : {}),
      ...(result.destroyedWeaponId ? { weaponDestroyed: result.destroyedWeaponId } : {}),
      ...(statusChange?.to === 'destroyed' ? { unitDestroyed: true } : {}),
      ...(result.squadsLost !== undefined ? { squadsLost: result.squadsLost } : {}),
    },
  }
}

export function validateCombatAction(
  map: GameMap,
  state: EngineGameState,
  command: Extract<Command, { type: 'FIRE' | 'FIRE_WEAPON' | 'FIRE_UNIT' | 'COMBINED_FIRE' }>
): CombatValidation {
  logger.info({ commandType: command.type }, 'Validating combat action')
  logger.debug({ map, state, command }, 'validateCombatAction input')

  const normalizedCommand: FireCommand =
    command.type === 'FIRE'
      ? command
      : command.type === 'FIRE_WEAPON'
        ? {
            type: 'FIRE',
            attackers: (() => {
              const weaponId = resolveOnionWeaponId(state.onion, command)
              return weaponId ? [weaponId] : []
            })(),
            targetId: command.targetId,
          }
        : command.type === 'FIRE_UNIT'
          ? { type: 'FIRE', attackers: [command.unitId], targetId: command.targetId }
          : { type: 'FIRE', attackers: [...command.unitIds], targetId: command.targetId }

  if (normalizedCommand.attackers.length === 0) {
    return { ok: false, code: 'NO_ATTACKERS', error: 'No attackers specified for fire action' }
  }

  if (state.currentPhase === 'ONION_COMBAT') {
    const target = state.defenders[normalizedCommand.targetId]
    if (!target) {
      return { ok: false, code: 'NO_TARGET', error: 'Target not found' }
    }
    if (target.status === 'destroyed') {
      return { ok: false, code: 'NO_TARGET', error: 'Target is already destroyed' }
    }

    const seen = new Set<string>()
    const weaponIds: string[] = []
    const weapons: Array<OnionUnit['weapons'][number]> = []
    let attackStrength = 0

    for (const attackerId of normalizedCommand.attackers) {
      if (seen.has(attackerId)) {
        return { ok: false, code: 'DUPLICATE_ATTACKER', error: `Duplicate attacker '${attackerId}'` }
      }
      seen.add(attackerId)

      const weapon = state.onion.weapons.find((candidate) => candidate.id === attackerId)
      if (!weapon) {
        return { ok: false, code: 'WEAPON_NOT_FOUND', error: `Attacker '${attackerId}' not found` }
      }
      if (weapon.status !== 'ready') {
        return { ok: false, code: 'WEAPON_EXHAUSTED', error: `Attacker '${attackerId}' is already destroyed or exhausted` }
      }

      weaponIds.push(weapon.id)
      weapons.push(weapon)
      attackStrength += weapon.attack
    }

    for (let index = 0; index < weapons.length; index += 1) {
      const weapon = weapons[index]
      const attackerId = normalizedCommand.attackers[index]
      if (hexDistance(state.onion.position, target.position) > weapon.range) {
        return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
      }
    }

    return {
      ok: true,
      plan: {
        actionType: 'FIRE',
        actor: 'onion',
        attackerIds: [...normalizedCommand.attackers],
        target: { kind: 'defender', id: target.id },
        attackStrength,
        defense: getUnitDefense(target, false),
        weaponIds,
      },
    }
  }

  if (state.currentPhase !== 'DEFENDER_COMBAT') {
    return { ok: false, code: 'WRONG_PHASE', error: 'Not a combat phase' }
  }

  const target = resolveOnionTarget(state, normalizedCommand.targetId)
  if (!target) {
    return { ok: false, code: 'NO_TARGET', error: 'Target not found' }
  }

  if (target.kind === 'treads' && normalizedCommand.attackers.length > 1) {
    return { ok: false, code: 'COMBINED_FIRE_TREAD_TARGET', error: 'Combined fire is not allowed on Onion treads.' }
  }

  let attackStrength = 0
  const seen = new Set<string>()
  for (const attackerId of normalizedCommand.attackers) {
    if (seen.has(attackerId)) {
      return { ok: false, code: 'DUPLICATE_ATTACKER', error: `Duplicate attacker '${attackerId}'` }
    }
    seen.add(attackerId)

    const unit = state.defenders[attackerId]
    if (!unit) {
      return { ok: false, code: 'ATTACKER_NOT_FOUND', error: `Attacker '${attackerId}' not found` }
    }
    if (unit.status !== 'operational') {
      return { ok: false, code: 'ATTACKER_NOT_OPERATIONAL', error: `Attacker '${attackerId}' is not operational` }
    }

    const readyWeapons = getReadyWeapons(unit)
    if (readyWeapons.length === 0) {
      return { ok: false, code: 'NO_READY_WEAPONS', error: `Attacker '${attackerId}' has no ready weapons` }
    }

    const maxRange = Math.max(...readyWeapons.map((weapon) => weapon.range), 0)
    if (hexDistance(unit.position, state.onion.position) > maxRange) {
      return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
    }

    attackStrength += readyWeapons.reduce((total, weapon) => total + weapon.attack, 0)
  }

  return {
    ok: true,
    plan: {
      actionType: 'FIRE',
      actor: 'defender',
      attackerIds: [...normalizedCommand.attackers],
      target,
      attackStrength,
      defense: target.kind === 'weapon' ? getWeaponDefense(state.onion, target.id) : 0,
    },
  }
}

export function executeCombatAction(
  state: EngineGameState,
  plan: CombatPlan,
  roll?: number
): CombatExecutionResult {
  logger.info({ plan }, 'Executing combat action')
  logger.debug({ plan }, 'executeCombatAction input')
  const defense = plan.target.kind === 'treads' ? plan.attackStrength : plan.defense
  const combatRoll = rollCombat(plan.attackStrength, defense, roll)

  if (plan.actor === 'onion') {
    if (plan.target.kind !== 'defender') {
      return {
        success: false,
        actionType: plan.actionType,
        attackerIds: plan.attackerIds,
        targetId: plan.target.id,
        error: 'Invalid target for Onion fire',
      }
    }

    const defender = state.defenders[plan.target.id]
    if (!defender) {
      return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, targetId: plan.target.id, error: 'Target not found' }
    }

    if (defender.status === 'destroyed') {
      return {
        success: false,
        actionType: plan.actionType,
        attackerIds: plan.attackerIds,
        targetId: plan.target.id,
        error: 'Target is already destroyed',
      }
    }

    const firingWeaponIds = plan.weaponIds ?? (plan.weaponId ? [plan.weaponId] : [])
    const firingWeapons: Array<OnionUnit['weapons'][number]> = []
    for (const weaponId of firingWeaponIds) {
      const weapon = state.onion.weapons.find((candidate) => candidate.id === weaponId)
      if (!weapon) {
        return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, targetId: plan.target.id, error: `Weapon '${weaponId}' not found` }
      }
      if (weapon.status !== 'ready') {
        return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, targetId: plan.target.id, error: `Weapon '${weaponId}' is not ready` }
      }
      firingWeapons.push(weapon)
    }

    const previousStatus = defender.status
    const damage = applyDamage(defender, combatRoll.result, plan.attackStrength)
    for (const firedWeapon of firingWeapons) {
      if (firedWeapon.id.startsWith('missile_')) {
        const previousWeaponStatus = firedWeapon.status
        destroyWeapon(state.onion, firedWeapon.id)
        applyWeaponStatusTransition(state.onion, firedWeapon.id, previousWeaponStatus, 'destroyed')
      } else {
        const previousWeaponStatus = firedWeapon.status
        firedWeapon.status = 'spent'
        applyWeaponStatusTransition(state.onion, firedWeapon.id, previousWeaponStatus, 'spent')
      }
    }

    const statusChanges = defender.status !== previousStatus
      ? [{ unitId: defender.id, from: previousStatus, to: defender.status }]
      : undefined

    return {
      success: true,
      actionType: plan.actionType,
      attackerIds: plan.attackerIds,
      targetId: defender.id,
      roll: combatRoll,
      statusChanges,
      squadsLost: damage.squadsLost,
    }
  }

  const targetedWeaponPreviousStatus =
    plan.target.kind === 'weapon'
      ? state.onion.weapons.find((weapon) => weapon.id === plan.target.id)?.status
      : undefined

  const damage = applyDamage(
    state.onion,
    combatRoll.result,
    plan.attackStrength,
    plan.target.kind === 'weapon' ? plan.target.id : undefined
  )
  if (damage.weaponDestroyed) {
    const previousStatus = targetedWeaponPreviousStatus ?? 'ready'
    applyWeaponStatusTransition(state.onion, damage.weaponDestroyed, previousStatus, 'destroyed')
  }

  // Mark defender weapons as spent after firing
  for (const attackerId of plan.attackerIds) {
    const attacker = state.defenders[attackerId]
    if (attacker && attacker.weapons) {
      for (const weapon of attacker.weapons) {
        if (weapon.status === 'ready') {
          weapon.status = 'spent'
          break // Only mark the first ready weapon as spent
        }
      }
    }
  }

  return {
    success: true,
    actionType: plan.actionType,
    attackerIds: plan.attackerIds,
    targetId: plan.target.kind === 'treads' ? state.onion.id : plan.target.id,
    roll: combatRoll,
    treadsLost: damage.treads,
    destroyedWeaponId: damage.weaponDestroyed,
  }
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
  command: FireWeaponCommand | FireCommand
): { valid: boolean; error?: string } {
  return toLegacyValidation(validateCombatAction(map, state, command))
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
  command: FireUnitCommand | FireCommand
): { valid: boolean; error?: string } {
  if (command.type === 'FIRE') {
    return toLegacyValidation(validateCombatAction(map, state, command))
  }
  return toLegacyValidation(validateCombatAction(map, state, { ...command, unitId }))
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
  command: CombinedFireCommand | FireCommand
): { valid: boolean; error?: string } {
  return toLegacyValidation(validateCombatAction(map, state, command))
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
  command: FireWeaponCommand | FireCommand,
  roll?: number
): CombatResultDetails {
  const validation = validateCombatAction(map, state, command)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  return toLegacyResult(executeCombatAction(state, validation.plan, roll))
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
  command: FireUnitCommand | FireCommand,
  roll?: number
): CombatResultDetails {
  const validation = command.type === 'FIRE'
    ? validateCombatAction(map, state, command)
    : validateCombatAction(map, state, { ...command, unitId })
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  return toLegacyResult(executeCombatAction(state, validation.plan, roll))
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
  command: CombinedFireCommand | FireCommand,
  roll?: number
): CombatResultDetails {
  const validation = validateCombatAction(map, state, command)
  if (!validation.ok) {
    return { success: false, error: validation.error }
  }

  return toLegacyResult(executeCombatAction(state, validation.plan, roll))
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
