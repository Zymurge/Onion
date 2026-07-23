import logger from '#server/logger'
/**
 * Combat resolution system for the Onion game engine.
 *
 * Implements the Combat Results Table (CRT), damage application,
 * special combat rules, and victory condition checking.
 */

import type { Command, DefenderUnit, GameState, GameUnit, OnionUnit } from '#shared/types/index'
import type { GameMap } from '#server/engine/map'
import { hexDistance } from '#shared/hex'
import {
  createCombatCalculator,
  calculateOdds as sharedCalculateOdds,
  type CombatCalculatorInput,
} from '#shared/combatCalculator'
import { ONION_STATIC_RULES } from '#shared/staticRules'
import { isTargetAllowedByRules } from '#shared/targetRules'
import { getUnitDefinition, getWeaponType } from '#shared/unitDefinitions'
import { buildStackRosterIndex } from '#shared/stackRoster'
import { getWeaponDefense } from '#shared/unitDefinitions'
import { destroyWeapon, getAvailableWeapons, getOnion } from '#shared/unitState'

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

export type CombatOutcomeEffect =
  | 'no-effect'
  | 'disabled'
  | 'destroyed'
  | 'tread-loss'
  | 'weapon-destroyed'

export interface CombatOutcomeResolution {
  targetId: string
  effect: CombatOutcomeEffect
  result: CombatResult
  treadsLost?: number
  weaponId?: string
  weaponDestroyed?: string
}

type FireCommand = Extract<Command, { type: 'FIRE' }>

const COMBAT_STATIC_RULES = ONION_STATIC_RULES

const combatCalculator = createCombatCalculator(COMBAT_STATIC_RULES)

function getTerrainTypeAt(map: GameMap, position: { q: number; r: number }) {
  return map.hexes[`${position.q},${position.r}`]?.terrain
}

