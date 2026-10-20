import { describe, expect, it } from 'vitest'

import { evaluateMovementEligibility, type MovementEligibilityInput } from '#web/lib/actionEligibility/movement'

type MovementTestUnit = MovementEligibilityInput['unit'] & {
	immobile?: boolean
	movesAllowed?: number
}

type MovementTestInput = Omit<MovementEligibilityInput, 'unit'> & {
	unit: MovementTestUnit
}

function createInput(overrides: Partial<MovementTestInput> = {}): MovementTestInput {
	return {
		unit: {
			role: 'defender',
			state: 'operational',
			movesRemaining: 2,
			immobile: false,
			movesAllowed: 3,
		},
		phase: 'DEFENDER_MOVE',
		viewerRole: 'defender',
		...overrides,
	}
}

describe('movement action eligibility', () => {
	it.each([
		['Onion movement', createInput({ unit: { role: 'onion', state: 'operational', movesRemaining: 1 }, phase: 'ONION_MOVE', viewerRole: 'onion' })],
		['defender movement', createInput({ phase: 'DEFENDER_MOVE' })],
		['GEV secondary movement', createInput({ phase: 'GEV_SECOND_MOVE' })],
	] as const)('allows an active operational unit to move during %s', (_label, input) => {
		expect(evaluateMovementEligibility(input)).toEqual({ eligible: true })
	})

	it('keeps a partially spent unit eligible', () => {
		expect(evaluateMovementEligibility(createInput({ unit: { role: 'defender', state: 'operational', movesRemaining: 1 } }))).toEqual({ eligible: true })
	})

	it('rejects a unit with no movement remaining even when its base allowance is positive', () => {
		expect(evaluateMovementEligibility(createInput({ unit: { role: 'defender', state: 'operational', movesRemaining: 0, immobile: false, movesAllowed: 3 } }))).toEqual({
			eligible: false,
			reason: 'no-movement-remaining',
		})
	})

	it('rejects an immobile unit even when its movement projection has allowance', () => {
		expect(evaluateMovementEligibility(createInput({
			unit: { role: 'defender', state: 'operational', movesRemaining: 2, immobile: true, movesAllowed: 3 },
		}))).toEqual({
			eligible: false,
			reason: 'no-movement-remaining',
		})
	})

	it.each([
		['destroyed', 'destroyed'],
		['disabled', 'disabled'],
		['recovering', 'recovering'],
	] as const)('reports a %s unit as ineligible', (_label, state) => {
		expect(evaluateMovementEligibility(createInput({ unit: { role: 'defender', state, movesRemaining: 2 } }))).toEqual({
			eligible: false,
			reason: state,
		})
	})

	it('rejects a unit when the viewer is not the active side', () => {
		expect(evaluateMovementEligibility(createInput({ viewerRole: 'onion' }))).toEqual({
			eligible: false,
			reason: 'not-your-turn',
		})
	})

	it('rejects a unit whose role does not own the current movement phase', () => {
		expect(evaluateMovementEligibility(createInput({
			unit: { role: 'onion', state: 'operational', movesRemaining: 2 },
		}))).toEqual({
			eligible: false,
			reason: 'not-your-turn',
		})
	})

	it.each([
		['combat', 'DEFENDER_COMBAT' as const],
		['no phase', null],
	] as const)('rejects movement eligibility during %s', (_label, phase) => {
		expect(evaluateMovementEligibility(createInput({ phase }))).toEqual({
			eligible: false,
			reason: 'wrong-phase',
		})
	})
})