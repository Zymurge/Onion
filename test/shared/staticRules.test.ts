import { describe, expect, it } from 'vitest'

import { ONION_STATIC_RULES } from '#shared/staticRules'
import { getUnitClassRule } from '#shared/classRules'

describe('staticRules bundle', () => {
	it('exposes only the canonical unit definitions for combat', () => {
		expect(Object.keys(ONION_STATIC_RULES)).toEqual(['unitTypes'])
		expect(ONION_STATIC_RULES.unitTypes.Puss.typeId).toBe('Puss')
	})

	it('keeps shared calculators on the same static unit definition source', () => {
		expect(getUnitClassRule(ONION_STATIC_RULES.unitTypes.TheOnion.unitClass).ram.attacker?.canRam).toBe(true)
		expect(getUnitClassRule(ONION_STATIC_RULES.unitTypes.LittlePigs.unitClass).ram.rammedTarget.treadLoss).toBe(0)
	})
})
