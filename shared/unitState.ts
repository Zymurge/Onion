import type { GameState, GameUnit, OnionUnit, Weapon } from './types/index.js'
import { getUnitDefinition, getWeaponType } from './unitDefinitions.js'

export function getOnion(state: GameState): OnionUnit {
  const onion = state.onions['onion-1']
  if (!onion) {
    throw new Error('Game state does not contain onion-1')
  }
  return onion
}

export function canSecondMove(unit: GameUnit): boolean {
  return getUnitDefinition(unit.typeId)?.abilities.secondMove === true
}

export function isImmobile(unit: GameUnit): boolean {
  return getUnitDefinition(unit.typeId)?.abilities.immobile === true
}

export function getUnitDefense(unit: GameUnit, inCover: boolean): number {
  const definition = getUnitDefinition(unit.typeId)
  if (!definition) {
    throw new Error(`Unknown unit type: ${unit.typeId}`)
  }

  if (unit.role === 'defender' && unit.typeId === 'LittlePigs') {
    const squads = unit.squads ?? 1
    return squads * definition.defense + (inCover ? 1 : 0)
  }

  return definition.defense
}

export function isWeaponAvailable(weapon: Weapon): boolean {
  return weapon.state === 'ready'
}

export function getAvailableWeapons(unit: GameUnit): Weapon[] {
  return unit.weapons.filter(isWeaponAvailable)
}

export function isDestroyed(unit: GameUnit): boolean {
  return unit.state === 'destroyed'
}

export function canTargetWeapon(unit: GameUnit, weaponId: string): boolean {
  const weapon = unit.weapons.find((candidate) => candidate.id === weaponId)
  return weapon !== undefined && getWeaponType(weapon.typeId).individuallyTargetable
}

export function destroyWeapon(unit: GameUnit, weaponId: string): boolean {
  const weapon = unit.weapons.find((candidate) => candidate.id === weaponId)
  if (!weapon) {
    return false
  }
  weapon.state = 'destroyed'
  return true
}
