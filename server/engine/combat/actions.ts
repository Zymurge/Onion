import logger from '#server/logger'
import type { Command, DefenderUnit, GameState, OnionUnit } from '#shared/types/index'
import type { GameMap } from '#server/engine/map'
import { hexDistance } from '#shared/axialHex'
import {
  createCombatCalculator,
  type CombatExchangeInput,
} from '#shared/combatCalculator'
import { ONION_STATIC_RULES } from '#shared/staticRules'
import { isTargetAllowedByRules } from '#shared/targetRules'
import { formatCombatTargetId, parseCombatTargetId } from '#shared/combatTarget'
import { getUnitDefinition, getWeaponType } from '#shared/unitDefinitions'
import { destroyWeapon, getAvailableWeapons, getOnion } from '#shared/unitState'
import { UnitWeapons } from '#shared/unitWeapons'
import { applyDamage } from './outcomes.js'
import { rollCombat } from './rolls.js'
import type {
  CombatExecutionResult,
  CombatPlan,
  CombatTarget,
  CombatValidation,
} from './types.js'

type FireCommand = Extract<Command, { type: 'FIRE' }>

const combatCalculator = createCombatCalculator(ONION_STATIC_RULES)

function getTerrainTypeAt(map: GameMap, position: { q: number; r: number }) {
  return map.hexes[`${position.q},${position.r}`]?.terrain
}

/**
 * Resolve an Onion reference through the canonical Onion map.
 *
 * Commands may carry an alias that `getOnion` understands, while the rest of
 * combat needs the concrete runtime entity. Throwing here keeps downstream
 * combat code from operating on a partially resolved target.
 */
function requireOnion(state: GameState, onionId: string): OnionUnit {
  const resolvedOnionId = getOnion(onionId, state)
  if (resolvedOnionId === undefined) {
    throw new Error(`Onion '${onionId}' was not found in game state`)
  }

  const onion = state.onions[resolvedOnionId]
  if (onion === undefined) {
    throw new Error(`Onion '${resolvedOnionId}' was not found in game state`)
  }

  return onion
}

/**
 * Build the calculator's phase-neutral combat snapshot from live game state.
 *
 * The shared calculator does not know about Onion/defender maps, stack roster
 * storage, or the command model. This adapter translates those structures
 * into explicit combat contributions and target branches.
 */
function buildCombatCalculatorInput(
  map: GameMap,
  state: GameState,
  target: CombatTarget,
  attackerIds: string[],
  onionId: string,
): CombatExchangeInput {
  const onion = requireOnion(state, onionId)

  if (state.currentPhase === 'ONION_COMBAT') {
    const attackers = attackerIds.map((attackerId) => {
      const weapon = onion.weapons.find((candidate) => candidate.id === attackerId)
      if (weapon === undefined) {
        throw new Error(`Weapon '${attackerId}' was not found on Onion '${onion.unitId}'`)
      }

      return {
        id: attackerId,
        typeId: onion.typeId,
        weaponTypeIds: [weapon.typeId],
      }
    })

    const defender: DefenderUnit | undefined = state.defenders[target.id]
    if (defender) {
      return {
        attackers,
        target: {
          kind: 'unit',
          id: defender.unitId,
          typeId: defender.typeId,
          terrainType: getTerrainTypeAt(map, defender.position),
        },
      }
    }

    const group = state.stackRoster?.groupsById?.[target.id]
    if (group === undefined) {
      throw new Error(`Defender target '${target.id}' was not found while building combat input`)
    }
    const liveMembers = getLiveStackMembers(state, group.unitIds)

    return {
      attackers,
      target: {
        kind: 'stack',
        id: target.id,
        typeId: group.unitType,
        size: liveMembers.length,
        terrainType: getTerrainTypeAt(map, group.position),
      },
    }
  }

  const attackers = attackerIds.map((attackerId) => {
    const attacker = state.defenders[attackerId]
    if (attacker === undefined) {
      throw new Error(`Defender attacker '${attackerId}' was not found while building combat input`)
    }

    return {
      id: attackerId,
      typeId: attacker.typeId,
      weaponTypeIds: getAvailableWeapons(attacker).map((weapon) => weapon.typeId),
    }
  })

  if (target.kind === 'treads') {
    return {
      attackers,
      target: { kind: 'onion-treads', id: target.id, typeId: onion.typeId },
    }
  }

  const targetWeapon = onion.weapons.find((weapon) => weapon.id === target.id)
  if (targetWeapon === undefined) {
    throw new Error(`Unknown weapon target: ${target.id}`)
  }

  return {
    attackers,
    target: {
      kind: 'onion-weapon',
      id: target.id,
      typeId: onion.typeId,
      weaponTypeId: targetWeapon.typeId,
    },
  }
}

