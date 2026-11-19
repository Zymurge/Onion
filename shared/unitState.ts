import type { GameState, GameUnit, Weapon } from './types/index.js'
import { getRulesContext, type RulesContext } from './rulesContext.js'
import { UnitWeapons } from './unitWeapons.js'

export type UnitKind = 'onion' | 'defender' | 'none'

export type UnitLookup = {
  unitId: string | undefined
  kind: UnitKind
}

export function getOnion(unitId: string, state: GameState): string | undefined {
  return state.onions[unitId]?.unitId
}

export function getDefender(unitId: string, state: GameState): string | undefined {
  return state.defenders[unitId]?.unitId
}

export function getOnionOrDefender(unitId: string, state: GameState): UnitLookup {
  const onion = getOnion(unitId, state)
  if (onion !== undefined) {
    return { unitId: onion, kind: 'onion' }
  }

  const defender = getDefender(unitId, state)
  if (defender !== undefined) {
    return { unitId: defender, kind: 'defender' }
  }

  return { unitId: undefined, kind: 'none' }
}

/** Returns whether a unit's class permits a second move. */
export function canSecondMove(unit: GameUnit, rules?: RulesContext): boolean {
  const context = getRulesContext(rules)
  const definition = context.getUnitDefinition(unit.typeId)
  return definition !== undefined && context.getUnitClassRule(definition.unitClass).secondMove.allowed
}

/** Returns whether a unit's class is immobile. */
export function isImmobile(unit: GameUnit, rules?: RulesContext): boolean {
  const context = getRulesContext(rules)
  const definition = context.getUnitDefinition(unit.typeId)
  return definition !== undefined && context.getUnitClassRule(definition.unitClass).mobility === 'immobile'
}

export function getUnitDefense(unit: GameUnit, inCover: boolean, rules?: RulesContext): number {
  const definition = getRulesContext(rules).getUnitDefinition(unit.typeId)
  if (!definition) {
    throw new Error(`Unknown unit type: ${unit.typeId}`)
  }

  return definition.defense + (unit.role === 'defender' && inCover ? 1 : 0)
}

export function isWeaponAvailable(weapon: Weapon): boolean {
  return new UnitWeapons([weapon]).getReadyWeapons().length === 1
}

export function getAvailableWeapons(unit: GameUnit): Weapon[] {
  return new UnitWeapons([...unit.weapons]).getReadyWeapons()
}

export function isDestroyed(unit: GameUnit): boolean {
  return unit.state === 'destroyed'
}

export function canTargetWeapon(unit: GameUnit, weaponId: string, rules?: RulesContext): boolean {
  const weapon = unit.weapons.find((candidate) => candidate.id === weaponId)
  return weapon !== undefined && getRulesContext(rules).getWeaponType(weapon.typeId).individuallyTargetable
}

export function destroyWeapon(unit: GameUnit, weaponId: string): boolean {
  return new UnitWeapons(unit.weapons as Weapon[]).destroy(weaponId)
}
