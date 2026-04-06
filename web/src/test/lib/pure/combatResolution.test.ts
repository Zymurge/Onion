import { describe, expect, it } from 'vitest'

import { buildCombatResolution } from '../../../lib/combatResolution'

describe('buildCombatResolution', () => {
	it('summarizes combat events for a toast', () => {
		expect(
			buildCombatResolution([
				{ seq: 5, type: 'FIRE_RESOLVED', timestamp: '2026-03-31T00:00:00.000Z', attackers: ['wolf-2'], targetId: 'onion-1', roll: 6, outcome: 'X', odds: '2:1' },
				{ seq: 6, type: 'ONION_TREADS_LOST', timestamp: '2026-03-31T00:00:00.000Z', amount: 3, remaining: 30 },
			]),
		).toEqual({
			actionType: 'FIRE',
			attackers: ['wolf-2'],
			targetId: 'onion-1',
			outcome: 'X',
			outcomeLabel: 'Hit',
			roll: 6,
			odds: '2:1',
			details: ['Treads lost: 3 (remaining 30)'],
		})
	})
})