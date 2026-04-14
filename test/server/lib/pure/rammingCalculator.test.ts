import { describe, expect, it } from 'vitest'

import { calculateRamming } from '#shared/rammingCalculator'

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

	it('throws when the unit type has no ram profile', () => {
		expect(() => calculateRamming('TheOnion', 4)).toThrow(/ram profile/i)
	})
})