/**
 * Convert a command target into the normalized Onion target forms understood
 * by combat planning. Tread ids must belong to the selected Onion; weapon
 * targets must refer to an individually targetable live weapon.
 */
function resolveOnionTarget(state: GameState, onionId: string, targetId: string): CombatTarget | null {
  const onion = requireOnion(state, onionId)
  const parsedTarget = parseCombatTargetId(targetId)
  if (parsedTarget?.kind === 'treads' && parsedTarget.onionId === onion.unitId) {
    return { kind: 'treads', id: formatCombatTargetId(parsedTarget) }
  }

  const weapon = onion.weapons.find((candidate) => candidate.id === targetId && getWeaponType(candidate.typeId).individuallyTargetable)
  if (weapon) {
    return { kind: 'weapon', id: weapon.id }
  }

  return null
}

function formatResolvedTargetId(target: CombatTarget): string {
  return target.id
}

function getLiveStackMembers(state: GameState, unitIds: readonly string[]): DefenderUnit[] {
  return unitIds
    .map((unitId) => state.defenders[unitId])
    .filter((member): member is DefenderUnit => member !== undefined && member.state !== 'destroyed')
}

/**
 * Resolve either a direct defender id or a stack group id to a live defender.
 * For stacks, the first non-destroyed member is the representative used when
 * applying the result; the calculator receives the group separately through
 * `buildCombatCalculatorInput`.
 */
function resolveDefenderTarget(state: GameState, targetId: string): DefenderUnit | null {
  const explicitTarget = state.defenders[targetId]
  if (explicitTarget !== undefined) {
    return explicitTarget
  }

  const group = state.stackRoster?.groupsById?.[targetId]
  if (group === undefined) {
    return null
  }

  for (const memberId of group.unitIds) {
    const member = state.defenders[memberId]
    if (member !== undefined && member.state !== 'destroyed') {
      return member
    }
  }

  return null
}

/**
 * Validate a FIRE command and produce the immutable combat plan consumed by
 * `executeCombatAction`.
 *
 * Validation checks command legality, adapts live state into the shared
 * calculator contract, and records the effective strengths used at execution.
 */
