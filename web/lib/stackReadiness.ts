import type { Weapon } from '../../shared/types/index.js'
import type { Mode } from './battlefieldView.js'
import { getBattlefieldWeaponAttack, isBattlefieldWeaponReady } from './weaponStats.js'
import type { SessionCatalog } from './sessionCatalog.js'

type ReadinessUnit = {
  state?: string
  actionableModes?: ReadonlyArray<Mode>
  weapons?: ReadonlyArray<Weapon>
}

/** Reports combat readiness from defender actions or Onion weapon state. */
export function isUnitCombatReady(unit: ReadinessUnit): boolean {
  if (unit.actionableModes !== undefined) {
    return unit.state === 'operational' && unit.actionableModes.includes('fire')
  }

  return (unit.weapons ?? []).some(isBattlefieldWeaponReady)
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
  return units.length > 0 && units.every((unit) => unit.state === 'destroyed' || unit.state === 'disabled')
}

/** Returns ready weapon strength, falling back to the displayed attack value. */
export function getUnitAttackStrength(unit: ReadinessUnit, catalog?: SessionCatalog): number {
  if (unit.weapons !== undefined && unit.weapons.length > 0) {
    return unit.weapons
      .filter(isBattlefieldWeaponReady)
      .reduce((total, weapon) => total + getBattlefieldWeaponAttack(weapon, catalog), 0)
  }

  return 0
}