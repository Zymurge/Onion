import { describe, expect, it } from 'vitest'

import {
	buildEdgeLookup,
	canStopOnOccupiedHex,
	canTraverseOccupiedHex,
	canonicalEdgeKey,
	getEdgeStepEffect,
	getStepMoveCost,
	getTerrainMoveCost,
	getStopOnOccupiedHexFailure,
	type MoveOccupant,
} from '#shared/movementRules'
import { GLOBAL_RULES_CONTEXT, type RulesContext } from '#shared/rulesContext'
import type { ScenarioTerrainEdge, TerrainType, UnitClassRule } from '#shared/types'

function occupant(overrides: Partial<MoveOccupant> = {}): MoveOccupant {
	return {
		q: 0,
		r: 0,
		role: 'defender',
		unitType: 'Puss',
		squads: 1,
		...overrides,
	}
}

describe('getStopOnOccupiedHexFailure', () => {
	it('returns null for empty hex', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'Puss',
			occupants: [],
		})).toBeNull()
	})

	it('returns occupied for non-stackable units', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'Puss',
			occupants: [{ q: 0, r: 0, role: 'defender', unitType: 'Puss' }],
		})).toBe('occupied')
	})

	it('returns stack-limit for Little Pigs over limit', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
			],
			incomingMembers: 1,
		})).toBe('stack-limit')
	})

	it('returns null for Little Pigs stacking within limit', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
				{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs' },
			],
			incomingMembers: 1,
		})).toBeNull()
	})

	it('ignores legacy squads values when counting stack members', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
			occupants: [{ q: 0, r: 0, role: 'defender', unitType: 'LittlePigs', squads: 99 }],
			incomingMembers: 1,
		})).toBeNull()
	})

	it('returns occupied-by-onion if Onion is present', () => {
		expect(getStopOnOccupiedHexFailure({
			movingRole: 'defender',
			movingUnitType: 'Puss',
			occupants: [{ q: 0, r: 0, role: 'onion', unitType: 'TheOnion' }],
		})).toBe('occupied-by-onion')
	})
})

