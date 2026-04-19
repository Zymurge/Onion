import { describe, expect, it } from 'vitest'

import type { TerrainType } from '#shared/engineTypes'
import { getAllUnitDefinitions } from '#shared/unitDefinitions'
import {
	createCombatCalculator,
	type CombatCalculatorInput,
	type CombatStaticRules,
} from '#shared/combatCalculator'

const staticRules = {
	unitDefinitions: getAllUnitDefinitions(),
	terrainRules: {
		clear: { terrainType: 'clear' as TerrainType },
		ridgeline: { terrainType: 'ridgeline' as TerrainType, defenseBonus: 1 },
		crater: { terrainType: 'crater' as TerrainType },
	},
} satisfies CombatStaticRules

const calculator = createCombatCalculator(staticRules)

const terrainAdeptRules = {
	unitDefinitions: {
		...getAllUnitDefinitions(),
		Puss: {
			...getAllUnitDefinitions().Puss,
			abilities: {
				...getAllUnitDefinitions().Puss.abilities,
				terrainRules: {
					ridgeline: { canAccessCover: true },
					clear: { canAccessCover: true },
					crater: { canAccessCover: true },
				},
			},
		},
	},
	terrainRules: {
		clear: { terrainType: 'clear' as TerrainType, defenseBonus: 2 },
		ridgeline: { terrainType: 'ridgeline' as TerrainType, defenseBonus: 1 },
		crater: { terrainType: 'crater' as TerrainType, defenseBonus: 2 },
	},
} satisfies CombatStaticRules

const terrainAdeptCalculator = createCombatCalculator(terrainAdeptRules)

describe('combatCalculator', () => {
	it('exposes a working factory instance', () => {
		expect(calculator).toMatchObject({
			calculateOdds: expect.any(Function),
			calculateModifiers: expect.any(Function),
			calculateResult: expect.any(Function),
		})

		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Puss' },
					'target-1': { type: 'Puss' },
				},
			},
		}

		expect(calculator.calculateOdds(input)).toBe('1:1')
		expect(calculator.calculateResult(input).attackStrength).toBe(4)
	})

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

	it('returns the ridgeline defense modifier for eligible target units', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Puss' },
					'target-1': { type: 'LittlePigs', squads: 3, terrainType: 'ridgeline' },
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

	it('does not grant ridgeline cover to units without the terrain ability', () => {
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

		expect(calculator.calculateModifiers(input)).toEqual([])
		expect(calculator.calculateResult(input).defenseStrength).toBe(3)
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

	it('prefers live weapon state when calculating attacker strength', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': {
						type: 'Dragon',
						weaponIds: ['main_1', 'main_2'],
						weapons: [
							{ id: 'main_1', name: 'A', attack: 1, range: 3, defense: 3, status: 'ready', individuallyTargetable: false },
							{ id: 'main_2', name: 'B', attack: 2, range: 3, defense: 3, status: 'ready', individuallyTargetable: false },
						],
					},
					'target-1': { type: 'Puss' },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(3)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('1:1')
	})

	it('prefers live weapon state when resolving Onion subsystem defense', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { type: 'Puss' },
					'target-1': {
						type: 'TheOnion',
						weaponId: 'secondary_1',
						weapons: [
							{ id: 'main', name: 'Main Battery', attack: 4, range: 3, defense: 6, status: 'ready', individuallyTargetable: true },
							{ id: 'secondary_1', name: 'Secondary Battery 1', attack: 3, range: 2, defense: 4, status: 'ready', individuallyTargetable: true },
						],
					},
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(4)
		expect(result.defenseStrength).toBe(4)
		expect(result.odds).toBe('1:1')
	})

	it('uses terrain-eligible live combat state when calculating ridgeline cover', () => {
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

		expect(terrainAdeptCalculator.calculateModifiers(input)).toEqual([
			{
				kind: 'terrain',
				scope: 'defense',
				label: 'Ridgeline cover: +1 defense',
				value: 1,
				appliesTo: 'target-1',
			},
		])
		expect(terrainAdeptCalculator.calculateResult(input).attackStrength).toBe(4)
		expect(terrainAdeptCalculator.calculateResult(input).defenseStrength).toBe(4)
	})
})
