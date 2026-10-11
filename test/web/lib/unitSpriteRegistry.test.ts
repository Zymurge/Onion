import { describe, expect, it } from 'vitest'

import { getUnitSpriteHref } from '#web/lib/unitSpriteRegistry'

describe('unit sprite registry', () => {
	it('resolves ordinary unit sprites from their sprite keys', () => {
		for (const spriteKey of ['puss', 'dragon']) {
			expect(getUnitSpriteHref(spriteKey, 'operational')).toContain('puss-sprite.png')
		}
		expect(getUnitSpriteHref('big-bad-wolf', 'operational')).toContain('big-bad-wolf-sprite.png')
		expect(getUnitSpriteHref('farquaad', 'operational')).toContain('farquaad-sprite.png')
		expect(getUnitSpriteHref('pinocchio', 'operational')).toContain('pinocchio-sprite.png')
		expect(getUnitSpriteHref('little-pigs', 'operational')).toContain('little-pigs-sprite.png')
		expect(getUnitSpriteHref('the-onion', 'operational')).toContain('the-onion-sprite.png')
	})

	it('selects the Swamp asset by state', () => {
		expect(getUnitSpriteHref('swamp', 'operational')).toContain('The%20Swamp%20-%20intact.png')
		expect(getUnitSpriteHref('swamp', 'destroyed')).toContain('The%20Swamp%20-%20destroyed.png')
	})

	it('returns no asset for an unknown sprite key', () => {
		expect(getUnitSpriteHref('missing', 'operational')).toBeUndefined()
	})

	it('resolves the Witch sprite asset', () => {
		expect(getUnitSpriteHref('witch', 'operational')).toContain('witch-sprite.png')
	})
})