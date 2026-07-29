import { describe, expect, it } from 'vitest'

import { canUnitCrossRidgelines, canUnitSecondMove, getRemainingUnitMovementAllowance, getUnitMovementAllowance, getUnitRamCapacity, isUnitImmobile, spendUnitMovement } from '#shared/unitMovement'

describe('unit movement helpers', () => {
	it('returns Onion movement allowance by tread band during the movement phase', () => {
		expect(getUnitMovementAllowance('TheOnion', 'ONION_MOVE', 0)).toBe(0)
		expect(getUnitMovementAllowance('TheOnion', 'ONION_MOVE', 15)).toBe(1)
		expect(getUnitMovementAllowance('TheOnion', 'ONION_MOVE', 16)).toBe(2)
		expect(getUnitMovementAllowance('TheOnion', 'ONION_MOVE', 31)).toBe(3)
	})

	it('returns 0 for Onion outside the movement phase', () => {
		expect(getUnitMovementAllowance('TheOnion', 'ONION_COMBAT', 45)).toBe(0)
	})

	it('returns defender movement allowance during defender movement', () => {
		expect(getUnitMovementAllowance('Puss', 'DEFENDER_MOVE')).toBe(3)
		expect(getUnitMovementAllowance('Witch', 'DEFENDER_MOVE')).toBe(2)
		expect(getUnitMovementAllowance('Dragon', 'DEFENDER_MOVE')).toBe(5)
	})

	it('returns GEV second-move allowance only during the second move phase', () => {
		expect(getUnitMovementAllowance('BigBadWolf', 'DEFENDER_MOVE')).toBe(4)
		expect(getUnitMovementAllowance('BigBadWolf', 'GEV_SECOND_MOVE')).toBe(3)
		expect(getUnitMovementAllowance('Puss', 'GEV_SECOND_MOVE')).toBe(0)
		expect(canUnitSecondMove('BigBadWolf')).toBe(true)
		expect(canUnitSecondMove('Puss')).toBe(false)
	})

	it('reports the ridge-crossing capability and immobility per unit type', () => {
		expect(canUnitCrossRidgelines('TheOnion')).toBe(true)
		expect(canUnitCrossRidgelines('LittlePigs')).toBe(true)
		expect(canUnitCrossRidgelines('Puss')).toBe(false)
		expect(getUnitRamCapacity('TheOnion')).toBe(2)
		expect(isUnitImmobile('LordFarquaad')).toBe(true)
		expect(isUnitImmobile('Puss')).toBe(false)
	})

	it('tracks remaining movement after spending hexes in the current phase', () => {
		const unit = { unitId: 'wolf-2', typeId: 'Puss', movementSpent: {} }

		expect(getRemainingUnitMovementAllowance(unit, 'DEFENDER_MOVE')).toBe(3)
		spendUnitMovement(unit, 'DEFENDER_MOVE', 1)
		expect(getRemainingUnitMovementAllowance(unit, 'DEFENDER_MOVE')).toBe(2)
		spendUnitMovement(unit, 'DEFENDER_MOVE', 2)
		expect(getRemainingUnitMovementAllowance(unit, 'DEFENDER_MOVE')).toBe(0)
	})

	it('keeps GEV second move separate from defender move spending', () => {
		const unit = { unitId: 'wolf-2', typeId: 'BigBadWolf', movementSpent: {} }

		spendUnitMovement(unit, 'DEFENDER_MOVE', 3)
		expect(getRemainingUnitMovementAllowance(unit, 'GEV_SECOND_MOVE')).toBe(3)
	})
})
