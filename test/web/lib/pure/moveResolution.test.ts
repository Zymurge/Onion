import { describe, expect, it } from 'vitest'

import { buildRamResolution } from '#web/lib/moveResolution'

describe('buildRamResolution', () => {
	it('returns one resolution per rammed unit result', () => {
		expect(
			buildRamResolution([
				{
					type: 'MOVE_RESOLVED',
					unitId: 'onion-1',
					rammedUnitResults: [
						{
							unitId: 'puss-1',
							unitFriendlyName: 'Puss 1',
							unitType: 'Puss',
							outcome: { effect: 'destroyed', roll: 3, treadCost: 1 },
						},
						{
							unitId: 'wolf-2',
							unitFriendlyName: 'Big Bad Wolf 2',
							unitType: 'BigBadWolf',
							outcome: { effect: 'survived', roll: 6, treadCost: 1 },
						},
					],
				},
				{ type: 'ONION_TREADS_LOST', amount: 2, remaining: 43 },
			]),
		).toEqual([
			{
				actionType: 'MOVE',
				unitId: 'onion-1',
				rammedUnitId: 'puss-1',
				rammedUnitFriendlyName: 'Puss 1',
				destroyedUnitId: 'puss-1',
				treadDamage: 1,
				details: ['Target: Puss 1', 'Result: destroyed', 'Roll: 3', 'Tread loss: 1'],
			},
			{
				actionType: 'MOVE',
				unitId: 'onion-1',
				rammedUnitId: 'wolf-2',
				rammedUnitFriendlyName: 'Big Bad Wolf 2',
				destroyedUnitId: '',
				treadDamage: 1,
				details: ['Target: Big Bad Wolf 2', 'Result: survived', 'Roll: 6', 'Tread loss: 1'],
			},
		])
	})

	it('falls back to aggregate rammed unit ids when per-target results are absent', () => {
		expect(
			buildRamResolution([
				{
					type: 'MOVE_RESOLVED',
					unitId: 'onion-1',
					rammedUnitIds: ['puss-1'],
					destroyedUnitIds: ['puss-1'],
					treadDamage: 1,
				},
				{
					type: 'ONION_TREADS_LOST',
					amount: 1,
					remaining: 44,
				},
			]),
		).toEqual([
			{
				actionType: 'MOVE',
				unitId: 'onion-1',
				rammedUnitId: 'puss-1',
				rammedUnitFriendlyName: 'puss-1',
				destroyedUnitId: 'puss-1',
				treadDamage: 1,
				details: ['Target: puss-1', 'Result: destroyed', 'Tread loss: 1'],
			},
		])
	})
})