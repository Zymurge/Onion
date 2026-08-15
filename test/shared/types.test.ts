import { expect, describe, it } from 'vitest'
import type { DefenderUnit, OnionUnit, Weapon } from '#shared/types/index'
import { DEFAULT_ONION_UNIT_TYPE_ID } from '#shared/unitDefinitions'

const weapon: Weapon = {
  id: 'main-1',
  typeId: 'main-weapon',
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
  movesRemaining: 3,
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
  movesRemaining: 1,
  squads: 1,
}

describe('canonical dynamic unit types', () => {
  it('represent role-specific runtime state without static catalog fields', () => {
    expect(onion.role).toBe('onion')
    expect(onion.treads).toBe(45)
    expect(defender.role).toBe('defender')
    expect(defender.squads).toBe(1)
    expect(weapon.typeId).toBe('main-weapon')
    expect(weapon.state).toBe('ready')
  })
})

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

it.todo('TYPE-001 static unit types do not accept side or role')
it.todo('TYPE-002 runtime units accept either side independently of chassis capabilities')
it.todo('TYPE-003 side collections admit every valid runtime chassis')
it.todo('AMMO-005 WeaponType accepts maxAmmo while Weapon accepts only dynamic ammo')