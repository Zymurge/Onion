import { describe, expect, it } from 'vitest'

import { onionMovementAllowance } from '#shared/movementAllowance'

describe('onionMovementAllowance', () => {
	it('returns 0 when the Onion has no treads left', () => {
		expect(onionMovementAllowance(0)).toBe(0)
	})

	it('returns 1 at the first movement band', () => {
		expect(onionMovementAllowance(15)).toBe(1)
	})

	it('returns 2 when the Onion crosses into the middle movement band', () => {
		expect(onionMovementAllowance(16)).toBe(2)
	})

	it('returns 2 at the upper middle bound', () => {
		expect(onionMovementAllowance(30)).toBe(2)
	})

	it('returns 3 when the Onion reaches the top movement band', () => {
		expect(onionMovementAllowance(31)).toBe(3)
	})
})