import { describe, expect, it } from 'vitest'
import { makeBattlefieldDefender } from '#test/utils/gameStateUtils'
import { buildBattlefieldRosterProjection } from '#web/lib/battlefieldGroupProjection'

describe('battlefieldGroupProjection', () => {
	it('projects canonical battlefield defenders into shared roster groups', () => {
		const defenders = [
			makeBattlefieldDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 4, r: 4 } }),
			makeBattlefieldDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 4, r: 4 } }),
			makeBattlefieldDefender({ unitId: 'wolf-1', typeId: 'BigBadWolf', position: { q: 5, r: 4 } }),
		]
		const stackRoster = {
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'Little Pigs group 1',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}

		const projection = buildBattlefieldRosterProjection(defenders, stackRoster)

		expect(projection.index.getUnitGroup('pigs-1')?.unitIds).toEqual(['pigs-1', 'pigs-2'])
		expect(projection.index.getUnitGroup('wolf-1')).toBeNull()
		expect(projection.index.groupsById['LittlePigs:4,4']?.units.map((unit) => unit.unitId)).toEqual(['pigs-1', 'pigs-2'])
		expect(projection.defendersById.get('pigs-2')).toBe(defenders[1])
	})
})
