import { describe, expect, it } from 'vitest'

import { calculateRamming, resolveRammingOutcome } from '#shared/rammingCalculator'

describe('resolveRammingOutcome', () => {
	it('resolves Little Pigs ramming as destroyed on qualifying rolls', () => {
		expect(resolveRammingOutcome('LittlePigs', 1)).toMatchObject({
			effect: 'destroyed',
			treadCost: 0,
			destroyed: true,
		})
	})

	it('resolves Little Pigs ramming as survived on non-qualifying rolls', () => {
		expect(resolveRammingOutcome('LittlePigs', 5)).toMatchObject({
			effect: 'survived',
			treadCost: 0,
			destroyed: false,
		})
	})

	it('resolves Puss ramming with normal armor tread cost', () => {
		expect(resolveRammingOutcome('Puss', 4)).toMatchObject({
			effect: 'destroyed',
			treadCost: 1,
			destroyed: true,
		})
	})

	it('resolves Dragon ramming with heavy armor tread cost', () => {
		expect(resolveRammingOutcome('Dragon', 6)).toMatchObject({
			effect: 'survived',
			treadCost: 2,
			destroyed: false,
		})
	})
})

describe('calculateRamming', () => {
	it('preserves the legacy treadCost and destroyed contract', () => {
		expect(calculateRamming('Puss', 1)).toEqual({ treadCost: 1, destroyed: true })
	})
})