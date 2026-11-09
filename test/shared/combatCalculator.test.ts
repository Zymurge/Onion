import { describe, expect, it } from 'vitest'

import { getUnitTypeCatalog } from '#shared/unitDefinitions'
import {
	buildCombatExchangeInput,
	createCombatCalculator,
	type CombatCalculatorInput,
	type CombatExchangeTarget,
	type CombatStaticRules,
} from '#shared/combatCalculator'
import { combatParityFixtures } from '#test/utils/combatParityFixtures'

const staticRules = {
	unitTypes: getUnitTypeCatalog(),
} satisfies CombatStaticRules

const calculator = createCombatCalculator(staticRules)

describe('combatCalculator', () => {
	it('maps unit and selected-weapon sources into ordered attacker contributions', () => {
		const target: CombatExchangeTarget = {
			kind: 'stack',
			id: 'group-3',
			typeId: 'LittlePigs',
			size: 1,
		}

		expect(buildCombatExchangeInput({
			attackers: [
				{
					kind: 'unit',
					id: 'wolf-1',
					typeId: 'BigBadWolf',
					weapons: [
						{ id: 'rifle-1', typeId: 'BigBadWolf.rifle', weaponClass: 'main', friendlyName: 'Rifle 1', state: 'ready' },
						{ id: 'launcher-1', typeId: 'BigBadWolf.missile', weaponClass: 'missile', friendlyName: 'Missile 1', state: 'ready', ammo: 0 },
						{ id: 'rifle-2', typeId: 'BigBadWolf.rifle', weaponClass: 'main', friendlyName: 'Rifle 2', state: 'spent' },
					],
				},
				{
					kind: 'weapon',
					id: 'main-1',
					ownerTypeId: 'TheOnion',
					weaponTypeId: 'TheOnion.main',
				},
			],
			target,
		})).toEqual({
			attackers: [
				{ id: 'wolf-1', typeId: 'BigBadWolf', weaponTypeIds: ['BigBadWolf.rifle'] },
				{ id: 'main-1', typeId: 'TheOnion', weaponTypeIds: ['TheOnion.main'] },
			],
			target,
		})
	})

	const targetBranchCases: ReadonlyArray<{ label: string; target: CombatExchangeTarget }> = [
		{ label: 'unit', target: { kind: 'unit', id: 'puss-1', typeId: 'Puss' } },
		{ label: 'single-member stack', target: { kind: 'stack', id: 'group-4', typeId: 'LittlePigs', size: 1 } },
		{ label: 'Onion treads', target: { kind: 'onion-treads', id: 'onion-1:treads', typeId: 'TheOnion' } },
		{ label: 'Onion weapon', target: { kind: 'onion-weapon', id: 'main-1', typeId: 'TheOnion', weaponTypeId: 'TheOnion.main' } },
	]
	targetBranchCases.forEach(({ label, target }) => {
		it(`preserves the explicit ${label} target branch`, () => {
			expect(buildCombatExchangeInput({ attackers: [], target })).toEqual({
				attackers: [],
				target,
			})
		})
	})

	combatParityFixtures.forEach(({ name, input, expected }) => {
		it(`matches the shared parity contract for ${name}`, () => {
			const result = calculator.calculateResult(input)

			expect(result).toMatchObject(expected)
			expect(calculator.calculateCrtOddsBand(input)).toBe(result.odds)
			expect(calculator.calculateModifiers(input)).toEqual(result.modifiers)
		})
	})

	it('exposes a working factory instance', () => {
		expect(calculator).toMatchObject({
			calculateCrtOddsBand: expect.any(Function),
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
		expect(calculator.calculateCrtOddsBand(input)).toBe('1:1')
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
					'target-1': { typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', stackSize: 2 },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.attackStrength).toBe(8)
		expect(result.defenseStrength).toBe(2)
		expect(result.odds).toBe('4:1')
	})

	it('uses Little Pigs stack size for defense strength', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss' },
					'target-1': { typeId: 'LittlePigs', stackSize: 2 },
				},
			},
		}

		const result = calculator.calculateResult(input)

		expect(result.defenseStrength).toBe(2)
		expect(result.odds).toBe('2:1')
	})

	it('does not apply implicit terrain modifiers to a target', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 1' },
					'target-1': { typeId: 'LittlePigs', friendlyName: 'Little Pigs 1', stackSize: 3 },
				},
			},
		}

		const modifiers = calculator.calculateModifiers(input)

		expect(modifiers).toEqual([])
		expect(calculator.calculateResult(input).defenseStrength).toBe(3)
		expect(input.combatState.units['target-1'].friendlyName).toBe('Little Pigs 1')
	})

	it('uses weapon defense for individually targeted Onion subsystems', () => {
		const input: CombatCalculatorInput = {
			attackerGroupIds: ['attack-1'],
			targetId: 'target-1',
			combatState: {
				units: {
					'attack-1': { typeId: 'Puss', friendlyName: 'Big Bad Wolf 1' },
					'target-1': { typeId: 'TheOnion', friendlyName: 'The Onion 1', weaponId: 'secondary-1' },
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
						weaponIds: ['main-1', 'main-2'],
						weapons: [
									  { id: 'main-1', typeId: 'Dragon.main', weaponClass: 'main', friendlyName: 'A', state: 'ready', ammo: 1 },
									  { id: 'main-2', typeId: 'Dragon.main', weaponClass: 'main', friendlyName: 'B', state: 'ready', ammo: 1 },
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
						weaponId: 'secondary-1',
						weapons: [
							{ id: 'main', typeId: 'TheOnion.main', friendlyName: 'Main Weapon', weaponClass: 'main', state: 'ready', ammo: 1 },
													{ id: 'secondary-1', typeId: 'TheOnion.secondary', friendlyName: 'Secondary Weapon 1', weaponClass: 'secondary', state: 'ready', ammo: 1 },
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

	it('throws when a Little Pigs target is missing stackSize in live combat state', () => {
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

		expect(() => calculator.calculateResult(input)).toThrow("Stack target 'target-1' of type 'LittlePigs' is missing stackSize in the live combat state")
	})

	it('ignores terrain metadata when calculating combat', () => {
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
		expect(calculator.calculateResult(input).attackStrength).toBe(4)
		expect(calculator.calculateResult(input).defenseStrength).toBe(3)
	})
})
