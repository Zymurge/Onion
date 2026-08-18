import { expect, describe, it } from 'vitest'
import type { DefenderMap, DefenderUnit, OnionMap, OnionUnit, UnitTypeBase, Weapon, WeaponType } from '#shared/types/index'
import { DEFAULT_ONION_UNIT_TYPE_ID } from '#shared/unitDefinitions'

const weapon: Weapon = {
  id: 'main-1',
  typeId: 'main-weapon',
  weaponClass: 'main',
  state: 'ready',
  ammo: 1,
  friendlyName: 'Main Weapon',
}

const onion: OnionUnit = {
  unitId: 'onion-1',
  typeId: DEFAULT_ONION_UNIT_TYPE_ID,
  role: 'onion',
  side: 'onion',
  position: { q: 0, r: 0 },
  state: 'operational',
  weapons: [weapon],
  friendlyName: 'The Onion 1',
  treads: 45,
  ramsRemaining: 2,
}

const defender: DefenderUnit = {
  unitId: 'pig-1',
  typeId: 'HeavyTank',
  role: 'defender',
  side: 'defender',
  position: { q: 1, r: 0 },
  state: 'operational',
  weapons: [],
  friendlyName: 'Heavy Tank 1',
}

describe('canonical dynamic unit types', () => {
  it('represent role-specific runtime state without static catalog fields', () => {
    expect(onion.role).toBe('onion')
    expect(onion.treads).toBe(45)
    expect(defender.role).toBe('defender')
    expect(weapon.typeId).toBe('main-weapon')
    expect(weapon.state).toBe('ready')
  })
})

const staticUnit: UnitTypeBase = {
  typeId: 'TestUnit',
  name: 'Test Unit',
  stackable: false,
  movement: 1,
  defense: 1,
  abilities: { maxStacks: 1 },
  weapons: [],
}

// @ts-expect-error: static unit types must not encode scenario allegiance
const invalidStaticSide: UnitTypeBase = { ...staticUnit, side: 'onion' }

// @ts-expect-error: static unit types must not encode player role
const invalidStaticRole: UnitTypeBase = { ...staticUnit, role: 'onion' }

const onionSidePuss: OnionUnit = {
  ...onion,
  typeId: 'Puss',
  side: 'onion',
  treads: undefined,
  ramsRemaining: undefined,
}

const defenderSideOnion: DefenderUnit = {
  ...defender,
  typeId: DEFAULT_ONION_UNIT_TYPE_ID,
  side: 'defender',
  treads: 45,
  ramsRemaining: 2,
}

const onionSideDefender: DefenderUnit = { ...defender, side: 'onion' }
const defenderSideOnionRole: OnionUnit = { ...onion, side: 'defender' }
const onionMapWithPuss: OnionMap = { 'puss-1': onionSidePuss }
const defenderMapWithOnion: DefenderMap = { 'onion-1': defenderSideOnion }

const { side: _missingSide, ...unitWithoutSide } = onion
void _missingSide

// @ts-expect-error: runtime units must always carry an authoritative side
const invalidMissingSide: OnionUnit = unitWithoutSide

const staticWeapon: WeaponType = {
  typeId: 'TestUnit.main',
  name: 'Main Gun',
  weaponClass: 'main',
  attack: 1,
  range: 1,
  individuallyTargetable: false,
  maxAmmo: 1,
}

const dynamicWeapon: Weapon = { ...weapon, ammo: 0 }

// @ts-expect-error: static weapon types must not carry current ammo
const invalidStaticAmmo: WeaponType = { ...staticWeapon, ammo: 1 }

// @ts-expect-error: dynamic weapon instances must not carry static ammo capacity
const invalidDynamicMaxAmmo: Weapon = { ...dynamicWeapon, maxAmmo: 1 }

void invalidStaticSide
void invalidStaticRole
void onionSideDefender
void defenderSideOnionRole
void onionMapWithPuss
void defenderMapWithOnion
void invalidMissingSide
void staticWeapon
void dynamicWeapon
void invalidStaticAmmo
void invalidDynamicMaxAmmo

// @ts-expect-error: dynamic weapon instances must not embed static attack data
const invalidWeapon: Weapon = { ...weapon, attack: 4 }

// @ts-expect-error: dynamic weapon instances must use state instead of status
const invalidLegacyWeapon: Weapon = { ...weapon, status: 'ready' }

// @ts-expect-error: dynamic units must resolve movement from the static catalog
const invalidDynamicMovement: OnionUnit = { ...onion, movement: 3 }

// @ts-expect-error: dynamic units must resolve defense from the static catalog
const invalidDynamicDefense: DefenderUnit = { ...defender, defense: 4 }

// @ts-expect-error: dynamic units must resolve abilities from the static catalog
const invalidDynamicAbilities: DefenderUnit = { ...defender, abilities: { maxStacks: 1 } }

// @ts-expect-error: dynamic units must resolve squad capacity from the static catalog
const invalidDynamicSquads: DefenderUnit = { ...defender, squads: 3 }

void invalidWeapon
void invalidLegacyWeapon
void invalidDynamicMovement
void invalidDynamicDefense
void invalidDynamicAbilities
void invalidDynamicSquads
