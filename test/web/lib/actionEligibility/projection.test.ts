import { describe, expect, it } from 'vitest'

import {
	buildBattlefieldActionEligibility,
	type BattlefieldActionEligibilityInput,
} from '#web/lib/actionEligibility/projection'
import type { Weapon } from '#shared/types/index'

function createWeapon(overrides: Partial<Weapon> = {}): Weapon {
	return {
		id: 'main-1',
		typeId: 'TheOnion.main',
		weaponClass: 'main',
		state: 'ready',
		friendlyName: 'Main gun',
		...overrides,
	}
}

function createInput(overrides: Partial<BattlefieldActionEligibilityInput> = {}): BattlefieldActionEligibilityInput {
	return {
		phase: 'DEFENDER_COMBAT',
		viewerRole: 'defender',
		defenders: [
			{
				unitId: 'pigs-1',
				role: 'defender',
				state: 'operational',
				movesRemaining: 2,
				weapons: [createWeapon({ id: 'pigs-gun-1' })],
			},
			{
				unitId: 'pigs-2',
				role: 'defender',
				state: 'operational',
				movesRemaining: 0,
				weapons: [createWeapon({ id: 'pigs-gun-2', state: 'spent' })],
			},
		],
		onion: {
			unitId: 'onion-1',
			role: 'onion',
			state: 'operational',
			movesRemaining: 0,
			weapons: [
				createWeapon({ id: 'main-1' }),
				createWeapon({ id: 'main-2', state: 'spent' }),
			],
		},
		targetOptionsByDefenderId: {
			'pigs-1': [{ id: 'onion-1:treads', q: 3, r: 2, status: 'disabled' }],
			'pigs-2': [{ id: 'onion-1:treads', q: 3, r: 2 }],
		},
		targetOptionsByWeaponId: {
			'main-1': [
				{ id: 'pigs-1', q: 1, r: 1 },
				{ id: 'pigs-2', q: 2, r: 1, isUnavailable: true },
			],
			'main-2': [{ id: 'pigs-1', q: 1, r: 1 }],
		},
		...overrides,
	}
}

describe('battlefield action eligibility projection', () => {
	it('projects movement eligibility independently for every unit', () => {
		const result = buildBattlefieldActionEligibility(createInput({ phase: 'DEFENDER_MOVE' }))

		expect(result.movementByUnitId).toEqual({
			'pigs-1': { eligible: true },
			'pigs-2': { eligible: false, reason: 'no-movement-remaining' },
			'onion-1': { eligible: false, reason: 'not-your-turn' },
		})
	})

	it('projects defender combat eligibility and available target geometry per member', () => {
		const result = buildBattlefieldActionEligibility(createInput())

		expect(result.defenderCombatByUnitId['pigs-1']).toEqual({
			eligibility: { eligible: true },
			targetIds: ['onion-1:treads'],
			targetHexKeys: ['3,2'],
		})
		expect(result.defenderCombatByUnitId['pigs-2']).toEqual({
			eligibility: { eligible: false, reason: 'attacks-spent' },
			targetIds: ['onion-1:treads'],
			targetHexKeys: ['3,2'],
		})
	})

	it('projects Onion combat eligibility independently for each weapon', () => {
		const result = buildBattlefieldActionEligibility(createInput({ phase: 'ONION_COMBAT', viewerRole: 'onion' }))

		expect(result.onionCombatByWeaponId['main-1']).toEqual({
			eligibility: { eligible: true },
			targetIds: ['pigs-1'],
			targetHexKeys: ['1,1'],
		})
		expect(result.onionCombatByWeaponId['main-2']).toEqual({
			eligibility: { eligible: false, reason: 'attacks-spent' },
			targetIds: ['pigs-1'],
			targetHexKeys: ['1,1'],
		})
	})

	it('returns empty records outside the relevant combat or movement phase', () => {
		const result = buildBattlefieldActionEligibility(createInput({ phase: 'DEFENDER_RECOVERY' }))

		expect(Object.values(result.movementByUnitId)).toEqual([
			{ eligible: false, reason: 'wrong-phase' },
			{ eligible: false, reason: 'wrong-phase' },
			{ eligible: false, reason: 'wrong-phase' },
		])
		expect(Object.values(result.defenderCombatByUnitId).map((entry) => entry.eligibility)).toEqual([
			{ eligible: false, reason: 'wrong-phase' },
			{ eligible: false, reason: 'wrong-phase' },
		])
		expect(Object.values(result.onionCombatByWeaponId).map((entry) => entry.eligibility)).toEqual([
			{ eligible: false, reason: 'wrong-phase' },
			{ eligible: false, reason: 'wrong-phase' },
		])
	})
})