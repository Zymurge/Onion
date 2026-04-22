import { describe, expect, it } from 'vitest'

import {
	canStopOnOccupiedHex,
	canTraverseOccupiedHex,
	getTerrainMoveCost,
	getStopOnOccupiedHexFailure,
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
			occupants: [{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs', squads: 3 }],
			incomingSquads: 3,
		})).toBe('stack-limit')
	})

	it('returns null for Little Pigs stacking within limit', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs', squads: 3 }],
			incomingSquads: 2,
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
				occupants: [occupant({ unitType: 'LittlePigs', squads: 3 })],
				incomingSquads: 2,
			}),
		).toBe(true)

		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [occupant({ unitType: 'LittlePigs', squads: 3 })],
				incomingSquads: 3,
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
