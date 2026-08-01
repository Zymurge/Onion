import { describe, expect, it } from 'vitest'

import { buildCombatTargetOptions as buildCombatTargetOptionsWithCatalog } from '#web/lib/combatPreview'
import type { StackRosterGroupState } from '#shared/types/index'
import {
	makeBattlefieldDefender,
	makeBattlefieldOnion,
	makeStackFixture,
	makeStackGroup,
	makeWeapon,
} from '#test/utils/gameStateUtils'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function buildCombatTargetOptions(input: Parameters<typeof buildCombatTargetOptionsWithCatalog>[0]) {
	return buildCombatTargetOptionsWithCatalog({ ...input, catalog: sessionCatalog })
}

function makeStackView(overrides: Partial<StackRosterGroupState> & Pick<StackRosterGroupState, 'position' | 'unitIds'>) {
	const stack = makeStackFixture({
		groups: {
			[`${overrides.unitType ?? 'LittlePigs'}:${overrides.position.q},${overrides.position.r}`]: makeStackGroup(overrides),
		},
	})

	return {
		stackRoster: stack.stackRoster,
		stackNaming: stack.stackNaming,
	}
}

describe('buildCombatTargetOptions', () => {
	it('builds shared combat preview data for ridgeline targets', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['3,2']),
			displayedDefenders: [
				makeBattlefieldDefender({
					unitId: 'near-1',
					typeId: 'LittlePigs',
					position: { q: 3, r: 2 },
				}),
			],
			displayedOnion: makeBattlefieldOnion({
			position: { q: 0, r: 1 },
			weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main' })],
		}),
			...makeStackView({
				unitType: 'LittlePigs',
				position: { q: 3, r: 2 },
				unitIds: ['near-1'],
			}),
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
				label: 'Little Pigs group 1',
				defense: 2,
				modifiers: expect.arrayContaining(['Ridgeline cover: +1 defense']),
			})
	})

	it('collapses stacked Pigs targets into one canonical group card', () => {

		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['3,2']),
			displayedDefenders: [
				makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 3, r: 2 } }),
				makeBattlefieldDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 3, r: 2 } }),
			],
			displayedOnion: makeBattlefieldOnion({
			position: { q: 0, r: 1 },
			weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main' })],
		}),
			...makeStackView({
				unitType: 'LittlePigs',
				position: { q: 3, r: 2 },
				unitIds: ['pigs-1', 'pigs-2'],
			}),
			selectedUnitIds: ['weapon:main-1'],
			selectedAttackStrength: 4,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [{ q: 3, r: 2, t: 0 }],
			},
		})

		expect(options).toHaveLength(1)
		expect(options[0]).toMatchObject({
			id: 'pigs-1',
			label: 'Little Pigs group 1',
			defense: 2,
		})
	})

	it('throws when stacked defenders are missing canonical roster data', () => {
		expect(() => buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['3,2']),
			displayedDefenders: [
				makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 3, r: 2 } }),
				makeBattlefieldDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 3, r: 2 } }),
			],
			displayedOnion: makeBattlefieldOnion({ position: { q: 0, r: 1 }, weapons: [] }),
			selectedUnitIds: ['weapon:main-1'],
			selectedAttackStrength: 4,
			selectedAttackGroupCount: 1,
			displayedScenarioMap: {
				width: 8,
				height: 8,
				hexes: [{ q: 3, r: 2, t: 0 }],
			},
		})).toThrow('Missing stackRoster for grouped defenders')
	})

	it('filters AP targets to infantry only', () => {
		const options = buildCombatTargetOptions({
			activeCombatRole: 'onion',
			combatRangeHexKeys: new Set(['1,0', '1,1', '2,1']),
			displayedDefenders: [
				makeBattlefieldDefender({ unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 1, r: 0 } }),
				makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 1, r: 1 } }),
			],
			displayedOnion: makeBattlefieldOnion({
			weapons: [makeWeapon({ id: 'ap_1', typeId: 'TheOnion.ap_1' })],
		}),
			...makeStackView({ unitType: 'LittlePigs', position: { q: 1, r: 1 }, unitIds: ['pigs-1'] }),
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
				makeBattlefieldDefender({ unitId: 'swamp-1', typeId: 'Swamp', position: { q: 1, r: 1 }, weapons: [] }),
			],
			displayedOnion: makeBattlefieldOnion({
			weapons: [makeWeapon({ id: 'main-1', typeId: 'TheOnion.main' })],
		}),
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
				makeBattlefieldDefender(
					{ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 1, r: 1 } },
					{ targetRules: { allowedAttackerUnitTypes: ['BigBadWolf'] } },
				),
			],
			displayedOnion: makeBattlefieldOnion({
			weapons: [makeWeapon({ id: 'ap_1', typeId: 'TheOnion.ap_1' })],
		}),
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
				makeBattlefieldDefender(
					{ unitId: 'wolf-2', typeId: 'BigBadWolf', position: { q: 1, r: 1 } },
					{ move: 4 },
				),
			],
			displayedOnion: makeBattlefieldOnion({
				weapons: [makeWeapon({ id: 'ap_1', typeId: 'TheOnion.ap_1' })],
			}),
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
				makeBattlefieldDefender(
					{ unitId: 'wolf-2', typeId: 'BigBadWolf', position: { q: 1, r: 1 } },
					{ move: 4 },
				),
				makeBattlefieldDefender(
					{ unitId: 'puss-1', typeId: 'Puss', position: { q: 2, r: 1 } },
					{ move: 4 },
				),
			],
			displayedOnion: makeBattlefieldOnion(),
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
