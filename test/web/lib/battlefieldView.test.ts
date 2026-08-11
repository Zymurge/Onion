import { describe, expect, it } from 'vitest'

import { buildBattlefieldDefenderView } from '#web/lib/appViewHelpers'
import { isUnitMoveEligible, statusTone, type BattlefieldDefenderView, type BattlefieldOnionView } from '#web/lib/battlefieldView'
import { makeDefender, makeOnion, makeWeapon } from '#test/utils/gameStateUtils'

describe('battlefieldView helpers', () => {
	it('classifies status tones', () => {
		expect(statusTone('operational')).toBe('ready')
		expect(statusTone('disabled')).toBe('dim')
		expect(statusTone('recovering')).toBe('recovering')
		expect(statusTone('destroyed')).toBe('destroyed')
	})

	it('checks move eligibility for onion and defender views', () => {
		const onion: BattlefieldOnionView = {
			...makeOnion({ unitId: 'onion-1', typeId: 'TheOnion', position: { q: 0, r: 0 } }),
			movesAllowed: 3,
			movesRemaining: 2,
		}
		const defender: BattlefieldDefenderView = {
			...makeDefender({
				unitId: 'wolf-2',
				typeId: 'BigBadWolf',
				position: { q: 3, r: 6 },
				weapons: [makeWeapon({ id: 'wolf-2-main', typeId: 'BigBadWolf.main' })],
			}),
			movesRemaining: 4,
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

	it('uses canonical unit state in battlefield projections', () => {
		const view = buildBattlefieldDefenderView(makeDefender({
			unitId: 'wolf-2',
			typeId: 'BigBadWolf',
			position: { q: 3, r: 6 },
		}))

		expect(view.unitId).toBe('wolf-2')
		expect(view.typeId).toBe('BigBadWolf')
		expect(view.state).toBe('operational')
		expect(view.position).toEqual({ q: 3, r: 6 })
		expect(view).not.toHaveProperty('id')
		expect(view).not.toHaveProperty('type')
		expect(view).not.toHaveProperty('status')
		expect(view).not.toHaveProperty('move')
	})

	it('keeps defender coordinates under position only', () => {
		const view = buildBattlefieldDefenderView(makeDefender({ position: { q: 3, r: 6 } }))

		expect(view.position).toEqual({ q: 3, r: 6 })
		expect(view).not.toHaveProperty('q')
		expect(view).not.toHaveProperty('r')
	})
})