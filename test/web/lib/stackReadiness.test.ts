import { describe, expect, it } from 'vitest'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'
import {
  getGroupCombatReadyCount,
  getGroupAttackReadyCount,
  getUnitAttackStrength,
  isGroupCombatDisabled,
  isUnitCombatReady,
} from '#web/lib/stackReadiness'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

describe('stackReadiness', () => {
  it('recognizes an Onion with a ready weapon', () => {
    expect(isUnitCombatReady({
      status: 'operational',
      weaponDetails: [{ id: 'main', typeId: 'Puss.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main' }],
    })).toBe(true)
  })

  it('recognizes defenders with fire readiness and rejects non-fire modes', () => {
    expect(isUnitCombatReady({ status: 'operational', actionableModes: ['fire'] })).toBe(true)
    expect(isUnitCombatReady({ status: 'operational', actionableModes: ['combined'] })).toBe(false)
  })

  it('counts ready members in a mixed group', () => {
    expect(getGroupCombatReadyCount([
      { status: 'operational', actionableModes: ['fire'] },
      { status: 'operational', actionableModes: [] },
      { status: 'disabled', actionableModes: [] },
    ])).toBe(1)
  })

  it('marks groups disabled only when every member is destroyed or disabled', () => {
    expect(isGroupCombatDisabled([
      { status: 'destroyed' },
      { status: 'disabled' },
    ])).toBe(true)
    expect(isGroupCombatDisabled([
      { status: 'destroyed' },
      { status: 'operational' },
    ])).toBe(false)
  })

  it('uses live ready weapon strength before the attack-string fallback', () => {
    expect(getUnitAttackStrength({
      attack: '1 / rng 1',
      weaponDetails: [{ id: 'main', typeId: 'Puss.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main' }],
    }, sessionCatalog)).toBeGreaterThan(0)
    expect(getUnitAttackStrength({
      attack: '4 / rng 1',
      weaponDetails: [],
    }, sessionCatalog)).toBe(4)
  })

  it('counts group attack readiness from positive displayed strength', () => {
    expect(getGroupAttackReadyCount([
      { attack: '4 / rng 1', weaponDetails: [] },
      { attack: '0 / rng 1', weaponDetails: [] },
    ], sessionCatalog)).toBe(1)
  })
})