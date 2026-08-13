import { describe, expect, it } from 'vitest'
import type { Weapon, WeaponType } from '#shared/types'
import { getUnitTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog, type SessionCatalog } from '../../../web/lib/sessionCatalog'
import {
  formatAttackSummary,
  formatWeaponSummary,
  getActionableModes,
  getBattlefieldWeaponAttack,
  getPrimaryWeaponStats,
  getReadyWeaponRange,
  isBattlefieldUnitCombatReady,
  isBattlefieldWeaponReady,
  parseWeaponStats,
  resolveBattlefieldWeaponName,
} from '../../../web/lib/weaponStats'

function createWeaponType(typeId: string, attack: number, range: number, weaponClass: WeaponType['weaponClass'] = 'main'): WeaponType {
  return {
    typeId,
    name: `${typeId} name`,
    weaponClass,
    attack,
    range,
    individuallyTargetable: false,
  }
}

const catalog: SessionCatalog = createSessionCatalog(getUnitTypeCatalog(), {
  'test.low': createWeaponType('test.low', 4, 12),
  'test.high': createWeaponType('test.high', 8, 2),
  'test.tie-short': createWeaponType('test.tie-short', 8, 4),
  'test.tie-long': createWeaponType('test.tie-long', 8, 9),
  'test.ready-short': createWeaponType('test.ready-short', 2, 6),
  'test.spent-long': createWeaponType('test.spent-long', 20, 99),
  'test.destroyed-long': createWeaponType('test.destroyed-long', 20, 100),
})

function createWeapon(typeId: string, state: Weapon['state'] = 'ready', weaponClass: Weapon['weaponClass'] = 'main'): Weapon {
  return {
    id: typeId,
    typeId,
    weaponClass,
    state,
    friendlyName: `${typeId} weapon`,
  }
}

const readyWeapon = createWeapon('test.high')

describe('weaponStats', () => {
	it('resolves names and numeric statistics from a catalog, with explicit no-catalog fallbacks', () => {
		expect(resolveBattlefieldWeaponName(readyWeapon, catalog)).toBe('test.high name')
		expect(resolveBattlefieldWeaponName(readyWeapon)).toBe('test.high')
		expect(getBattlefieldWeaponAttack(readyWeapon, catalog)).toBe(8)
		expect(getBattlefieldWeaponAttack(readyWeapon)).toBe(0)
    expect(getPrimaryWeaponStats([readyWeapon], catalog)).toEqual({ attack: 8, range: 2 })
    expect(getPrimaryWeaponStats([readyWeapon])).toEqual({ attack: 0, range: 0 })
		expect(formatAttackSummary([readyWeapon], catalog)).toBe('8 / rng 2')
		expect(formatAttackSummary([readyWeapon])).toBe('0 / rng 0')
		expect(getReadyWeaponRange([readyWeapon], catalog)).toBe(2)
		expect(getReadyWeaponRange([readyWeapon])).toBe(0)
	})

	it('handles empty inputs and string weapon placeholders', () => {
		expect(parseWeaponStats([])).toEqual({ operationalWeapons: 0, operationalMissiles: 0 })
		expect(parseWeaponStats('not-loaded')).toEqual({ operationalWeapons: 0, operationalMissiles: 0 })
		expect(formatWeaponSummary(undefined)).toBe('n/a')
		expect(formatWeaponSummary([])).toBe('n/a')
		expect(formatAttackSummary(undefined)).toBe('0 / rng 0')
		expect(formatAttackSummary([])).toBe('0 / rng 0')
		expect(getReadyWeaponRange(undefined)).toBe(0)
		expect(getReadyWeaponRange([])).toBe(0)
	})

  it('counts ready weapons and missiles', () => {
    expect(parseWeaponStats([
      { id: 'gun', typeId: 'gun', state: 'ready', weaponClass: 'weapon' },
      { id: 'missile', typeId: 'missile', state: 'ready', weaponClass: 'missile' },
      { id: 'spent', typeId: 'gun', state: 'spent', weaponClass: 'weapon' },
    ])).toEqual({ operationalWeapons: 1, operationalMissiles: 1 })
  })

  it('selects the strongest weapon by attack, then by range', () => {
    expect(formatAttackSummary([
      createWeapon('test.low'),
      createWeapon('test.high'),
    ], catalog)).toBe('8 / rng 2')
    expect(formatAttackSummary([
      createWeapon('test.tie-short'),
      createWeapon('test.tie-long'),
    ], catalog)).toBe('8 / rng 9')
  })

  it('uses the first weapon when attack and range are tied', () => {
    const tiedWeaponType = createWeaponType('test.tied', 5, 7)
    const tiedCatalog: SessionCatalog = createSessionCatalog(getUnitTypeCatalog(), {
      'test.tied': tiedWeaponType,
    })

    expect(formatAttackSummary([
      createWeapon('test.tied'),
      { ...createWeapon('test.tied'), id: 'second' },
    ], tiedCatalog)).toBe('5 / rng 7')
  })

  it('filters ready weapons before calculating the maximum range', () => {
    expect(getReadyWeaponRange([
      createWeapon('test.ready-short', 'ready'),
      createWeapon('test.spent-long', 'spent'),
      createWeapon('test.destroyed-long', 'destroyed'),
    ], catalog)).toBe(6)
  })

  it('reports weapon readiness and combat readiness', () => {
    expect(isBattlefieldWeaponReady(createWeapon('test.high', 'ready'))).toBe(true)
    expect(isBattlefieldWeaponReady(createWeapon('test.high', 'spent'))).toBe(false)
    expect(isBattlefieldUnitCombatReady({ actionableModes: ['fire'] })).toBe(true)
    expect(isBattlefieldUnitCombatReady({ actionableModes: ['combined'] })).toBe(false)
  })

  it('returns no modes for destroyed or disabled units in every phase', () => {
    const phases = ['ONION_MOVE', 'ONION_COMBAT', 'DEFENDER_RECOVERY', 'DEFENDER_MOVE', 'DEFENDER_COMBAT', 'GEV_SECOND_MOVE', null] as const

    for (const status of ['destroyed', 'disabled'] as const) {
      for (const phase of phases) {
        expect(getActionableModes(status, [readyWeapon], true, phase)).toEqual([])
      }
    }
  })

  it('applies phase precedence for ready weapons and active turns', () => {
    expect(getActionableModes('operational', [readyWeapon], false, 'DEFENDER_COMBAT')).toEqual(['fire', 'combined'])
    expect(getActionableModes('operational', [readyWeapon], true, 'ONION_COMBAT')).toEqual([])
    expect(getActionableModes('operational', [readyWeapon], false, 'ONION_MOVE')).toEqual([])
    expect(getActionableModes('operational', [readyWeapon], true, 'ONION_MOVE')).toEqual(['fire', 'combined'])
    expect(getActionableModes('operational', [], true, 'DEFENDER_COMBAT')).toEqual([])
  })

  it('covers every non-combat phase branch for an active operational unit', () => {
    for (const phase of ['ONION_MOVE', 'DEFENDER_RECOVERY', 'DEFENDER_MOVE', 'GEV_SECOND_MOVE', null] as const) {
      expect(getActionableModes('operational', [readyWeapon], true, phase)).toEqual(['fire', 'combined'])
    }
  })
})