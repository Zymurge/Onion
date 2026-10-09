import { describe, expect, it } from 'vitest'

import { getUnitSpriteHref } from '#web/lib/unitSpriteRegistry'

describe('unit sprite registry', () => {
	it('resolves ordinary unit sprites from their sprite keys', () => {
		for (const spriteKey of ['puss', 'big-bad-wolf', 'witch', 'lord-farquaad', 'pinocchio', 'dragon', 'little-pigs']) {
			expect(getUnitSpriteHref(spriteKey, 'operational')).toContain('puss-converted.png')
		}
	})

	it('selects the Swamp asset by state', () => {
		expect(getUnitSpriteHref('swamp', 'operational')).toContain('The%20Swamp%20-%20intact.png')
		expect(getUnitSpriteHref('swamp', 'destroyed')).toContain('The%20Swamp%20-%20destroyed.png')
	})

	it('returns no asset for an unknown sprite key', () => {
		expect(getUnitSpriteHref('missing', 'operational')).toBeUndefined()
	})
})