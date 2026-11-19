import { describe, expect, it } from 'vitest'

import { calculateRamming } from '#shared/rammingCalculator'
import { createRulesContext } from '#shared/rulesContext'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'

describe('rammingCalculator', () => {
	it('uses the shared ram profile for Little Pigs', () => {
		expect(calculateRamming('LittlePigs', 1)).toEqual({ treadCost: 0, destroyed: true })
		expect(calculateRamming('LittlePigs', 5)).toEqual({ treadCost: 0, destroyed: false })
	})

	it('uses the shared ram profile for standard armored units', () => {
		expect(calculateRamming('Puss', 4)).toEqual({ treadCost: 1, destroyed: true })
		expect(calculateRamming('Witch', 6)).toEqual({ treadCost: 1, destroyed: false })
	})

	it('uses the heavier tread-loss profile for Dragon', () => {
		expect(calculateRamming('Dragon', 4)).toEqual({ treadCost: 2, destroyed: true })
		expect(calculateRamming('Dragon', 6)).toEqual({ treadCost: 2, destroyed: false })
	})

	it('uses the class profile when a unit has no legacy ramProfile field', () => {
		const puss = getUnitTypeCatalog().Puss
		const rules = createRulesContext({
			unitTypes: {
				Puss: {
					...puss,
					abilities: { ...puss.abilities, ramProfile: undefined },
				},
			},
			weaponTypes: getWeaponTypeCatalog(),
		})

		expect(calculateRamming('Puss', 4, rules)).toEqual({ treadCost: 1, destroyed: true })
	})

	it('throws when the unit type has no ram profile', () => {
		expect(() => calculateRamming('TheOnion', 4)).toThrow(/ram profile/i)
	})
})
