import { describe, expect, it } from 'vitest'

import {
	evaluateDefenderCombatEligibility,
	evaluateOnionWeaponCombatEligibility,
	type DefenderCombatEligibilityInput,
	type OnionWeaponCombatEligibilityInput,
} from '#web/lib/actionEligibility/combat'
import { formatEligibilityReason } from '#web/lib/actionEligibility/reasons'
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

function createDefenderInput(overrides: Partial<DefenderCombatEligibilityInput> = {}): DefenderCombatEligibilityInput {
	return {
		unit: {
			role: 'defender',
			state: 'operational',
			weapons: [createWeapon({ id: 'defender-gun' })],
		},
		phase: 'DEFENDER_COMBAT',
		viewerRole: 'defender',
		targetOptions: [{ id: 'target-1' }],
		...overrides,
	}
}

function createOnionWeaponInput(overrides: Partial<OnionWeaponCombatEligibilityInput> = {}): OnionWeaponCombatEligibilityInput {
	return {
		owner: {
			role: 'onion',
			state: 'operational',
		},
		weapon: createWeapon(),
		phase: 'ONION_COMBAT',
		viewerRole: 'onion',
		targetOptions: [{ id: 'target-1' }],
		...overrides,
	}
}

describe('defender combat eligibility', () => {
	it('allows an operational defender with a usable attack and legal target', () => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput())).toEqual({ eligible: true })
	})

	it('rejects a defender whose attack has no legal target', () => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput({ targetOptions: [] }))).toEqual({
			eligible: false,
			reason: 'no-target-in-range',
		})
	})

	it('honors target options marked unavailable by existing rules', () => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput({
			targetOptions: [{ id: 'target-1', isUnavailable: true }],
	}))).toEqual({ eligible: false, reason: 'no-target-in-range' })

		expect(evaluateDefenderCombatEligibility(createDefenderInput({
			targetOptions: [{ id: 'target-1', isUnavailable: true }, { id: 'target-2' }],
	}))).toEqual({ eligible: true })
	})

	it('keeps a disabled target unit eligible when the target option is available', () => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput({
			targetOptions: [{ id: 'target-1', status: 'disabled' }],
		}))).toEqual({ eligible: true })
	})

	it('evaluates stack members independently', () => {
		const readyMember = createDefenderInput()
		const spentMember = createDefenderInput({ unit: { ...readyMember.unit, weapons: [createWeapon({ state: 'spent' })] } })

		expect(evaluateDefenderCombatEligibility(readyMember)).toEqual({ eligible: true })
		expect(evaluateDefenderCombatEligibility(spentMember)).toEqual({ eligible: false, reason: 'attacks-spent' })
	})

	it('distinguishes a weaponless defender from a defender whose attacks are spent', () => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput({ unit: { ...createDefenderInput().unit, weapons: [] } }))).toEqual({
			eligible: false,
			reason: 'no-attack-capabilities',
		})
		expect(evaluateDefenderCombatEligibility(createDefenderInput({ unit: { ...createDefenderInput().unit, weapons: [createWeapon({ state: 'spent' })] } }))).toEqual({
			eligible: false,
			reason: 'attacks-spent',
		})
	})

	it.each([
		['destroyed', 'destroyed'],
		['disabled', 'disabled'],
		['recovering', 'recovering'],
	] as const)('rejects a %s defender before checking attacks', (_label, state) => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput({ unit: { ...createDefenderInput().unit, state } }))).toEqual({
			eligible: false,
			reason: state,
		})
	})

	it('rejects a defender outside its combat phase or active side', () => {
		expect(evaluateDefenderCombatEligibility(createDefenderInput({ phase: 'ONION_COMBAT' }))).toEqual({
			eligible: false,
			reason: 'wrong-phase',
		})
		expect(evaluateDefenderCombatEligibility(createDefenderInput({ viewerRole: 'onion' }))).toEqual({
			eligible: false,
			reason: 'not-your-turn',
		})
	})
})

describe('Onion weapon combat eligibility', () => {
	it('allows a ready Onion weapon with a legal target', () => {
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput())).toEqual({ eligible: true })
	})

	it('evaluates multiple Onion weapons independently', () => {
		const readyWeapon = createOnionWeaponInput({ weapon: createWeapon({ id: 'main-1' }) })
		const spentWeapon = createOnionWeaponInput({ weapon: createWeapon({ id: 'main-2', state: 'spent' }) })

		expect(evaluateOnionWeaponCombatEligibility(readyWeapon)).toEqual({ eligible: true })
		expect(evaluateOnionWeaponCombatEligibility(spentWeapon)).toEqual({ eligible: false, reason: 'attacks-spent' })
	})

	it.each([
		['destroyed', createWeapon({ state: 'destroyed' }), 'destroyed'],
		['out of ammo', createWeapon({ ammo: 0 }), 'out-of-ammo'],
		['spent', createWeapon({ state: 'spent' }), 'attacks-spent'],
	] as const)('reports a %s weapon as unavailable', (_label, weapon, reason) => {
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({ weapon }))).toEqual({
			eligible: false,
			reason,
		})
	})

	it('rejects an otherwise ready weapon without a legal target', () => {
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({ targetOptions: [] }))).toEqual({
			eligible: false,
			reason: 'no-target-in-range',
		})
	})

	it('honors target options marked unavailable by existing rules', () => {
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({
			targetOptions: [{ id: 'target-1', isUnavailable: true }],
	}))).toEqual({ eligible: false, reason: 'no-target-in-range' })

		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({
			targetOptions: [{ id: 'target-1', isUnavailable: true }, { id: 'target-2' }],
	}))).toEqual({ eligible: true })
	})

	it('rejects an Onion weapon outside its combat phase or active side', () => {
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({ phase: 'DEFENDER_COMBAT' }))).toEqual({
			eligible: false,
			reason: 'wrong-phase',
		})
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({ viewerRole: 'defender' }))).toEqual({
			eligible: false,
			reason: 'not-your-turn',
		})
	})

	it('applies owner state before weapon availability', () => {
		expect(evaluateOnionWeaponCombatEligibility(createOnionWeaponInput({
			owner: { role: 'onion', state: 'disabled' },
			weapon: createWeapon({ ammo: 0 }),
		}))).toEqual({ eligible: false, reason: 'disabled' })
	})
})

describe('eligibility reason presentation', () => {
	it.each([
		['attacks-spent', 'Fired this turn'],
		['no-attack-capabilities', 'No attack capabilities'],
		['no-target-in-range', 'Out of range'],
	] as const)('formats %s through the shared presentation mapping', (reason, label) => {
		expect(formatEligibilityReason(reason)).toBe(label)
	})
})