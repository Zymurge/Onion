import { describe, expect, it } from 'vitest'
import { parseAttackStats, parseWeaponStats } from '../../../web/lib/weaponStats'

describe('weaponStats', () => {
  it('parses attack summaries', () => {
    expect(parseAttackStats('4 / rng 7')).toEqual({ damage: '4', range: '7' })
  })

  it('counts ready weapons and missiles', () => {
    expect(parseWeaponStats([
      { id: 'gun', typeId: 'gun', state: 'ready', weaponClass: 'weapon' },
      { id: 'missile', typeId: 'missile', state: 'ready', weaponClass: 'missile' },
      { id: 'spent', typeId: 'gun', state: 'spent', weaponClass: 'weapon' },
    ])).toEqual({ operationalWeapons: 1, operationalMissiles: 1 })
  })
})