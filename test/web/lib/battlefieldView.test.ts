import { describe, expect, it } from 'vitest'

import { isUnitMoveEligible, statusTone, type BattlefieldOnionView, type BattlefieldUnit, unitCode } from '#web/lib/battlefieldView'

describe('battlefieldView helpers', () => {
	it('classifies unit codes and status tones', () => {
		expect(unitCode('TheOnion')).toBe('ON')
		expect(unitCode('BigBadWolf')).toBe('BW')
		expect(unitCode('LittlePigs')).toBe('LP')
		expect(unitCode('Puss')).toBe('PU')
		expect(unitCode('Witch')).toBe('WI')
		expect(unitCode('Swamp')).toBe('SW')
		expect(unitCode('Unknown')).toBe('??')

		expect(statusTone('operational')).toBe('ready')
		expect(statusTone('disabled')).toBe('dim')
		expect(statusTone('recovering')).toBe('recovering')
		expect(statusTone('destroyed')).toBe('destroyed')
		expect(statusTone('queued')).toBeUndefined()
	})

	it('checks move eligibility for onion and defender views', () => {
		const onion: BattlefieldOnionView = {
			id: 'onion-1',
			type: 'TheOnion',
			q: 0,
			r: 0,
			status: 'operational',
			treads: 33,
			movesAllowed: 3,
			movesRemaining: 2,
			rams: 0,
			weapons: 'main: ready',
		}
		const defender: BattlefieldUnit = {
			id: 'wolf-2',
			type: 'BigBadWolf',
			status: 'operational',
			q: 3,
			r: 6,
			move: 4,
			weapons: 'main: ready',
			attack: '4',
			actionableModes: ['fire', 'combined'],
		}

		expect(isUnitMoveEligible(onion, 'ONION_MOVE', 'onion')).toBe(true)
		expect(isUnitMoveEligible(onion, 'DEFENDER_COMBAT', 'onion')).toBe(false)
		expect(isUnitMoveEligible({ ...onion, status: 'destroyed' }, 'ONION_MOVE', 'onion')).toBe(false)
		expect(isUnitMoveEligible({ ...onion, movesRemaining: 0 }, 'ONION_MOVE', 'onion')).toBe(false)
		expect(isUnitMoveEligible(defender, 'DEFENDER_MOVE', 'defender')).toBe(true)
		expect(isUnitMoveEligible({ ...defender, status: 'disabled' }, 'DEFENDER_MOVE', 'defender')).toBe(false)
		expect(isUnitMoveEligible({ ...defender, move: 0 }, 'DEFENDER_MOVE', 'defender')).toBe(false)
		expect(isUnitMoveEligible(defender, 'GEV_SECOND_MOVE', 'defender')).toBe(true)
		expect(isUnitMoveEligible(defender, null, 'defender')).toBe(false)
	})
})