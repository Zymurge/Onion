import type { TurnPhase, UnitState, Weapon } from '../../shared/types/index.js'
import type { Mode } from './battlefieldView.js'
import { getSessionWeaponType, type SessionCatalog } from './sessionCatalog.js'

/** Reports whether a battlefield unit exposes the fire action. */
export function isBattlefieldUnitCombatReady(unit: { actionableModes: ReadonlyArray<Mode> }): boolean {
  return unit.actionableModes.includes('fire')
}

/**
 * Resolves a weapon name from the live catalog when available.
 * Without a catalog, the dynamic type ID is the only available label. A
 * supplied catalog is authoritative, so an unknown type ID is an error.
 */
export function resolveBattlefieldWeaponName(weapon: Weapon, catalog?: SessionCatalog): string {
  return catalog === undefined ? weapon.typeId : getSessionWeaponType(catalog, weapon.typeId).name
}

/** Counts ready direct-fire weapons and missiles. */
export function parseWeaponStats(weapons: ReadonlyArray<Weapon> | string) {
  if (typeof weapons === 'string') {
    return { operationalWeapons: 0, operationalMissiles: 0 }
  }

  let operationalWeapons = 0
  let operationalMissiles = 0

  for (const weapon of weapons) {
    if (weapon.state === 'ready') {
      if (weapon.weaponClass === 'missile') {
        operationalMissiles++
      } else {
        operationalWeapons++
      }
    }
  }

  return { operationalWeapons, operationalMissiles }
}

/** Parses a display attack string into damage and range text. */
export function parseAttackStats(attackString: string) {
  const parts = attackString.split('/')
  const damage = parts[0].trim()
  const range = parts[1]?.includes('rng') ? parts[1].trim().replace('rng', '').trim() : '0'
  return { damage, range }
}

/** Formats the live weapon states for display. */
export function formatWeaponSummary(weapons: ReadonlyArray<Weapon> | undefined) {
  if (weapons === undefined || weapons.length === 0) {
    return 'n/a'
  }

  return weapons.map((weapon) => `${weapon.id}: ${weapon.state}`).join(', ')
}

/** Reports whether a weapon is ready to fire. */
export function isBattlefieldWeaponReady(weapon: Weapon): boolean {
  return weapon.state === 'ready'
}

/**
 * Returns a catalog weapon's attack strength.
 * Zero means that no catalog was available; a supplied catalog must contain
 * the weapon type and throws when it does not.
 */
export function getBattlefieldWeaponAttack(weapon: Weapon, catalog?: SessionCatalog): number {
  return catalog === undefined ? 0 : getSessionWeaponType(catalog, weapon.typeId).attack
}

/**
 * Formats the strongest supplied weapon by attack, then range.
 * Equal attack and range retain the first weapon. This summary does not
 * filter by weapon state. Without a catalog, numeric values are unavailable.
 */
export function formatAttackSummary(weapons: ReadonlyArray<Weapon> | undefined, catalog?: SessionCatalog) {
  if (weapons === undefined || weapons.length === 0) {
    return '0 / rng 0'
  }

  const primaryWeapon = weapons.reduce((strongest, weapon) => {
    const weaponType = catalog === undefined ? undefined : getSessionWeaponType(catalog, weapon.typeId)
    const strongestType = catalog === undefined ? undefined : getSessionWeaponType(catalog, strongest.typeId)
    if (weaponType === undefined || strongestType === undefined) {
      return strongest
    }
    if (weaponType.attack > strongestType.attack) {
      return weapon
    }

    if (weaponType.attack === strongestType.attack && weaponType.range > strongestType.range) {
      return weapon
    }

    return strongest
  })

  const primaryWeaponType = catalog === undefined ? undefined : getSessionWeaponType(catalog, primaryWeapon.typeId)
  if (primaryWeaponType === undefined) {
    return '0 / rng 0'
  }
  return `${primaryWeaponType.attack} / rng ${primaryWeaponType.range}`
}

/**
 * Returns the maximum catalog range among ready weapons only.
 * Spent and destroyed weapons are ignored. Without a catalog, each available
 * range is zero because numeric weapon metadata cannot be inferred safely.
 */
export function getReadyWeaponRange(weapons: ReadonlyArray<Weapon> | undefined, catalog?: SessionCatalog): number {
  if (weapons === undefined || weapons.length === 0) {
    return 0
  }

  return weapons
    .filter((weapon) => weapon.state === 'ready')
    .reduce((maxRange, weapon) => Math.max(maxRange, catalog === undefined ? 0 : getSessionWeaponType(catalog, weapon.typeId).range), 0)
}

/** Parses a range string, returning zero for non-numeric values. */
export function parseRangeValue(rangeText: string): number {
  const parsedRange = Number.parseInt(rangeText, 10)
  return Number.isNaN(parsedRange) ? 0 : parsedRange
}

/**
 * Returns combat actions available for the unit in the current phase.
 * Precedence is: destroyed or disabled status, DEFENDER_COMBAT's defender
 * override, ONION_COMBAT's no-action rule, inactive turn, then ready weapons.
 */
export function getActionableModes(status: UnitState | undefined, weapons: ReadonlyArray<Weapon> | undefined, activeTurnActive: boolean, activePhase: TurnPhase | null): Mode[] {
  if (status === 'destroyed' || status === 'disabled') {
    return []
  }

  const hasReadyWeapon = (weapons ?? []).some((weapon) => weapon.state === 'ready')
  if (activePhase === 'DEFENDER_COMBAT') {
    return hasReadyWeapon ? ['fire', 'combined'] : []
  }

  if (activePhase === 'ONION_COMBAT') {
    return []
  }

  if (!activeTurnActive) {
    return []
  }

  return hasReadyWeapon ? ['fire', 'combined'] : []
}