export function validateCombatAction(
  map: GameMap,
  state: GameState,
  command: FireCommand,
): CombatValidation {
  logger.info({ commandType: command.type }, 'Validating combat action')
  logger.debug({ map, state, command }, 'validateCombatAction input')

  if (command.attackers.length === 0) {
    return { ok: false, code: 'NO_ATTACKERS', error: 'No attackers specified for fire action' }
  }

  if (state.currentPhase !== 'ONION_COMBAT' && state.currentPhase !== 'DEFENDER_COMBAT') {
    return { ok: false, code: 'WRONG_PHASE', error: 'Not a combat phase' }
  }

  const onionUnitId = getOnion(command.onionId, state)
  if (onionUnitId === undefined) {
    return { ok: false, code: 'ONION_NOT_FOUND', error: `Onion '${command.onionId}' was not found in game state` }
  }
  const onion = state.onions[onionUnitId]

  if (state.currentPhase === 'ONION_COMBAT') {
    const explicitTarget = state.defenders[command.targetId]
    const targetBelongsToStack = Object.values(state.stackRoster?.groupsById ?? {}).some((group) => group.unitIds.includes(command.targetId))

    if (explicitTarget && targetBelongsToStack) {
      return { ok: false, code: 'INVALID_TARGET', error: 'Individual stack members cannot be targeted; target the stack group instead' }
    }

    let target: DefenderUnit | undefined = explicitTarget
    if (!target) {
      const group = state.stackRoster?.groupsById?.[command.targetId]
      if (!group) {
        return { ok: false, code: 'NO_TARGET', error: 'Target not found' }
      }

      const liveMembers = getLiveStackMembers(state, group.unitIds)
      const representative = liveMembers[0]
      if (representative === undefined) {
        return { ok: false, code: 'NO_TARGET', error: 'Target is already destroyed' }
      }

      target = {
        unitId: command.targetId,
        typeId: group.unitType,
        role: 'defender',
        side: 'defender',
        position: group.position,
        state: representative.state,
        weapons: representative.weapons,
        friendlyName: representative.friendlyName,
      }
    }

    if (target === undefined) {
      return { ok: false, code: 'NO_TARGET', error: 'Target not found' }
    }

    if (target.state === 'destroyed') {
      return { ok: false, code: 'NO_TARGET', error: 'Target is already destroyed' }
    }

    const seen = new Set<string>()
    const weaponIds: string[] = []
    const weapons: Array<OnionUnit['weapons'][number]> = []
    for (const attackerId of command.attackers) {
      if (seen.has(attackerId)) {
        return { ok: false, code: 'DUPLICATE_ATTACKER', error: `Duplicate attacker '${attackerId}'` }
      }
      seen.add(attackerId)

      const weapon = onion.weapons.find((candidate) => candidate.id === attackerId)
      if (!weapon) {
        return { ok: false, code: 'WEAPON_NOT_FOUND', error: `Attacker '${attackerId}' not found` }
      }
      if (weapon.state !== 'ready' || (weapon.ammo !== undefined && weapon.ammo <= 0)) {
        return { ok: false, code: 'WEAPON_EXHAUSTED', error: `Attacker '${attackerId}' is already destroyed or exhausted` }
      }

      weaponIds.push(weapon.id)
      weapons.push(weapon)
    }

    const missileCount = weapons.filter((weapon) => getWeaponType(weapon.typeId).weaponClass === 'missile').length
    if (missileCount > 1) {
      return { ok: false, code: 'WEAPON_EXHAUSTED', error: 'Only one missile may be launched per turn' }
    }

    for (let index = 0; index < weapons.length; index += 1) {
      const weapon = weapons[index]
      const attackerId = command.attackers[index]
      if (hexDistance(onion.position, target.position) > getWeaponType(weapon.typeId).range) {
        return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
      }
    }

    const defenderDefinition = getUnitDefinition(target.typeId)
    const targetAllowed = weapons.every((weapon) =>
      isTargetAllowedByRules(
        {
          unitType: onion.typeId,
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
            unitType: onion.typeId,
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

    const combatResult = combatCalculator.calculate(
      buildCombatCalculatorInput(map, state, { kind: 'defender', id: target.unitId }, [...command.attackers], onion.unitId),
    )

    return {
      ok: true,
      plan: {
        actionType: 'FIRE',
        actor: 'onion',
        attackerIds: [...command.attackers],
        onionId: onion.unitId,
        target: { kind: 'defender', id: target.unitId },
        attackStrength: combatResult.attackStrength,
        defense: combatResult.defenseStrength,
        weaponIds,
      },
    }
  }

  const target = resolveOnionTarget(state, command.onionId, command.targetId)
  if (!target) {
    return { ok: false, code: 'INVALID_TARGET', error: `Target '${command.targetId}' is not valid for the selected weapon(s)` }
  }

  if (target.kind === 'treads' && command.attackers.length > 1) {
    return { ok: false, code: 'MULTI_ATTACK_TREAD_TARGET', error: 'Multiple attackers cannot target Onion treads in one attack' }
  }

  const seen = new Set<string>()
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
    if (hexDistance(unit.position, onion.position) > maxRange) {
      return { ok: false, code: 'TARGET_OUT_OF_RANGE', error: `Attacker '${attackerId}' is out of range` }
    }
  }

  const combatResult = combatCalculator.calculate(
    buildCombatCalculatorInput(map, state, target, [...command.attackers], onion.unitId),
  )

  const targetWeapon = target.kind === 'weapon'
    ? onion.weapons.find((weapon) => weapon.id === target.id)
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
      onionId: onion.unitId,
      target,
      attackStrength: combatResult.attackStrength,
      defense: combatResult.defenseStrength,
    },
  }
}

