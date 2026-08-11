import type { Weapon } from '../../shared/types/index.js'
import type { Mode } from './battlefieldView.js'
import { getBattlefieldWeaponAttack, isBattlefieldWeaponReady, parseAttackStats, parseRangeValue } from './weaponStats.js'
import type { SessionCatalog } from './sessionCatalog.js'

type ReadinessUnit = {
  status?: string
  actionableModes?: ReadonlyArray<Mode>
  weaponDetails?: ReadonlyArray<Weapon>
  attack?: string
}

/** Reports combat readiness from defender actions or Onion weapon state. */
export function isUnitCombatReady(unit: ReadinessUnit): boolean {
  if (unit.actionableModes !== undefined) {
    return unit.status === 'operational' && unit.actionableModes.includes('fire')
  }

  return (unit.weaponDetails ?? []).some(isBattlefieldWeaponReady)
}

/** Counts combat-ready members in a stack or unit group. */
export function getGroupCombatReadyCount(units: ReadonlyArray<ReadinessUnit>): number {
  return units.filter(isUnitCombatReady).length
}

/** Counts members with positive attack strength for the defender rail badge. */
export function getGroupAttackReadyCount(
  units: ReadonlyArray<ReadinessUnit>,
  catalog?: SessionCatalog,
): number {
  return units.filter((unit) => getUnitAttackStrength(unit, catalog) > 0).length
}

/** Reports whether every member of a non-empty group is unavailable for combat. */
export function isGroupCombatDisabled(units: ReadonlyArray<ReadinessUnit>): boolean {
  return units.length > 0 && units.every((unit) => unit.status === 'destroyed' || unit.status === 'disabled')
}

/** Returns ready weapon strength, falling back to the displayed attack value. */
export function getUnitAttackStrength(unit: ReadinessUnit, catalog?: SessionCatalog): number {
  if (unit.weaponDetails !== undefined && unit.weaponDetails.length > 0) {
    return unit.weaponDetails
      .filter(isBattlefieldWeaponReady)
      .reduce((total, weapon) => total + getBattlefieldWeaponAttack(weapon, catalog), 0)
  }

  return parseRangeValue(parseAttackStats(unit.attack ?? '0').damage)
}