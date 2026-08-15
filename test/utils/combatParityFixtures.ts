import type {
	CombatCalculatorInput,
	CombatCalculatorResult,
} from '#shared/combatCalculator'

export type CombatParityFixture = {
	name: string
	input: CombatCalculatorInput
	expected: Pick<CombatCalculatorResult, 'attackStrength' | 'defenseStrength' | 'odds' | 'modifiers'>
}

export const combatParityFixtures: ReadonlyArray<CombatParityFixture> = [
	{
		name: 'Onion main weapon against a ridgeline Little Pigs stack',
		input: {
			attackerGroupIds: ['main'],
			targetId: 'LittlePigs:1,1',
			combatState: {
				units: {
					main: {
						typeId: 'TheOnion',
						weaponIds: ['main'],
					},
					'LittlePigs:1,1': {
						typeId: 'LittlePigs',
						stackSize: 3,
						terrainType: 'ridgeline',
					},
				},
			},
		},
		expected: {
			attackStrength: 4,
			defenseStrength: 4,
			odds: '1:1',
			modifiers: [
				{
					kind: 'terrain',
					scope: 'defense',
					label: 'Ridgeline cover: +1 defense',
					value: 1,
					appliesTo: 'LittlePigs:1,1',
				},
			],
		},
	},
	{
		name: 'Puss against Onion treads',
		input: {
			attackerGroupIds: ['puss-1'],
			targetId: 'onion-1',
			combatState: {
				units: {
					'puss-1': { typeId: 'Puss' },
					'onion-1': { typeId: 'TheOnion' },
				},
			},
		},
		expected: {
			attackStrength: 4,
			defenseStrength: 4,
			odds: '1:1',
			modifiers: [],
		},
	},
	{
		name: 'Puss against an Onion secondary weapon',
		input: {
			attackerGroupIds: ['puss-1'],
			targetId: 'onion-1',
			combatState: {
				units: {
					'puss-1': { typeId: 'Puss' },
					'onion-1': { typeId: 'TheOnion', weaponId: 'secondary_1' },
				},
			},
		},
		expected: {
			attackStrength: 4,
			defenseStrength: 3,
			odds: '1:1',
			modifiers: [],
		},
	},
]