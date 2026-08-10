import { describe, expect, it } from 'vitest'

import type { TerrainType } from '#shared/engineTypes'
import { getUnitTypeCatalog } from '#shared/unitDefinitions'
import {
	createCombatCalculator,
	type CombatCalculatorInput,
	type CombatStaticRules,
} from '#shared/combatCalculator'

const staticRules = {
	unitTypes: getUnitTypeCatalog(),
	terrainRules: {
		clear: { terrainType: 'clear' as TerrainType },
		ridgeline: { terrainType: 'ridgeline' as TerrainType, defenseBonus: 1 },
		crater: { terrainType: 'crater' as TerrainType },
	},
} satisfies CombatStaticRules

const calculator = createCombatCalculator(staticRules)

const terrainAdeptRules = {
	unitTypes: {
		...getUnitTypeCatalog(),
		Puss: {
			...getUnitTypeCatalog().Puss,
			abilities: {
				...getUnitTypeCatalog().Puss.abilities,
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
					'attack-1': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 1' },
					'target-1': { typeId: 'Puss', friendlyName: 'Little Pigs 1' },
				},
			},
		}

		expect(input.combatState.units['attack-1'].friendlyName).toBe('Big Bad Wolf 1')
		expect(input.combatState.units['target-1'].friendlyName).toBe('Little Pigs 1')
		expect(calculator.calculateOdds(input)).toBe('1:1')
		expect(calculator.calculateResult(input).attackStrength).toBe(4)
	})

	it('sums attacker group ids and resolves defense from static unit data', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1', 'attack-2'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 1' },
					'attack-2': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 2' },
					'target-1': { typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', squads: 2, terrainType: 'ridgeline' },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(8)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('2:1')
	})

	it('uses Little Pigs stack size for defense strength', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': { typeId: 'LittlePigs', squads: 2 },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.defenseStrength).toBe(2)
		expect(result.odds).toBe('2:1')
	})

	it('returns the ridgeline defense modifier for eligible target units', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 1' },
					'target-1': { typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', squads: 3, terrainType: 'ridgeline' },
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
		expect(input.combatState.units['target-1'].friendlyName).toBe('Little Pigs 1')
	})

	it('does not grant ridgeline cover to units without the terrain ability', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': { typeId: 'Puss', terrainType: 'ridgeline' },
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
					'attack-1': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 1' },
					'target-1': { typeId: 'TheOnion', friendlyName: 'The Onion 1', weaponId: 'secondary_1' },
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
					'attack-1': { typeId: 'Dragon' },
					'target-1': { typeId: 'Puss' },
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
						typeId: 'Dragon',
						weaponIds: ['main_1', 'main_2'],
						weapons: [
							{ id: 'main_1', typeId: 'Dragon.main_1', friendlyName: 'A', state: 'ready', ammo: 1 },
							{ id: 'main_2', typeId: 'Dragon.main_2', friendlyName: 'B', state: 'ready', ammo: 1 },
						],
					},
					'target-1': { typeId: 'Puss' },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(12)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('4:1')
	})

	it('prefers live weapon state when resolving Onion subsystem defense', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': {
						typeId: 'TheOnion',
						weaponId: 'secondary_1',
						weapons: [
							{ id: 'main', typeId: 'TheOnion.main', friendlyName: 'Main Weapon', weaponClass: 'main', state: 'ready', ammo: 1 },
							{ id: 'secondary_1', typeId: 'TheOnion.secondary_1', friendlyName: 'Secondary Weapon 1', weaponClass: 'secondary', state: 'ready', ammo: 1 },
						],
					},
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(4)
		expect(result.defenseStrength).toBe(3)
		expect(result.odds).toBe('1:1')
	})

	it('treats Onion targets without a weapon id as tread attacks at 1:1 odds', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': {
						typeId: 'TheOnion',
						weapons: [
							{ id: 'main', typeId: 'TheOnion.main', friendlyName: 'Main Weapon', weaponClass: 'main', state: 'ready', ammo: 1 },
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

	it('throws when a Little Pigs target is missing squads in live combat state', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': { typeId: 'LittlePigs' },
				},
			},
		}

		expect(() => calculator.calculateResult(input)).toThrow("Stack target 'target-1' of type 'LittlePigs' is missing squads in the live combat state")
	})

	it('uses terrain-eligible live combat state when calculating ridgeline cover', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': { typeId: 'Puss', terrainType: 'ridgeline' },
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
