import { describe, expect, it } from 'vitest'

import { buildCombatTargetOptions } from './combatPreview'

describe('buildCombatTargetOptions', () => {
	it('builds shared combat preview data for ridgeline targets', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['3,2']),
			displayedDefenders: [
				{
					id: 'near-1',
					type: 'LittlePigs',
					status: 'operational',
					q: 3,
					r: 2,
					move: 0,
					weapons: 'main: ready',
					attack: '1 / rng 1',
					defense: 3,
					squads: 2,
					actionableModes: ['fire'],
				},
			],
			displayedOnion: {
				id: 'onion-1',
				type: 'TheOnion',
				q: 0,
				r: 1,
				status: 'operational',
				treads: 33,
				movesAllowed: 0,
				movesRemaining: 0,
				rams: 0,
				weapons: 'main: ready',
				weaponDetails: [
					{ id: 'main-1', name: 'Main Battery', attack: 4, range: 4, defense: 4, status: 'ready', individuallyTargetable: true },
				],
			},
			selectedUnitIds: ['weapon:main-1'],
			selectedAttackStrength: 4,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [{ q: 3, r: 2, t: 1 }],
			},
		})

		expect(options).toHaveLength(1)
		expect(options[0]).toMatchObject({
			id: 'near-1',
			defense: 3,
			modifiers: expect.arrayContaining(['Ridgeline cover: +1 defense']),
		})
	})
})