import { describe, expect, it } from 'vitest'

import { ONION_STATIC_RULES } from '#shared/staticRules'
import { getUnitClassRule } from '#shared/classRules'

describe('staticRules bundle', () => {
	it('exposes the canonical unit and terrain rules bundle', () => {
		expect(ONION_STATIC_RULES.unitTypes.Puss.typeId).toBe('Puss')
		expect(ONION_STATIC_RULES.terrainRules.ridgeline).toEqual({ terrainType: 'ridgeline' })
		expect(ONION_STATIC_RULES.terrainRules.crater.terrainType).toBe('crater')
	})

	it('keeps shared calculators on the same static unit definition source', () => {
		expect(getUnitClassRule(ONION_STATIC_RULES.unitTypes.TheOnion.unitClass).ram.attacker?.canRam).toBe(true)
		expect(getUnitClassRule(ONION_STATIC_RULES.unitTypes.LittlePigs.unitClass).ram.rammedTarget.treadLoss).toBe(0)
	})
})
