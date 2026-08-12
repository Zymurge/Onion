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
      state: 'operational',
      weapons: [{ id: 'main', typeId: 'Puss.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main' }],
    })).toBe(true)
  })

  it('recognizes defenders with fire readiness and rejects non-fire modes', () => {
    expect(isUnitCombatReady({ state: 'operational', actionableModes: ['fire'] })).toBe(true)
    expect(isUnitCombatReady({ state: 'operational', actionableModes: ['combined'] })).toBe(false)
  })

  it('counts ready members in a mixed group', () => {
    expect(getGroupCombatReadyCount([
      { state: 'operational', actionableModes: ['fire'] },
      { state: 'operational', actionableModes: [] },
      { state: 'disabled', actionableModes: [] },
    ])).toBe(1)
  })

  it('marks groups disabled only when every member is destroyed or disabled', () => {
    expect(isGroupCombatDisabled([
      { state: 'destroyed' },
      { state: 'disabled' },
    ])).toBe(true)
    expect(isGroupCombatDisabled([
      { state: 'destroyed' },
      { state: 'operational' },
    ])).toBe(false)
  })

  it('uses live ready weapon strength from canonical weapon instances', () => {
    expect(getUnitAttackStrength({
      weapons: [{ id: 'main', typeId: 'Puss.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main' }],
    }, sessionCatalog)).toBeGreaterThan(0)
    expect(getUnitAttackStrength({
      weapons: [],
    }, sessionCatalog)).toBe(0)
  })

  it('counts group attack readiness from positive displayed strength', () => {
    expect(getGroupAttackReadyCount([
      { weapons: [ { id: 'main', typeId: 'Puss.main', weaponClass: 'main', state: 'ready', friendlyName: 'Main' } ] },
      { weapons: [] },
    ], sessionCatalog)).toBe(1)
  })
})