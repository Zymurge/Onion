import logger from '#server/logger'
/**
 * Combat resolution system for the Onion game engine.
 *
 * Implements the Combat Results Table (CRT), damage application,
 * special combat rules, and victory condition checking.
 */

import type { Command } from '#shared/types/index'
import type { GameMap } from '#server/engine/map'
import { hexDistance } from '#shared/hex'
import {
  createCombatCalculator,
  calculateOdds as sharedCalculateOdds,
  type CombatCalculatorInput,
} from '#shared/combatCalculator'
import { ONION_STATIC_RULES } from '#shared/staticRules'
import { isTargetAllowedByRules, resolveUnitTargetRules, resolveWeaponTargetRules } from '#shared/targetRules'
import { getReadyWeapons, getUnitDefense, getWeaponDefense, destroyWeapon } from '#server/engine/units'
import type { GameUnit, OnionUnit, DefenderUnit, EngineGameState } from '#server/engine/units'

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
  | 'INVALID_TARGET'
  | 'TARGET_OUT_OF_RANGE'
  | 'NO_ATTACKERS'
  | 'MULTI_ATTACK_TREAD_TARGET'
  | 'DUPLICATE_ATTACKER'

export type CombatTarget =
  | { kind: 'defender'; id: string }
  | { kind: 'treads'; id: string }
  | { kind: 'weapon'; id: string }

export interface CombatPlan {
  actionType: Extract<Command, { type: 'FIRE' }>['type']
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

const COMBAT_STATIC_RULES = ONION_STATIC_RULES

const combatCalculator = createCombatCalculator(COMBAT_STATIC_RULES)

function getTerrainTypeAt(map: GameMap, position: { q: number; r: number }) {
  return map.hexes[`${position.q},${position.r}`]?.terrain
}

function buildCombatCalculatorInput(
  map: GameMap,
  state: EngineGameState,
  target: CombatTarget,
  attackerIds: string[],
): CombatCalculatorInput {
  const units: CombatCalculatorInput['combatState']['units'] = {}

  if (state.currentPhase === 'ONION_COMBAT') {
    for (const attackerId of attackerIds) {
      units[attackerId] = {
        type: 'TheOnion',
          weapons: state.onion.weapons,
          weaponIds: [attackerId],
      }
    }

    const defender = state.defenders[target.id]
    if (defender) {
      units[target.id] = {
        type: defender.type,
        squads: defender.squads,
        terrainType: getTerrainTypeAt(map, defender.position),
          weapons: defender.weapons,
        }
    }

    return {
      attackerGroupIds: [...attackerIds],
      targetId: target.id,
      combatState: { units },
    }
  }

  for (const attackerId of attackerIds) {
    const attacker = state.defenders[attackerId]
    if (attacker) {
        units[attackerId] = { type: attacker.type, weapons: attacker.weapons }
    }
  }

  const targetPosition = target.kind === 'weapon'
    ? state.onion.position
    : state.onion.position

  units[state.onion.id] = {
    type: 'TheOnion',
    weaponId: target.kind === 'weapon' ? target.id : undefined,
    terrainType: getTerrainTypeAt(map, targetPosition),
      weapons: state.onion.weapons,
  }

  return {
    attackerGroupIds: [...attackerIds],
    targetId: state.onion.id,
    combatState: { units },
  }
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
  command: FireCommand
): CombatValidation {
  logger.info({ commandType: command.type }, 'Validating combat action')
  logger.debug({ map, state, command }, 'validateCombatAction input')

  if (command.attackers.length === 0) {
    return { ok: false, code: 'NO_ATTACKERS', error: 'No attackers specified for fire action' }
  }

  if (state.currentPhase !== 'ONION_COMBAT' && state.currentPhase !== 'DEFENDER_COMBAT') {
    return { ok: false, code: 'WRONG_PHASE', error: 'Not a combat phase' }
  }

  if (state.currentPhase === 'ONION_COMBAT') {
    const target = state.defenders[command.targetId]
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

    for (const attackerId of command.attackers) {
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
      const attackerId = command.attackers[index]
      if (hexDistance(state.onion.position, target.position) > weapon.range) {
        return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
      }
    }

    const defenderDefinition = COMBAT_STATIC_RULES.unitDefinitions[target.type]
    const targetAllowed = weapons.every((weapon) =>
      isTargetAllowedByRules(
        {
          unitType: 'TheOnion',
          weaponId: weapon.id,
          targetRules: resolveWeaponTargetRules(COMBAT_STATIC_RULES.unitDefinitions.TheOnion, weapon.id, weapon.targetRules),
        },
        {
          unitType: target.type,
          targetRules: resolveUnitTargetRules(defenderDefinition, target.targetRules),
        },
      ),
    )

    if (!targetAllowed) {
      const invalidWeapon = weapons.find((weapon) =>
        !isTargetAllowedByRules(
          {
            unitType: 'TheOnion',
            weaponId: weapon.id,
            targetRules: resolveWeaponTargetRules(COMBAT_STATIC_RULES.unitDefinitions.TheOnion, weapon.id, weapon.targetRules),
          },
          {
            unitType: target.type,
            targetRules: resolveUnitTargetRules(defenderDefinition, target.targetRules),
          },
        ),
      )

      return {
        ok: false,
        code: 'INVALID_TARGET',
        error: invalidWeapon
          ? `Weapon '${invalidWeapon.id}' cannot target '${target.id}'`
          : `Target '${target.id}' is not valid for the selected weapon(s)`,
      }
    }

    const combatResult = combatCalculator.calculateResult(
      buildCombatCalculatorInput(map, state, { kind: 'defender', id: target.id }, [...command.attackers]),
    )

    return {
      ok: true,
      plan: {
        actionType: 'FIRE',
        actor: 'onion',
        attackerIds: [...command.attackers],

        target: { kind: 'defender', id: target.id },
        attackStrength: combatResult.attackStrength,
        defense: combatResult.defenseStrength,
        weaponIds,
      },
    }
  }

  const target = resolveOnionTarget(state, command.targetId)
  if (!target) {
    return { ok: false, code: 'INVALID_TARGET', error: `Target '${command.targetId}' is not valid for the selected weapon(s)` }
  }

  if (target.kind === 'treads' && command.attackers.length > 1) {
    return { ok: false, code: 'MULTI_ATTACK_TREAD_TARGET', error: 'Multiple attackers cannot target Onion treads in one attack' }
  }

  const seen = new Set<string>()
  let attackStrength = 0

  for (const attackerId of command.attackers) {
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

  const combatResult = combatCalculator.calculateResult(
    buildCombatCalculatorInput(map, state, target, [...command.attackers]),
  )

  return {
    ok: true,
    plan: {
      actionType: 'FIRE',
      actor: 'defender',
      attackerIds: [...command.attackers],
      target,
      attackStrength: combatResult.attackStrength,
      defense:
        target.kind === 'weapon'
          ? getWeaponDefense(state.onion, target.id)
          : target.kind === 'treads'
            ? combatResult.attackStrength
            : combatResult.defenseStrength,
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
  const odds = sharedCalculateOdds(attackStrength, defenseValue)
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
  return sharedCalculateOdds(attackStrength, defenseValue)
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
