import { describe, expect, it } from 'vitest'

import type { TerrainType } from '../engine/map.js'
import { getAllUnitDefinitions } from '../engine/units.js'
import {
	createCombatCalculator,
	type CombatCalculatorInput,
	type CombatStaticRules,
} from './combatCalculator.js'

const staticRules = {
	unitDefinitions: getAllUnitDefinitions(),
	terrainRules: {
		clear: { terrainType: 'clear' as TerrainType },
		ridgeline: { terrainType: 'ridgeline' as TerrainType, defenseBonus: 1 },
		crater: { terrainType: 'crater' as TerrainType },
	},
} satisfies CombatStaticRules

const calculator = createCombatCalculator(staticRules)

describe('combatCalculator', () => {
	it('sums attacker group ids and resolves defense from static unit data', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1', 'attack-2'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Puss' },
					'attack-2': { type: 'Puss' },
					'target-1': { type: 'LittlePigs', squads: 2, terrainType: 'ridgeline' },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(8)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('2:1')
	})

	it('returns the ridgeline defense modifier for valid target units', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Puss' },
					'target-1': { type: 'Puss', terrainType: 'ridgeline' },
				},
			},
		}

		const modifiers = calculator.calculateModifiers(input)

		expect(modifiers).toEqual([
			{
				kind: 'terrain',
				scope: 'defense',
				label: 'Ridgeline cover: +1 defense',
				value: 1,
				appliesTo: 'target-1',
			},
		])
	})

	it('uses weapon defense for individually targeted Onion subsystems', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Puss' },
					'target-1': { type: 'TheOnion', weaponId: 'secondary_1' },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(4)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('1:1')
	})

	it('defaults to ready weapons when attacker weapon ids are not supplied', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Dragon' },
					'target-1': { type: 'Puss' },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(12)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('4:1')
	})
})
