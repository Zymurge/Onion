import type { GameUnit, OnionUnit } from '#shared/types/index'
import { destroyWeapon } from '#shared/unitState'
import type { CombatOutcomeResolution, CombatResult } from './types.js'

/**
 * Resolve a CRT result into the domain effect applied to a target.
 *
 * This function is deliberately pure. It translates combat rules into an
 * effect description; `applyDamage` owns the corresponding state mutation.
 */
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

/**
 * Apply a resolved CRT result to a live unit.
 *
 * The result shape remains intentionally small because callers translate it
 * into events or action responses at their own boundary.
 */
export function applyDamage(
  target: GameUnit,
  result: CombatResult,
  attackStrength: number,
  weaponId?: string,
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
      onion.treads = Math.max(0, (onion.treads ?? 0) - lost)
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