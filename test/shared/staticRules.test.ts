import { describe, expect, it } from 'vitest'

import { ONION_STATIC_RULES } from '#shared/staticRules'

describe('staticRules bundle', () => {
	it('exposes the canonical unit and terrain rules bundle', () => {
		expect(ONION_STATIC_RULES.unitDefinitions.Puss.type).toBe('Puss')
		expect(ONION_STATIC_RULES.terrainRules.ridgeline.defenseBonus).toBe(1)
		expect(ONION_STATIC_RULES.terrainRules.crater.terrainType).toBe('crater')
	})

	it('keeps shared calculators on the same static unit definition source', () => {
		expect(ONION_STATIC_RULES.unitDefinitions.TheOnion.abilities.canRam).toBe(true)
		expect(ONION_STATIC_RULES.unitDefinitions.LittlePigs.abilities.ramProfile?.treadLoss).toBe(0)
	})
})
