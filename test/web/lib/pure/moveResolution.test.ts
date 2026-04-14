import { describe, expect, it } from 'vitest'

import { formatRamResolutionTitle } from '#web/lib/moveResolution'

describe('formatRamResolutionTitle', () => {
	it('describes the surviving target and tread loss explicitly', () => {
		expect(
			formatRamResolutionTitle({
				actionType: 'MOVE',
				unitId: 'onion-1',
				rammedUnitIds: ['puss-1'],
				destroyedUnitIds: [],
				treadDamage: 1,
				details: [],
			}),
		).toBe('Ram resolved: target survived, Onion lost 1 tread')
	})

	it('describes a destructive ram explicitly', () => {
		expect(
			formatRamResolutionTitle({
				actionType: 'MOVE',
				unitId: 'onion-1',
				rammedUnitIds: ['puss-1'],
				destroyedUnitIds: ['puss-1'],
				treadDamage: 1,
				details: [],
			}),
		).toBe('Ram resolved: 1 destroyed, Onion lost 1 tread')
	})
})