import { describe, expect, it } from 'vitest'

import { findMovePath, listReachableMoves } from '#shared/movePlanner'

type MoveMapSnapshot = {
	width: number
	height: number
	cells: Array<{ q: number; r: number }>
	hexes: Array<{ q: number; r: number; terrain: 'clear' | 'crater' | 'swamp' }>
	occupiedHexes?: Array<{
		q: number
		r: number
		role: 'onion' | 'defender'
		unitType: string
		squads?: number
	}>
}

describe('movePlanner error and edge cases', () => {
	const baseMap = {
		width: 3,
		height: 3,
		cells: [
			{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 },
			{ q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 },
			{ q: 0, r: 2 }, { q: 1, r: 2 }, { q: 2, r: 2 },
		],
		hexes: [],
		edges: [],
	}

	describe('zero-move and range', () => {
		it('allows zero-move (no-op) to same hex', () => {
			const result = findMovePath({
				map: baseMap,
				from: { q: 1, r: 1 },
				to: { q: 1, r: 1 },
				movementAllowance: 1,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result).toEqual({ found: true, path: [], cost: 0 })
		})

		it('returns not found for out-of-range move', () => {
			const result = findMovePath({
				map: baseMap,
				from: { q: 0, r: 0 },
				to: { q: 2, r: 2 },
				movementAllowance: 1,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(false)
		})
	})

	describe('terrain/pathfinding', () => {
		it('still finds an alternate path around impassable terrain', () => {
			const map = {
				...baseMap,
				hexes: [{ q: 1, r: 1, terrain: 'crater' }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 2, r: 2 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(true)
			expect(result.cost).toBeGreaterThan(0)
		})

		it('allows path through impassable terrain if another path exists', () => {
			const map = {
				...baseMap,
				hexes: [{ q: 1, r: 0, terrain: 'crater' }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 2, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(true)
		})

		it('returns not found for ridgeline if it is the only route and the unit cannot cross', () => {
			const map = {
				width: 3,
				height: 1,
				cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
				hexes: [],
				edges: [{ type: 'ridge', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(false)
		})

		it('allows ridgeline crossing for units that can (LittlePigs)', () => {
			const map = {
				width: 3,
				height: 1,
				cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
				hexes: [],
				edges: [{ type: 'ridge', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
			})
			expect(result.found).toBe(true)
			expect(result.cost).toBe(1)
			expect(result.path).toEqual([{ q: 1, r: 0 }])
		})

		it('finds alternate path around a ridge for units that cannot cross it', () => {
			// (0,0) -> (1,0) blocked by ridge
			// Alternate route: (0,0) -> (0,1) -> (1,0)
			const map = {
				...baseMap,
				edges: [{ type: 'ridge', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(true)
			expect(result.cost).toBe(2)
			expect(result.path).toEqual([{ q: 0, r: 1 }, { q: 1, r: 0 }])
		})

		it('applies stream surcharge (+1 MP) for LightArmor (Puss)', () => {
			const map = {
				...baseMap,
				edges: [{ type: 'stream', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(true)
			// Base clear hex = 1 MP, stream surcharge for LightArmor = 1 MP -> Total = 2 MP
			expect(result.cost).toBe(2)
			expect(result.path).toEqual([{ q: 1, r: 0 }])
		})

		it('does not apply stream surcharge for HeavyArmor or Infantry', () => {
			const map = {
				...baseMap,
				edges: [{ type: 'stream', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
			}
			const resultHeavy = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Dragon',
			})
			expect(resultHeavy.found).toBe(true)
			expect(resultHeavy.cost).toBe(1)

			const resultInfantry = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
			})
			expect(resultInfantry.found).toBe(true)
			expect(resultInfantry.cost).toBe(1)
		})

		it('fails pathfinding if stream surcharge exceeds movement allowance', () => {
			const map = {
				...baseMap,
				edges: [{ type: 'stream', a: { q: 0, r: 0 }, b: { q: 1, r: 0 } }],
			}
			// Cost is 2 MP, allowance is 1 MP
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 0 },
				movementAllowance: 1,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(false)
		})

		it('exposes edge cost effects in listReachableMoves', () => {
			const map = {
				width: 3,
				height: 2,
				// A 1x3 strip along r=1: (0,1), (1,1), (2,1)
				cells: [{ q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 1 }],
				hexes: [],
				edges: [
					{ type: 'ridge', a: { q: 1, r: 1 }, b: { q: 2, r: 1 } },
					{ type: 'stream', a: { q: 1, r: 1 }, b: { q: 0, r: 1 } },
				],
			}
			// For Puss with 1 MP:
			// (2,1) is blocked by ridge
			// (0,1) costs 2 MP (1 base + 1 stream) -> unreachable with 1 MP
			const reachablePuss1 = listReachableMoves({
				map,
				from: { q: 1, r: 1 },
				movementAllowance: 1,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			const reachablePuss1Keys = new Set(reachablePuss1.map((p) => `${p.to.q},${p.to.r}`))
			expect(reachablePuss1Keys.has('2,1')).toBe(false)
			expect(reachablePuss1Keys.has('0,1')).toBe(false)

			// With 2 MP, stream hex (0,1) becomes reachable, ridge hex (2,1) remains unreachable (no alternative route)
			const reachablePuss2 = listReachableMoves({
				map,
				from: { q: 1, r: 1 },
				movementAllowance: 2,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			const reachablePuss2Keys = new Set(reachablePuss2.map((p) => `${p.to.q},${p.to.r}`))
			expect(reachablePuss2Keys.has('0,1')).toBe(true)
			expect(reachablePuss2Keys.has('2,1')).toBe(false)

			// For LittlePigs with 1 MP:
			// ridge to (2,1) is passable (+0 surcharge, 1 MP total)
			// stream to (0,1) is passable (+0 surcharge, 1 MP total)
			const reachablePigs = listReachableMoves({
				map,
				from: { q: 1, r: 1 },
				movementAllowance: 1,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
			})
			const reachablePigsKeys = new Set(reachablePigs.map((p) => `${p.to.q},${p.to.r}`))
			expect(reachablePigsKeys.has('2,1')).toBe(true)
			expect(reachablePigsKeys.has('0,1')).toBe(true)
		})
	})

	describe('occupation and stacking', () => {
		it('returns not found for destination occupied by non-stackable unit', () => {
			const map = {
				...baseMap,
				occupiedHexes: [{ q: 1, r: 1, role: 'defender', unitType: 'Puss' }],
			} as MoveMapSnapshot
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 1 },
				movementAllowance: 2,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(false)
		})

		it('allows Little Pigs to stack within limit', () => {
			const map = {
				...baseMap,
				occupiedHexes: [{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs', squads: 1 }],
			} as MoveMapSnapshot
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 1 },
				movementAllowance: 2,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				incomingSquads: 2,
			})
			expect(result.found).toBe(true)
		})

		it('returns not found for Little Pigs stacking over limit', () => {
			const map = {
				...baseMap,
				occupiedHexes: [
					{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs' },
					{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs' },
					{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs' },
					{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs' },
					{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs' },
				],
			} as MoveMapSnapshot
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 1 },
				movementAllowance: 2,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				incomingMembers: 1,
			})
			expect(result.found).toBe(false)
		})

		it('returns not found for defender moving into Onion-occupied hex', () => {
			const map = {
				...baseMap,
				occupiedHexes: [{ q: 1, r: 1, role: 'onion', unitType: 'TheOnion' }],
			} as MoveMapSnapshot
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 1 },
				movementAllowance: 2,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(false)
		})

		it('allows moving through occupied hex if not stopping there', () => {
			const map = {
				...baseMap,
				occupiedHexes: [{ q: 1, r: 0, role: 'defender', unitType: 'Puss' }],
			} as MoveMapSnapshot
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 2, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(true)
		})
	})
})
