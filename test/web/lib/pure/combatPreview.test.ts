import { describe, expect, it } from 'vitest'

import { buildCombatTargetOptions } from '#web/lib/combatPreview'

describe('buildCombatTargetOptions', () => {
	it('builds shared combat preview data for ridgeline targets', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['3,2']),
			displayedDefenders: [
				{
					id: 'near-1',
					type: 'LittlePigs',
					friendlyName: 'Little Pigs 1',
					status: 'operational',
					q: 3,
					r: 2,
					move: 0,
					weapons: 'main: ready',
					attack: '1 / rng 1',
					defense: 2,
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
					{
						id: 'main-1',
						name: 'Main Battery',
						friendlyName: 'Main Battery 1',
						attack: 4,
						range: 4,
						defense: 4,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
			},
			selectedUnitIds: ['weapon:main-1'],
			selectedAttackStrength: 4,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [{ q: 3, r: 2, t: 1 }],
			},
		})

		expect(options).toHaveLength(1)
		expect(options[0]).toMatchObject({
			id: 'near-1',
			label: 'Little Pigs 1',
			defense: 3,
			modifiers: expect.arrayContaining(['Ridgeline cover: +1 defense']),
		})
	})

	it('filters AP targets to infantry only', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['1,0', '1,1', '2,1']),
			displayedDefenders: [
				{
					id: 'wolf-1',
					type: 'BigBadWolf',
					status: 'operational',
					q: 1,
					r: 0,
					move: 0,
					weapons: 'main: ready',
					attack: '2 / rng 2',
					defense: 4,
					actionableModes: ['fire'],
				},
				{
					id: 'pigs-1',
					type: 'LittlePigs',
					status: 'operational',
					q: 1,
					r: 1,
					move: 0,
					weapons: 'rifle: ready',
					attack: '1 / rng 1',
					defense: 2,
					squads: 2,
					actionableModes: ['fire'],
				},
			],
			displayedOnion: {
				id: 'onion-1',
				type: 'TheOnion',
				q: 0,
				r: 0,
				status: 'operational',
				treads: 33,
				movesAllowed: 0,
				movesRemaining: 0,
				rams: 0,
				weapons: 'ap: ready',
				weaponDetails: [
					{
						id: 'ap_1',
						name: 'AP Gun',
						attack: 1,
						range: 1,
						defense: 1,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
			},
			selectedUnitIds: ['weapon:ap_1'],
			selectedAttackStrength: 1,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [],
			},
		})

		expect(options.map((option) => option.id)).toEqual(['pigs-1'])
	})

	it('keeps Swamp targetable for non-AP Onion weapons', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['1,0', '1,1', '2,1']),
			displayedDefenders: [
				{
					id: 'swamp-1',
					type: 'Swamp',
					friendlyName: 'The Swamp',
					status: 'operational',
					q: 1,
					r: 1,
					move: 0,
					weapons: '',
					attack: '0 / rng 0',
					defense: 0,
					actionableModes: ['fire'],
				},
			],
			displayedOnion: {
				id: 'onion-1',
				type: 'TheOnion',
				q: 0,
				r: 0,
				status: 'operational',
				treads: 33,
				movesAllowed: 0,
				movesRemaining: 0,
				rams: 0,
				weapons: 'main: ready',
				weaponDetails: [
					{
						id: 'main-1',
						name: 'Main Battery',
						attack: 4,
						range: 3,
						defense: 4,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
			},
			selectedUnitIds: ['weapon:main-1'],
			selectedAttackStrength: 4,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [],
			},
		})

		expect(options.map((option) => option.id)).toEqual(['swamp-1'])
	})

	it('honors target-unit restrictions in the target selector', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['1,0', '1,1', '2,1']),
			displayedDefenders: [
				{
					id: 'pigs-1',
					type: 'LittlePigs',
					status: 'operational',
					q: 1,
					r: 1,
					move: 0,
					weapons: 'rifle: ready',
					attack: '1 / rng 1',
					defense: 2,
					squads: 2,
					targetRules: { allowedAttackerUnitTypes: ['BigBadWolf'] },
					actionableModes: ['fire'],
				},
			],
			displayedOnion: {
				id: 'onion-1',
				type: 'TheOnion',
				q: 0,
				r: 0,
				status: 'operational',
				treads: 33,
				movesAllowed: 0,
				movesRemaining: 0,
				rams: 0,
				weapons: 'ap: ready',
				weaponDetails: [
					{
						id: 'ap_1',
						name: 'AP Gun',
						friendlyName: 'AP Gun 1',
						attack: 1,
						range: 1,
						defense: 1,
						status: 'ready',
						individuallyTargetable: true,
						targetRules: { allowedTargetUnitTypes: ['LittlePigs'] },
					},
				],
			},
			selectedUnitIds: ['weapon:ap_1'],
			selectedAttackStrength: 1,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [],
			},
		})

		expect(options.map((option) => option.id)).toEqual([])
	})

	it('still offers defender combat targets on the Onion', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'defender',
			combatRangeHexKeys: new Set(['0,0']),
			displayedDefenders: [
				{
					id: 'wolf-2',
					type: 'BigBadWolf',
					friendlyName: 'Big Bad Wolf 2',
					status: 'operational',
					q: 1,
					r: 1,
					move: 4,
					weapons: 'main: ready',
					attack: '2 / rng 2',
					defense: 4,
					actionableModes: ['fire'],
				},
			],
			displayedOnion: {
				id: 'onion-1',
				type: 'TheOnion',
				q: 0,
				r: 0,
				status: 'operational',
				treads: 33,
				movesAllowed: 0,
				movesRemaining: 0,
				rams: 0,
				weapons: 'main: ready',
				weaponDetails: [
					{
						id: 'ap_1',
						name: 'AP Gun',
						friendlyName: 'AP Gun 1',
						attack: 1,
						range: 1,
						defense: 1,
						status: 'ready',
						individuallyTargetable: true,
						targetRules: { allowedTargetUnitTypes: ['LittlePigs'] },
					},
				],
			},
			selectedUnitIds: ['wolf-2'],
			selectedAttackStrength: 2,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [],
			},
		})

		expect(options.map((option) => option.id)).toEqual(['onion-1:treads', 'weapon:ap_1'])
	})

	it('disables treads when multiple defender groups are selected', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'defender',
			combatRangeHexKeys: new Set(['0,0']),
			displayedDefenders: [
				{
					id: 'wolf-2',
					type: 'BigBadWolf',
					friendlyName: 'Big Bad Wolf 2',
					status: 'operational',
					q: 1,
					r: 1,
					move: 4,
					weapons: 'main: ready',
					attack: '2 / rng 2',
					defense: 4,
					actionableModes: ['fire'],
				},
				{
					id: 'puss-1',
					type: 'Puss',
					friendlyName: 'Puss 1',
					status: 'operational',
					q: 2,
					r: 1,
					move: 4,
					weapons: 'main: ready',
					attack: '1 / rng 1',
					defense: 3,
					actionableModes: ['fire'],
				},
			],
			displayedOnion: {
				id: 'onion-1',
				type: 'TheOnion',
				q: 0,
				r: 0,
				status: 'operational',
				treads: 33,
				movesAllowed: 0,
				movesRemaining: 0,
				rams: 0,
				weapons: 'main: ready',
				weaponDetails: [
					{
						id: 'ap_1',
						name: 'AP Gun',
						friendlyName: 'AP Gun 1',
						attack: 1,
						range: 1,
						defense: 1,
						status: 'ready',
						individuallyTargetable: true,
						targetRules: { allowedTargetUnitTypes: ['LittlePigs'] },
					},
				],
			},
			selectedUnitIds: ['wolf-2', 'puss-1'],
			selectedAttackStrength: 2,
			selectedAttackGroupCount: 2,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [],
			},
		})

		expect(options.find((option) => option.id === 'onion-1:treads')).toMatchObject({
			isDisabled: true,
			disabledTitle: 'Select attackers from one defender stack to target treads.',
		})
	})
})
