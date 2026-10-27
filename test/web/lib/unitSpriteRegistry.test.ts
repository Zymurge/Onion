import { describe, expect, it } from 'vitest'

import { SUPPORTED_UNIT_SPRITE_KEYS } from '#shared/unitSpriteManifest'
import { getUnitSpriteHref } from '#web/lib/unitSpriteRegistry'
import { unitSpriteRegistry } from '#web/lib/unitSpriteRegistry'

describe('unit sprite registry', () => {
	it('registers every key in the shared sprite manifest', () => {
		expect(Object.keys(unitSpriteRegistry)).toEqual(expect.arrayContaining([...SUPPORTED_UNIT_SPRITE_KEYS]))
	})

	it('resolves ordinary unit sprites from their sprite keys', () => {
		for (const spriteKey of ['puss']) {
			expect(getUnitSpriteHref(spriteKey, 'operational')).toContain('puss-sprite.png')
		}
		expect(getUnitSpriteHref('big-bad-wolf', 'operational')).toContain('big-bad-wolf-sprite.png')
		expect(getUnitSpriteHref('dragon', 'operational')).toContain('dragon-sprite.png')
		expect(getUnitSpriteHref('farquaad', 'operational')).toContain('farquaad-sprite.png')
		expect(getUnitSpriteHref('pinocchio', 'operational')).toContain('pinocchio-sprite.png')
		expect(getUnitSpriteHref('little-pigs', 'operational')).toContain('little-pigs-sprite.png')
		expect(getUnitSpriteHref('the-onion', 'operational')).toContain('the-onion-sprite.png')
		expect(getUnitSpriteHref('the-onion', 'operational', true)).toContain('the-onion-damaged-sprite.png')
		expect(getUnitSpriteHref('the-onion', 'destroyed')).toContain('the-onion-damaged-sprite.png')
		expect(getUnitSpriteHref('the-onion-damaged', 'operational')).toContain('the-onion-damaged-sprite.png')
	})

	it('selects the Swamp asset by state', () => {
		expect(getUnitSpriteHref('swamp', 'operational')).toContain('The%20Swamp%20-%20intact.png')
		expect(getUnitSpriteHref('swamp', 'destroyed')).toContain('The%20Swamp%20-%20destroyed.png')
	})

	it('uses the generic asset for missing or unknown sprite keys', () => {
		expect(getUnitSpriteHref(undefined, 'operational')).toContain('data:image/svg+xml')
		expect(getUnitSpriteHref('missing', 'operational')).toContain('data:image/svg+xml')
	})

	it('resolves the Witch sprite asset', () => {
		expect(getUnitSpriteHref('witch', 'operational')).toContain('witch-sprite.png')
	})
})