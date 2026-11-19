import { describe, expect, it } from 'vitest'

import {
  UNIT_CLASS_RULES,
  UNIT_CLASSES,
  getUnitClassRule,
  isUnitClass,
} from '#shared/classRules'
import type { UnitClass } from '#shared/types/index'

describe('unit class rules', () => {
  it('defines the approved PascalCase class identifiers', () => {
    expect(UNIT_CLASSES).toEqual([
      'Infantry',
      'LightArmor',
      'HeavyArmor',
      'GEV',
      'Command',
      'Artillery',
      'Onion',
    ])

    for (const unitClass of UNIT_CLASSES) {
      expect(isUnitClass(unitClass)).toBe(true)
    }
    expect(isUnitClass('lightArmor')).toBe(false)
    expect(isUnitClass('TheOnion')).toBe(false)
  })

  it('provides complete immutable rules for every class', () => {
    const expectedClasses: UnitClass[] = [...UNIT_CLASSES]
    expect(Object.keys(UNIT_CLASS_RULES)).toEqual(expect.arrayContaining(expectedClasses))
    expect(Object.keys(UNIT_CLASS_RULES)).toHaveLength(expectedClasses.length)

    for (const unitClass of UNIT_CLASSES) {
      const rule = getUnitClassRule(unitClass)
      expect(rule.mobility).toMatch(/^(mobile|immobile)$/)
      expect(typeof rule.isArmor).toBe('boolean')
      expect(rule.secondMove).toEqual(expect.objectContaining({ allowed: expect.any(Boolean) }))
      expect(rule.terrain.ridge).toEqual({ canCross: expect.any(Boolean), movementSurcharge: expect.any(Number) })
      expect(rule.terrain.stream).toEqual({ canCross: expect.any(Boolean), movementSurcharge: expect.any(Number) })
      expect(rule.ram.attacker).toEqual({ canRam: expect.any(Boolean), capacity: expect.any(Number), perTurn: expect.any(Number) })
      expect(Object.isFrozen(rule)).toBe(true)
      expect(Object.isFrozen(rule.terrain)).toBe(true)
      expect(Object.isFrozen(rule.ram)).toBe(true)
    }

    expect(Object.isFrozen(UNIT_CLASS_RULES)).toBe(true)
  })

  it('encodes the approved class behavior', () => {
    expect(UNIT_CLASS_RULES.Infantry).toMatchObject({
      mobility: 'mobile',
      isArmor: false,
      terrain: {
        ridge: { canCross: true, movementSurcharge: 0 },
        stream: { canCross: true, movementSurcharge: 0 },
      },
      ram: { attacker: { canRam: false }, rammedTarget: { treadLoss: 0, destroyOnRollAtMost: 4 } },
    })
    expect(UNIT_CLASS_RULES.LightArmor).toMatchObject({
      mobility: 'mobile',
      isArmor: true,
      terrain: {
        ridge: { canCross: false, movementSurcharge: 0 },
        stream: { canCross: true, movementSurcharge: 1 },
      },
    })
    expect(UNIT_CLASS_RULES.GEV.secondMove).toEqual({ allowed: true, allowance: 3 })
    expect(UNIT_CLASS_RULES.Command.mobility).toBe('immobile')
    expect(UNIT_CLASS_RULES.Artillery.mobility).toBe('immobile')
    expect(UNIT_CLASS_RULES.Onion).toMatchObject({
      mobility: 'mobile',
      isArmor: false,
      ram: { attacker: { canRam: true, capacity: 2, perTurn: 2 } },
    })
  })
})