/** Execute a previously validated combat plan against live game state. */
export function executeCombatAction(
  state: GameState,
  plan: CombatPlan,
  roll?: number,
): CombatExecutionResult {
  logger.info({ plan }, 'Executing combat action')
  logger.debug({ plan }, 'executeCombatAction input')
  const onion = requireOnion(state, plan.onionId)
  const defense = plan.target.kind === 'treads' ? plan.attackStrength : plan.defense
  const combatRoll = rollCombat(plan.attackStrength, defense, roll)

  if (plan.actor === 'onion') {
    if (plan.target.kind !== 'defender') {
      return {
        success: false,
        actionType: plan.actionType,
        attackerIds: plan.attackerIds,
        onionId: plan.onionId,
        targetId: formatResolvedTargetId(plan.target),
        error: 'Invalid target for Onion fire',
      }
    }

    const stack = state.stackRoster?.groupsById?.[plan.target.id]
    const defenders = stack === undefined
      ? [resolveDefenderTarget(state, plan.target.id)].filter((unit): unit is DefenderUnit => unit !== null)
      : stack.unitIds
        .map((unitId) => state.defenders[unitId])
        .filter((unit): unit is DefenderUnit => unit !== undefined && unit.state !== 'destroyed')
    if (defenders.length === 0) {
      return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, onionId: plan.onionId, targetId: formatResolvedTargetId(plan.target), error: 'Target not found' }
    }

    if (defenders.every((defender) => defender.state === 'destroyed')) {
      return {
        success: false,
        actionType: plan.actionType,
        attackerIds: plan.attackerIds,
        onionId: plan.onionId,
        targetId: formatResolvedTargetId(plan.target),
        error: 'Target is already destroyed',
      }
    }

    const firingWeaponIds = plan.weaponIds ?? (plan.weaponId ? [plan.weaponId] : [])
    const firingWeapons: Array<OnionUnit['weapons'][number]> = []
    const onionWeapons = new UnitWeapons(onion.weapons as OnionUnit['weapons'][number][])
    for (const weaponId of firingWeaponIds) {
      const weapon = onionWeapons.findById(weaponId)
      if (!weapon) {
        return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, onionId: plan.onionId, targetId: formatResolvedTargetId(plan.target), error: `Weapon '${weaponId}' not found` }
      }
      if (weapon.state !== 'ready') {
        return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, onionId: plan.onionId, targetId: formatResolvedTargetId(plan.target), error: `Weapon '${weaponId}' is not ready` }
      }
      firingWeapons.push(weapon)
    }

    const affectedDefenders = stack !== undefined && combatRoll.result !== 'X' ? defenders.slice(0, 1) : defenders
    const statusChanges: Array<{ unitId: string; from: string; to: string }> = []
    for (const defender of affectedDefenders) {
      const previousStatus = defender.state
      applyDamage(defender, combatRoll.result, plan.attackStrength)
      if (defender.state !== previousStatus) {
        statusChanges.push({ unitId: defender.unitId, from: previousStatus, to: defender.state })
      }
    }

    for (const firedWeapon of firingWeapons) {
      if (getWeaponType(firedWeapon.typeId).weaponClass === 'missile') {
        if (!onionWeapons.consumeAmmo(firedWeapon.id)) {
          return { success: false, actionType: plan.actionType, attackerIds: plan.attackerIds, onionId: plan.onionId, targetId: formatResolvedTargetId(plan.target), error: `Weapon '${firedWeapon.id}' has no ammunition` }
        }
        for (const missile of onion.weapons) {
          if (missile.id !== firedWeapon.id && getWeaponType(missile.typeId).weaponClass === 'missile' && missile.state === 'ready') {
            onionWeapons.spend(missile.id)
          }
        }
      } else {
        onionWeapons.spend(firedWeapon.id)
      }
    }

    return {
      success: true,
      actionType: plan.actionType,
      attackerIds: plan.attackerIds,
      onionId: plan.onionId,
      targetId: plan.target.id,
      roll: combatRoll,
      statusChanges: statusChanges.length > 0 ? statusChanges : undefined,
    }
  }

  const damage = applyDamage(
    onion,
    combatRoll.result,
    plan.attackStrength,
    plan.target.kind === 'weapon' ? plan.target.id : undefined,
  )
  if (damage.weaponDestroyed) {
    destroyWeapon(onion, damage.weaponDestroyed)
  }

  for (const attackerId of plan.attackerIds) {
    const attacker = state.defenders[attackerId]
    if (attacker && attacker.weapons) {
      new UnitWeapons(attacker.weapons as DefenderUnit['weapons'][number][]).spendAll()
    }
  }

  return {
    success: true,
    actionType: plan.actionType,
    attackerIds: plan.attackerIds,
    onionId: plan.onionId,
    targetId: formatResolvedTargetId(plan.target),
    roll: combatRoll,
    treadsLost: damage.treads,
    destroyedWeaponId: damage.weaponDestroyed,
  }
}