function buildCombatCalculatorInput(
  map: GameMap,
  state: GameState,
  target: CombatTarget,
  attackerIds: string[],
): CombatCalculatorInput {
  const units: CombatCalculatorInput['combatState']['units'] = {}
  const onion = getOnion(state)

  if (state.currentPhase === 'ONION_COMBAT') {
    for (const attackerId of attackerIds) {
      units[attackerId] = {
        typeId: onion.typeId,
        weapons: onion.weapons,
        weaponIds: [attackerId],
      }
    }

    // Defender target may be a stack group id or an individual unit id. If
    // it's a group id, synthesize a combatant with squads derived from the
    // stack roster. Otherwise use the explicit defender entry.
    const defender: DefenderUnit | undefined = state.defenders[target.id]
    if (defender) {
      units[target.id] = {
        typeId: defender.typeId,
        squads: defender.squads,
        terrainType: getTerrainTypeAt(map, defender.position),
        weapons: defender.weapons,
      }
    } else {
      const group = state.stackRoster?.groupsById?.[target.id]
      if (group) {
        const unitIds = group.unitIds
        units[target.id] = {
          typeId: group.unitType,
          squads: unitIds.length,
          terrainType: getTerrainTypeAt(map, group.position),
          weapons: undefined,
        }
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
      units[attackerId] = { typeId: attacker.typeId, weapons: attacker.weapons }
    }
  }

  units[onion.unitId] = {
    typeId: onion.typeId,
    weaponId: target.kind === 'weapon' ? target.id : undefined,
    terrainType: getTerrainTypeAt(map, onion.position),
    weapons: onion.weapons,
  }

  return {
    attackerGroupIds: [...attackerIds],
    targetId: onion.unitId,
    combatState: { units },
  }
}

function resolveOnionTarget(state: GameState, targetId: string): CombatTarget | null {
  const onion = getOnion(state)
  const normalizedTargetId = targetId.trim().toLowerCase()
  if (
    normalizedTargetId === onion.unitId.toLowerCase() ||
    normalizedTargetId === 'onion' ||
    normalizedTargetId === 'tread' ||
    normalizedTargetId === 'treads'
  ) {
    return { kind: 'treads', id: onion.unitId }
  }

  const weapon = onion.weapons.find((candidate) => candidate.id === targetId && getWeaponType(candidate.typeId).individuallyTargetable)
  if (weapon) {
    return { kind: 'weapon', id: weapon.id }
  }

  return null
}

export function resolveCombatOutcome(
  target: GameUnit,
  result: CombatResult,
  attackStrength: number,
  weaponId?: string,
): CombatOutcomeResolution {
  const targetId = target.unitId
  if (target.role === 'onion') {
    if (result !== 'X') {
      return { targetId, effect: 'no-effect', result }
    }

    if (weaponId !== undefined) {
      return { targetId, effect: 'weapon-destroyed', result, weaponId, weaponDestroyed: weaponId }
    }

    return { targetId, effect: 'tread-loss', result, treadsLost: attackStrength }
  }

  if (target.typeId === 'LittlePigs') {
    if (result === 'NE') {
      return { targetId, effect: 'no-effect', result }
    }

    return { targetId, effect: 'destroyed', result }
  }

  if (result === 'NE') {
    return { targetId, effect: 'no-effect', result }
  }

  if (result === 'D') {
    return { targetId, effect: 'disabled', result }
  }

  return { targetId, effect: 'destroyed', result }
}

export function validateCombatAction(
  map: GameMap,
  state: GameState,
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
    const explicitTarget = state.defenders[command.targetId]
    const rosterIndex = state.stackRoster === undefined ? null : buildStackRosterIndex(state.stackRoster, state.defenders)

    // If the command targets an individual unit that is part of a stack group,
    // reject the action: stacks must be targeted as a whole (group id).
    if (explicitTarget && rosterIndex && rosterIndex.getUnitGroup(command.targetId) !== null) {
      return { ok: false, code: 'INVALID_TARGET', error: `Individual stack members cannot be targeted; target the stack group instead` }
    }

    // Resolve either an individual defender or a stack group target.
    let target: DefenderUnit | undefined = explicitTarget
    if (!target) {
      const group = state.stackRoster?.groupsById?.[command.targetId]
      if (!group) {
        return { ok: false, code: 'NO_TARGET', error: 'Target not found' }
      }

      // Build a synthetic target representation for the stack group using
      // defender member data when available.
      const memberIds = group.unitIds
      const members = memberIds
        .map((id) => state.defenders[id])
        .filter((member): member is DefenderUnit => member !== undefined)
      const allDestroyed = members.length > 0 && members.every((member) => member.state === 'destroyed')
      const squads = memberIds.length
      const representative = members[0]

      target = {
        unitId: command.targetId,
        typeId: group.unitType,
        role: 'defender',
        position: group.position,
        state: allDestroyed ? 'destroyed' : (representative?.state ?? 'operational'),
        squads,
        weapons: representative?.weapons ?? [],
        friendlyName: representative?.friendlyName,
      }
    }

    if (target.state === 'destroyed') {
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

      const onion = getOnion(state)
      const weapon = onion.weapons.find((candidate) => candidate.id === attackerId)
      if (!weapon) {
        return { ok: false, code: 'WEAPON_NOT_FOUND', error: `Attacker '${attackerId}' not found` }
      }
      if (weapon.state !== 'ready') {
        return { ok: false, code: 'WEAPON_EXHAUSTED', error: `Attacker '${attackerId}' is already destroyed or exhausted` }
      }

      weaponIds.push(weapon.id)
      weapons.push(weapon)
      attackStrength += getWeaponType(weapon.typeId).attack
    }

    for (let index = 0; index < weapons.length; index += 1) {
      const weapon = weapons[index]
      const attackerId = command.attackers[index]
      if (hexDistance(getOnion(state).position, target.position) > getWeaponType(weapon.typeId).range) {
        return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
      }
    }

    const defenderDefinition = getUnitDefinition(target.typeId)
    const targetAllowed = weapons.every((weapon) =>
      isTargetAllowedByRules(
        {
          unitType: getOnion(state).typeId,
          weaponId: weapon.id,
          targetRules: getWeaponType(weapon.typeId).targetRules,
        },
        {
          unitType: target.typeId,
          targetRules: defenderDefinition?.targetRules,
        },
      ),
    )

    if (!targetAllowed) {
      const invalidWeapon = weapons.find((weapon) =>
        !isTargetAllowedByRules(
          {
            unitType: getOnion(state).typeId,
            weaponId: weapon.id,
            targetRules: getWeaponType(weapon.typeId).targetRules,
          },
          {
            unitType: target.typeId,
            targetRules: defenderDefinition?.targetRules,
          },
        ),
      )

      return {
        ok: false,
        code: 'INVALID_TARGET',
        error: invalidWeapon
          ? `Weapon '${invalidWeapon.id}' cannot target '${target.unitId}'`
          : `Target '${target.unitId}' is not valid for the selected weapon(s)`,
      }
    }

    const combatResult = combatCalculator.calculateResult(
      buildCombatCalculatorInput(map, state, { kind: 'defender', id: target.unitId }, [...command.attackers]),
    )

    return {
      ok: true,
      plan: {
        actionType: 'FIRE',
        actor: 'onion',
        attackerIds: [...command.attackers],

        target: { kind: 'defender', id: target.unitId },
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
    const rosterIndex = state.stackRoster === undefined ? null : buildStackRosterIndex(state.stackRoster, state.defenders)
    const firstAttackerGroupId = rosterIndex?.getUnitGroup(command.attackers[0])?.groupId ?? null
    const sameStackAttack =
      firstAttackerGroupId !== null &&
      command.attackers.every((attackerId) => rosterIndex?.getUnitGroup(attackerId)?.groupId === firstAttackerGroupId)

    if (!sameStackAttack) {
      return { ok: false, code: 'MULTI_ATTACK_TREAD_TARGET', error: 'Multiple attackers cannot target Onion treads in one attack' }
    }
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
    if (unit.state !== 'operational') {
      return { ok: false, code: 'ATTACKER_NOT_OPERATIONAL', error: `Attacker '${attackerId}' is not operational` }
    }
    const availableWeapons = getAvailableWeapons(unit)
    if (availableWeapons.length === 0) {
      return { ok: false, code: 'NO_READY_WEAPONS', error: `Attacker '${attackerId}' has no ready weapons` }
    }

    const maxRange = Math.max(...availableWeapons.map((weapon) => getWeaponType(weapon.typeId).range), 0)
    if (hexDistance(unit.position, getOnion(state).position) > maxRange) {
      return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
    }

    attackStrength += availableWeapons.reduce((total, weapon) => total + getWeaponType(weapon.typeId).attack, 0)
  }

  const combatResult = combatCalculator.calculateResult(
    buildCombatCalculatorInput(map, state, target, [...command.attackers]),
  )

  const targetWeapon = target.kind === 'weapon'
    ? getOnion(state).weapons.find((weapon) => weapon.id === target.id)
    : undefined
  if (target.kind === 'weapon' && !targetWeapon) {
    throw new Error(`Unknown weapon target: ${target.id}`)
  }

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
          ? getWeaponDefense(targetWeapon!.typeId)
          : target.kind === 'treads'
            ? combatResult.attackStrength
            : combatResult.defenseStrength,
    },
  }
}

