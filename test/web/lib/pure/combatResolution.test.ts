import { describe, expect, it } from 'vitest'

import { buildCombatResolution } from '#web/lib/combatResolution'

describe('buildCombatResolution', () => {
	it('summarizes combat events for a toast', () => {
		expect(
			buildCombatResolution([
				{
					seq: 5,
					type: 'FIRE_RESOLVED',
					timestamp: '2026-03-31T00:00:00.000Z',
					attackers: ['wolf-2'],
					attackerFriendlyNames: ['Big Bad Wolf 2'],
					targetId: 'onion-1',
					targetFriendlyName: 'The Onion 1',
					roll: 6,
					outcome: 'D',
					odds: '2:1',
				},
				{
					seq: 6,
					type: 'UNIT_SQUADS_LOST',
					timestamp: '2026-03-31T00:00:00.000Z',
					unitId: 'pigs-1',
					unitFriendlyName: 'Little Pigs 1',
					amount: 1,
				},
				{
					seq: 7,
					type: 'UNIT_STATUS_CHANGED',
					timestamp: '2026-03-31T00:00:00.000Z',
					unitId: 'pigs-1',
					unitFriendlyName: 'Little Pigs 1',
					from: 'operational',
					to: 'disabled',
				},
				{
					seq: 8,
					type: 'ONION_BATTERY_DESTROYED',
					timestamp: '2026-03-31T00:00:00.000Z',
					weaponId: 'main',
					weaponFriendlyName: 'Main Battery',
				},
				{ seq: 9, type: 'ONION_TREADS_LOST', timestamp: '2026-03-31T00:00:00.000Z', amount: 3, remaining: 30 },
			]),
		).toEqual({
			actionType: 'FIRE',
			attackers: ['wolf-2'],
			attackerFriendlyNames: ['Big Bad Wolf 2'],
			targetId: 'onion-1',
			targetFriendlyName: 'The Onion 1',
			outcome: 'D',
			outcomeLabel: 'Hit',
			roll: 6,
			odds: '2:1',
			details: [
				'Squads lost: Little Pigs 1: -1',
				'Status: Little Pigs 1 operational → disabled',
				'Destroyed weapon: Main Battery',
				'Treads lost: 3 (remaining 30)',
			],
		})
	})
})
