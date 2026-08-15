import { describe, expect, it } from 'vitest'
import { createMap, type GameMap } from '#server/engine/map'
import { executeUnitMovement, validateUnitMovement } from '#server/engine/movement'
import { validateCombatAction, executeCombatAction } from '#server/engine/combat'
import { advancePhase } from '#server/engine/phases'
import { InitialStateSchema } from '#server/engine/scenarioSchema'
import { normalizeInitialStateToGameState } from '#server/engine/scenarioNormalizer'
import { makeMixedSideInitialState } from '#test/utils/mixedSideScenario'

const CLEAR_MAP: GameMap = createMap(5, 5, [])

function makeMixedSideState() {
	return normalizeInitialStateToGameState(InitialStateSchema.parse(makeMixedSideInitialState()))
}

describe('mixed-side scenario engine behavior', () => {
	it('moves a defender-shaped unit assigned to the Onion side during Onion Movement', () => {
		const state = makeMixedSideState()
		const validation = validateUnitMovement(CLEAR_MAP, state, {
			type: 'MOVE',
			unitId: 'onion-puss',
			to: { q: 1, r: 0 },
		})

		expect(validation.ok).toBe(true)
		if (!validation.ok) return

		const result = executeUnitMovement(state, validation.plan)

		expect(result.success).toBe(true)
		expect(state.onions['onion-puss'].position).toEqual({ q: 1, r: 0 })
		expect(state.defenders['defender-onion'].position).toEqual({ q: 2, r: 0 })
	})

	it('allows a defender-shaped unit assigned to the Onion side to attack', () => {
		const state = makeMixedSideState()
		state.currentPhase = 'ONION_COMBAT'
		const validation = validateCombatAction(CLEAR_MAP, state, {
			type: 'FIRE',
			attackers: ['main'],
			targetId: 'defender-onion',
			onionId: 'onion-puss',
		})

		expect(validation.ok).toBe(true)
		if (!validation.ok) return

		const result = executeCombatAction(state, validation.plan, 1)

		expect(result.success).toBe(true)
		expect(result.attackerIds).toEqual(['main'])
		expect(result.targetId).toBe('defender-onion')
		expect(state.onions['onion-puss'].weapons.find((weapon) => weapon.id === 'main')?.state).toBe('spent')
	})

	it('applies phase-entry effects to units according to their side collections', () => {
		const state = makeMixedSideState()
		const onionSideUnit = state.onions['onion-puss']
		const defenderSideUnit = state.defenders['defender-onion']
		const onionWeapon = onionSideUnit.weapons.find((weapon) => weapon.state === 'ready')
		if (onionWeapon === undefined) throw new Error('Mixed-side fixture needs a ready Onion-side weapon')

		onionWeapon.state = 'spent'
		defenderSideUnit.state = 'disabled'
		state.currentPhase = 'GEV_SECOND_MOVE'

		advancePhase(state)

		expect(state.currentPhase).toBe('ONION_MOVE')
		expect(onionWeapon.state).toBe('ready')
		expect(defenderSideUnit.state).toBe('recovering')

		state.currentPhase = 'ONION_COMBAT'
		advancePhase(state)

		expect(state.currentPhase).toBe('DEFENDER_MOVE')
		expect(defenderSideUnit.state).toBe('operational')
	})
})
