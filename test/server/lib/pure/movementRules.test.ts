import { describe, expect, it } from 'vitest'

import {
	canStopOnOccupiedHex,
	canTraverseOccupiedHex,
	getTerrainMoveCost,
	type MoveOccupant,
} from '#shared/movementRules'

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

describe('movementRules', () => {
	it('derives ridgeline movement cost from shared terrain rules', () => {
		expect(getTerrainMoveCost('Puss', 'ridgeline')).toBeNull()
		expect(getTerrainMoveCost('LittlePigs', 'ridgeline')).toBe(2)
		expect(getTerrainMoveCost('TheOnion', 'ridgeline')).toBe(2)
	})

	it('treats crater terrain as impassable', () => {
		expect(getTerrainMoveCost('Puss', 'crater')).toBeNull()
		expect(getTerrainMoveCost('TheOnion', 'crater')).toBeNull()
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
				occupants: [occupant({ unitType: 'LittlePigs', squads: 1 })],
				incomingSquads: 2,
			}),
		).toBe(true)

		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [occupant({ unitType: 'LittlePigs', squads: 2 })],
				incomingSquads: 2,
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