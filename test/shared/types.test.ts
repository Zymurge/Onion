import { expect, describe, it } from 'vitest'
import type { DefenderUnit, OnionUnit, Weapon } from '#shared/types/index'
import { DEFAULT_ONION_UNIT_TYPE_ID } from '#shared/unitDefinitions'

const weapon: Weapon = {
  id: 'main-1',
  typeId: 'main-battery',
  state: 'ready',
  ammo: 1,
  friendlyName: 'Main Battery',
}

const onion: OnionUnit = {
  unitId: 'onion-1',
  typeId: DEFAULT_ONION_UNIT_TYPE_ID,
  role: 'onion',
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
    expect(weapon.typeId).toBe('main-battery')
    expect(weapon.state).toBe('ready')
  })
})

// @ts-expect-error: dynamic weapon instances must not embed static attack data
const invalidWeapon: Weapon = { ...weapon, attack: 4 }

// @ts-expect-error: dynamic weapon instances must use state instead of status
const invalidLegacyWeapon: Weapon = { ...weapon, status: 'ready' }

void invalidWeapon
void invalidLegacyWeapon