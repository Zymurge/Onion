import { describe, expect, it } from 'vitest'

import {
	canStopOnOccupiedHex,
	canTraverseOccupiedHex,
	getTerrainMoveCost,
	getStopOnOccupiedHexFailure,
	type MoveOccupant,
} from '#shared/movementRules'
import { GLOBAL_RULES_CONTEXT, type RulesContext } from '#shared/rulesContext'
import type { UnitClassRule } from '#shared/types'

function occupant(overrides: Partial<MoveOccupant> = {}): MoveOccupant {
	return {
		q: 0,
		r: 0,
		role: 'defender',
		unitType: 'Puss',
		squads: 1,
		...overrides,
	}
}

describe('getStopOnOccupiedHexFailure', () => {
	it('returns null for empty hex', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'Puss',
			occupants: [],
		})).toBeNull()
	})

	it('returns occupied for non-stackable units', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'Puss',
			occupants: [{ q: 0, r: 0, role: 'defender', unitType: 'Puss' }],
		})).toBe('occupied')
	})

	it('returns stack-limit for Little Pigs over limit', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
			],
			incomingMembers: 1,
		})).toBe('stack-limit')
	})

	it('returns null for Little Pigs stacking within limit', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
			],
			incomingMembers: 1,
		})).toBeNull()
	})

	it('ignores legacy squads values when counting stack members', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs', squads: 99 }],
			incomingMembers: 1,
		})).toBeNull()
	})

	it('returns occupied-by-onion if Onion is present', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'Puss',
			occupants: [{ q: 0, r: 0, role: 'onion', unitType: 'TheOnion' }],
		})).toBe('occupied-by-onion')
	})
})

describe('movementRules', () => {
	it('derives ridgeline movement cost from shared terrain rules', () => {
		expect(getTerrainMoveCost('Puss', 'ridgeline')).toBeNull()
		expect(getTerrainMoveCost('LittlePigs', 'ridgeline')).toBe(1)
		expect(getTerrainMoveCost('TheOnion', 'ridgeline')).toBe(1)
	})

	it.each([
		{ unitType: 'LittlePigs', unitClass: 'Infantry' },
		{ unitType: 'Puss', unitClass: 'LightArmor' },
		{ unitType: 'Dragon', unitClass: 'HeavyArmor' },
		{ unitType: 'BigBadWolf', unitClass: 'GEV' },
		{ unitType: 'Swamp', unitClass: 'Command' },
		{ unitType: 'Farquaad', unitClass: 'Artillery' },
		{ unitType: 'TheOnion', unitClass: 'Onion' },
	])('treats crater terrain as impassable to $unitClass', ({ unitType }) => {
		expect(getTerrainMoveCost(unitType, 'crater')).toBeNull()
	})

	it.each([
		{ unitType: 'LittlePigs', unitClass: 'Infantry', cost: 1 },
		{ unitType: 'Puss', unitClass: 'LightArmor', cost: 2 },
		{ unitType: 'Dragon', unitClass: 'HeavyArmor', cost: 2 },
		{ unitType: 'BigBadWolf', unitClass: 'GEV', cost: 1 },
		{ unitType: 'Swamp', unitClass: 'Command', cost: 2 },
		{ unitType: 'Farquaad', unitClass: 'Artillery', cost: 2 },
		{ unitType: 'TheOnion', unitClass: 'Onion', cost: 2 },
	])('charges $cost MP to enter swamp for $unitClass', ({ unitType, cost }) => {
		expect(getTerrainMoveCost(unitType, 'swamp')).toBe(cost)
	})

	it('throws when a class terrain rule is missing', () => {
		const rules = {
			...GLOBAL_RULES_CONTEXT,
			getUnitClassRule(unitClass: Parameters<RulesContext['getUnitClassRule']>[0]) {
				return {
					...GLOBAL_RULES_CONTEXT.getUnitClassRule(unitClass),
					wholeHexTerrain: {} as UnitClassRule['wholeHexTerrain'],
				}
			},
		} satisfies RulesContext

		expect(() => getTerrainMoveCost('Puss', 'swamp', rules)).toThrow('Missing swamp terrain rule')
		expect(() => getTerrainMoveCost('Puss', 'clear', rules)).toThrow('Missing clear terrain rule')
	})

	it('allows defenders to traverse only friendly occupied hexes', () => {
		expect(canTraverseOccupiedHex('defender', [occupant({ role: 'defender' })])).toBe(true)
		expect(canTraverseOccupiedHex('defender', [occupant({ role: 'onion', unitType: 'TheOnion' })])).toBe(false)
	})

	it('allows the Onion to traverse only defender-occupied hexes', () => {
		expect(canTraverseOccupiedHex('onion', [occupant({ role: 'defender' })])).toBe(true)
		expect(canTraverseOccupiedHex('onion', [occupant({ role: 'onion', unitType: 'TheOnion' })])).toBe(false)
	})

	it('allows Little Pigs to stop on a shared stack up to the rule-defined limit', () => {
		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
				],
				incomingMembers: 1,
			}),
		).toBe(true)

		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
				],
				incomingMembers: 1,
			}),
		).toBe(false)
	})

	it('rejects mixed or non-Little-Pigs defender stacks', () => {
		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [occupant({ unitType: 'Dragon' })],
				incomingSquads: 1,
			}),
		).toBe(false)

		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'Puss',
				occupants: [occupant({ unitType: 'LittlePigs', squads: 1 })],
			}),
		).toBe(false)
	})
})