describe('movementRules', () => {
	it('derives ridgeline movement cost from shared terrain rules', () => {
		expect(getTerrainMoveCost('Puss', 'ridgeline')).toBeNull()
		expect(getTerrainMoveCost('LittlePigs', 'ridgeline')).toBe(1)
		expect(getTerrainMoveCost('TheOnion', 'ridgeline')).toBe(1)
	})

	it.each([
		{ unitType: 'LittlePigs', unitClass: 'Infantry' },
		{ unitType: 'Puss', unitClass: 'LightArmor' },
		{ unitType: 'Dragon', unitClass: 'HeavyArmor' },
		{ unitType: 'BigBadWolf', unitClass: 'GEV' },
		{ unitType: 'Swamp', unitClass: 'Command' },
		{ unitType: 'Farquaad', unitClass: 'Artillery' },
		{ unitType: 'TheOnion', unitClass: 'Onion' },
	])('treats crater terrain as impassable to $unitClass', ({ unitType }) => {
		expect(getTerrainMoveCost(unitType, 'crater')).toBeNull()
	})

	it.each([
		{ unitType: 'LittlePigs', unitClass: 'Infantry', cost: 1 },
		{ unitType: 'Puss', unitClass: 'LightArmor', cost: 2 },
		{ unitType: 'Dragon', unitClass: 'HeavyArmor', cost: 2 },
		{ unitType: 'BigBadWolf', unitClass: 'GEV', cost: 1 },
		{ unitType: 'Swamp', unitClass: 'Command', cost: 2 },
		{ unitType: 'Farquaad', unitClass: 'Artillery', cost: 2 },
		{ unitType: 'TheOnion', unitClass: 'Onion', cost: 2 },
	])('charges $cost MP to enter swamp for $unitClass', ({ unitType, cost }) => {
		expect(getTerrainMoveCost(unitType, 'swamp')).toBe(cost)
	})

	it('throws when a class terrain rule is missing', () => {
		const rules = {
			...GLOBAL_RULES_CONTEXT,
			getUnitClassRule(unitClass: Parameters<RulesContext['getUnitClassRule']>[0]) {
				return {
					...GLOBAL_RULES_CONTEXT.getUnitClassRule(unitClass),
					wholeHexTerrain: {} as UnitClassRule['wholeHexTerrain'],
				}
			},
		} satisfies RulesContext

		expect(() => getTerrainMoveCost('Puss', 'swamp', rules)).toThrow('Missing swamp terrain rule')
		expect(() => getTerrainMoveCost('Puss', 'clear', rules)).toThrow('Missing clear terrain rule')
	})

	it('allows defenders to traverse only friendly occupied hexes', () => {
		expect(canTraverseOccupiedHex('defender', [occupant({ role: 'defender' })])).toBe(true)
		expect(canTraverseOccupiedHex('defender', [occupant({ role: 'onion', unitType: 'TheOnion' })])).toBe(false)
	})

	it('allows the Onion to traverse only defender-occupied hexes', () => {
		expect(canTraverseOccupiedHex('onion', [occupant({ role: 'defender' })])).toBe(true)
		expect(canTraverseOccupiedHex('onion', [occupant({ role: 'onion', unitType: 'TheOnion' })])).toBe(false)
	})

	it('allows Little Pigs to stop on a shared stack up to the rule-defined limit', () => {
		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
				],
				incomingMembers: 1,
			}),
		).toBe(true)

		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
					occupant({ unitType: 'LittlePigs' }),
				],
				incomingMembers: 1,
			}),
		).toBe(false)
	})

	it('rejects mixed or non-Little-Pigs defender stacks', () => {
		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				occupants: [occupant({ unitType: 'Dragon' })],
				incomingSquads: 1,
			}),
		).toBe(false)

		expect(
			canStopOnOccupiedHex({
				movingRole: 'defender',
				movingUnitType: 'Puss',
				occupants: [occupant({ unitType: 'LittlePigs', squads: 1 })],
			}),
		).toBe(false)
	})

	describe('edge and step move cost rules', () => {
		const ridgeEdge: ScenarioTerrainEdge = {
			type: 'ridge',
			a: { q: 1, r: 0 },
			b: { q: 2, r: 0 },
		}
		const streamEdge: ScenarioTerrainEdge = {
			type: 'stream',
			a: { q: 2, r: 0 },
			b: { q: 3, r: 0 },
		}
		const edgeLookup = buildEdgeLookup([ridgeEdge, streamEdge])
		const terrainLookup = new Map<string, TerrainType>([
			['1,0', 'clear'],
			['2,0', 'clear'],
			['3,0', 'clear'],
			['4,0', 'crater'],
			['5,0', 'swamp'],
		])

		it('produces identical canonicalEdgeKey regardless of endpoint order', () => {
			const k1 = canonicalEdgeKey({ q: 1, r: 2 }, { q: 2, r: 1 })
			const k2 = canonicalEdgeKey({ q: 2, r: 1 }, { q: 1, r: 2 })
			expect(k1).toBe(k2)
			expect(k1).toBe('1,2|2,1')

			const k3 = canonicalEdgeKey({ q: 3, r: 5 }, { q: 3, r: 4 })
			const k4 = canonicalEdgeKey({ q: 3, r: 4 }, { q: 3, r: 5 })
			expect(k3).toBe(k4)
			expect(k3).toBe('3,4|3,5')
		})

		it('builds lookup indexed by canonical edge key', () => {
			expect(edgeLookup.get('1,0|2,0')).toBe(ridgeEdge)
			expect(edgeLookup.get('2,0|3,0')).toBe(streamEdge)
			expect(edgeLookup.get('3,0|4,0')).toBeUndefined()
		})

		it('evaluates ridge traversal: permitted for Infantry and Onion, prohibited for others', () => {
			// Forward
			expect(getEdgeStepEffect('LittlePigs', { q: 1, r: 0 }, { q: 2, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
			expect(getEdgeStepEffect('TheOnion', { q: 1, r: 0 }, { q: 2, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
			expect(getEdgeStepEffect('Puss', { q: 1, r: 0 }, { q: 2, r: 0 }, edgeLookup)).toEqual({
				canCross: false,
				surcharge: 0,
			})
			expect(getEdgeStepEffect('Dragon', { q: 1, r: 0 }, { q: 2, r: 0 }, edgeLookup)).toEqual({
				canCross: false,
				surcharge: 0,
			})
			expect(getEdgeStepEffect('BigBadWolf', { q: 1, r: 0 }, { q: 2, r: 0 }, edgeLookup)).toEqual({
				canCross: false,
				surcharge: 0,
			})

			// Reverse traversal
			expect(getEdgeStepEffect('LittlePigs', { q: 2, r: 0 }, { q: 1, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
			expect(getEdgeStepEffect('Puss', { q: 2, r: 0 }, { q: 1, r: 0 }, edgeLookup)).toEqual({
				canCross: false,
				surcharge: 0,
			})
		})

		it('evaluates stream traversal: +1 surcharge for LightArmor, +0 for others', () => {
			// LightArmor: Puss
			expect(getEdgeStepEffect('Puss', { q: 2, r: 0 }, { q: 3, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 1,
			})
			// Reverse
			expect(getEdgeStepEffect('Puss', { q: 3, r: 0 }, { q: 2, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 1,
			})

			// HeavyArmor: Dragon
			expect(getEdgeStepEffect('Dragon', { q: 2, r: 0 }, { q: 3, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
			// Infantry: LittlePigs
			expect(getEdgeStepEffect('LittlePigs', { q: 2, r: 0 }, { q: 3, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
			// GEV: BigBadWolf
			expect(getEdgeStepEffect('BigBadWolf', { q: 2, r: 0 }, { q: 3, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
			// Onion: TheOnion
			expect(getEdgeStepEffect('TheOnion', { q: 2, r: 0 }, { q: 3, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
		})

		it('evaluates no edge as canCross: true with 0 surcharge', () => {
			expect(getEdgeStepEffect('Puss', { q: 0, r: 0 }, { q: 1, r: 0 }, edgeLookup)).toEqual({
				canCross: true,
				surcharge: 0,
			})
		})

		it('combines edge surcharge and destination whole-hex terrain cost in getStepMoveCost', () => {
			// Clear hex with no edge: 1 MP
			expect(
				getStepMoveCost({
					unitType: 'Puss',
					from: { q: 0, r: 0 },
					to: { q: 1, r: 0 },
					terrainLookup,
					edgeLookup,
				}),
			).toBe(1)

			// Prohibited ridge: returns null
			expect(
				getStepMoveCost({
					unitType: 'Puss',
					from: { q: 1, r: 0 },
					to: { q: 2, r: 0 },
					terrainLookup,
					edgeLookup,
				}),
			).toBeNull()

			// Permitted ridge into clear: 1 + 0 = 1 MP
			expect(
				getStepMoveCost({
					unitType: 'LittlePigs',
					from: { q: 1, r: 0 },
					to: { q: 2, r: 0 },
					terrainLookup,
					edgeLookup,
				}),
			).toBe(1)

			// Stream into clear for LightArmor: 1 (clear) + 1 (surcharge) = 2 MP
			expect(
				getStepMoveCost({
					unitType: 'Puss',
					from: { q: 2, r: 0 },
					to: { q: 3, r: 0 },
					terrainLookup,
					edgeLookup,
				}),
			).toBe(2)

			// Stream into clear for HeavyArmor: 1 (clear) + 0 (surcharge) = 1 MP
			expect(
				getStepMoveCost({
					unitType: 'Dragon',
					from: { q: 2, r: 0 },
					to: { q: 3, r: 0 },
					terrainLookup,
					edgeLookup,
				}),
			).toBe(1)

			// Stream into crater: impassable crater returns null
			const streamIntoCraterLookup = new Map(edgeLookup)
			streamIntoCraterLookup.set('3,0|4,0', {
				type: 'stream',
				a: { q: 3, r: 0 },
				b: { q: 4, r: 0 },
			})
			expect(
				getStepMoveCost({
					unitType: 'Puss',
					from: { q: 3, r: 0 },
					to: { q: 4, r: 0 },
					terrainLookup,
					edgeLookup: streamIntoCraterLookup,
				}),
			).toBeNull()

			// Stream into swamp for LightArmor: 2 (swamp) + 1 (stream) = 3 MP
			const streamIntoSwampLookup = new Map(edgeLookup)
			streamIntoSwampLookup.set('2,0|5,0', {
				type: 'stream',
				a: { q: 2, r: 0 },
				b: { q: 5, r: 0 },
			})
			expect(
				getStepMoveCost({
					unitType: 'Puss',
					from: { q: 2, r: 0 },
					to: { q: 5, r: 0 },
					terrainLookup,
					edgeLookup: streamIntoSwampLookup,
				}),
			).toBe(3)
		})
	})
})
