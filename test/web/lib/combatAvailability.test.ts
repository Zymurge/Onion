import { describe, expect, it } from 'vitest'

import { getCombatUnitAvailabilityReason, getCombatWeaponAvailabilityReason } from '#web/lib/combatAvailability'
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

describe('combat availability', () => {
	it.each([
		['destroyed weapon', createWeapon({ state: 'destroyed' }), 'Destroyed'],
		['spent weapon', createWeapon({ state: 'spent' }), 'Fired this turn'],
		['empty weapon', createWeapon({ ammo: 0 }), 'Out of ammo'],
	] as const)('explains an unavailable %s', (_label, weapon, reason) => {
		expect(getCombatWeaponAvailabilityReason(weapon, 'operational', true)).toBe(reason)
	})

	it('explains when a ready weapon has no legal target', () => {
		expect(getCombatWeaponAvailabilityReason(createWeapon(), 'operational', true, false)).toBe('No targets in range')
	})

	it.each([
		['destroyed', { state: 'destroyed', actionableModes: ['fire'] }, 'Destroyed'],
		['disabled', { state: 'disabled', actionableModes: ['fire'] }, 'Disabled'],
		['recovering', { state: 'recovering', actionableModes: ['fire'] }, 'Recovering'],
		['spent', { state: 'operational', actionableModes: [] }, 'Fired this turn'],
	] as const)('explains an unavailable %s defender', (_label, unit, reason) => {
		expect(getCombatUnitAvailabilityReason(unit, true)).toBe(reason)
	})

	it('explains when a ready defender is out of range', () => {
		expect(getCombatUnitAvailabilityReason({ state: 'operational', actionableModes: ['fire'] }, true, false)).toBe('Out of range')
	})
})
