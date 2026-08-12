import { describe, expect, it } from 'vitest'

import { isUnitMoveEligible, statusTone, type BattlefieldOnionView, type BattlefieldUnit } from '#web/lib/battlefieldView'

describe('battlefieldView helpers', () => {
	it('classifies status tones', () => {
		expect(statusTone('operational')).toBe('ready')
		expect(statusTone('disabled')).toBe('dim')
		expect(statusTone('recovering')).toBe('recovering')
		expect(statusTone('destroyed')).toBe('destroyed')
	})

	it('checks move eligibility for onion and defender views', () => {
		const onion: BattlefieldOnionView = {
			unitId: 'onion-1',
			typeId: 'TheOnion',
			role: 'onion',
			position: { q: 0, r: 0 },
			state: 'operational',
			treads: 33,
			ramsRemaining: 0,
			movesAllowed: 3,
			movesRemaining: 2,
			weapons: [],
		}
		const defender: BattlefieldUnit = {
			unitId: 'wolf-2',
			typeId: 'BigBadWolf',
			role: 'defender',
			state: 'operational',
			position: { q: 3, r: 6 },
			weapons: [],
			movesRemaining: 4,
			stackSize: 1,
			actionableModes: ['fire', 'combined'],
		}

		expect(isUnitMoveEligible(onion, 'ONION_MOVE', 'onion')).toBe(true)
		expect(isUnitMoveEligible(onion, 'DEFENDER_COMBAT', 'onion')).toBe(false)
		expect(isUnitMoveEligible({ ...onion, state: 'destroyed' }, 'ONION_MOVE', 'onion')).toBe(false)
		expect(isUnitMoveEligible({ ...onion, movesRemaining: 0 }, 'ONION_MOVE', 'onion')).toBe(false)
		expect(isUnitMoveEligible(defender, 'DEFENDER_MOVE', 'defender')).toBe(true)
		expect(isUnitMoveEligible({ ...defender, state: 'disabled' }, 'DEFENDER_MOVE', 'defender')).toBe(false)
		expect(isUnitMoveEligible({ ...defender, movesRemaining: 0 }, 'DEFENDER_MOVE', 'defender')).toBe(false)
		expect(isUnitMoveEligible(defender, 'GEV_SECOND_MOVE', 'defender')).toBe(true)
		expect(isUnitMoveEligible(defender, null, 'defender')).toBe(false)
	})
})