export function executeCombatAction(
  state: GameState,
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

    if (defender.state === 'destroyed') {
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
      const weapon = getOnion(state).weapons.find((candidate) => candidate.id === weaponId)
      if (!weapon) {
        return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, targetId: plan.target.id, error: `Weapon '${weaponId}' not found` }
      }
      if (weapon.state !== 'ready') {
        return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, targetId: plan.target.id, error: `Weapon '${weaponId}' is not ready` }
      }
      firingWeapons.push(weapon)
    }

    const previousStatus = defender.state
    const damage = applyDamage(defender, combatRoll.result, plan.attackStrength)
    for (const firedWeapon of firingWeapons) {
      if (getWeaponType(firedWeapon.typeId).weaponClass === 'missile') {
        destroyWeapon(getOnion(state), firedWeapon.id)
      } else {
        firedWeapon.state = 'spent'
      }
    }

    const statusChanges = defender.state !== previousStatus
      ? [{ unitId: defender.unitId, from: previousStatus, to: defender.state }]
      : undefined

    return {
      success: true,
      actionType: plan.actionType,
      attackerIds: plan.attackerIds,
      targetId: defender.unitId,
      roll: combatRoll,
      statusChanges,
    }
  }

  const targetedWeaponPreviousStatus =
    plan.target.kind === 'weapon'
      ? (() => {
        const targetedWeapon = getOnion(state).weapons.find((weapon) => weapon.id === plan.target.id)
        return targetedWeapon?.state
      })()
      : undefined

  const damage = applyDamage(
    getOnion(state),
    combatRoll.result,
    plan.attackStrength,
    plan.target.kind === 'weapon' ? plan.target.id : undefined
  )
  if (damage.weaponDestroyed) {
    const previousStatus = targetedWeaponPreviousStatus ?? 'ready'
    destroyWeapon(getOnion(state), damage.weaponDestroyed)
  }

  // Mark defender weapons as spent after firing
  for (const attackerId of plan.attackerIds) {
    const attacker = state.defenders[attackerId]
    if (attacker && attacker.weapons) {
      for (const weapon of getAvailableWeapons(attacker)) {
        weapon.state = 'spent'
      }
    }
  }

  return {
    success: true,
    actionType: plan.actionType,
    attackerIds: plan.attackerIds,
    targetId: plan.target.kind === 'treads' ? getOnion(state).unitId : plan.target.id,
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
} {
  const outcome = resolveCombatOutcome(target, result, attackStrength, weaponId)

  switch (outcome.effect) {
    case 'no-effect':
      return {}
    case 'disabled':
      target.state = 'disabled'
      return {}
    case 'destroyed':
      target.state = 'destroyed'
      return { unitDestroyed: true }
    case 'tread-loss': {
      const onion = target as OnionUnit
      const lost = outcome.treadsLost ?? attackStrength
      onion.treads = Math.max(0, onion.treads - lost)
      return { treads: lost }
    }
    case 'weapon-destroyed': {
      const onion = target as OnionUnit
      if (outcome.weaponDestroyed !== undefined) {
        destroyWeapon(onion, outcome.weaponDestroyed)
        return { weaponDestroyed: outcome.weaponDestroyed }
      }
      return {}
    }
  }
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
  state: GameState,
  firingUnit: GameUnit
): string[] {
  const maxRange = Math.max(...getAvailableWeapons(firingUnit).map(w => getWeaponType(w.typeId).range), 0)
  const results: string[] = []

  if (firingUnit.role === 'onion') {
    // Onion targets defenders
    for (const [id, unit] of Object.entries(state.defenders)) {
      if (unit.state === 'destroyed') continue
      if (hexDistance(firingUnit.position, unit.position) <= maxRange) {
        results.push(id)
      }
    }
  } else {
    // Defender targets Onion
    if (hexDistance(firingUnit.position, getOnion(state).position) <= maxRange) {
      results.push(getOnion(state).unitId)
    }
  }
  return results
}
