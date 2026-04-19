import { describe, expect, it } from 'vitest'

import { findMovePath, listReachableMoves } from '#shared/movePlanner'

type MoveMapSnapshot = {
	width: number
	height: number
	cells: Array<{ q: number; r: number }>
	hexes: Array<{ q: number; r: number; t: number }>
	occupiedHexes?: Array<{
		q: number
		r: number
		role: string
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
				hexes: [{ q: 1, r: 1, t: 2 }], // crater in the middle
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
				hexes: [{ q: 1, r: 0, t: 2 }], // crater blocks direct path
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
				cells: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
				hexes: [{ q: 1, r: 0, t: 1 }], // ridgeline
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 2, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'Puss',
			})
			expect(result.found).toBe(false)
		})

		it('allows ridgeline crossing for units that can', () => {
			const map = {
				...baseMap,
				hexes: [{ q: 1, r: 0, t: 1 }], // ridgeline
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 2, r: 0 },
				movementAllowance: 4,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
			})
			expect(result.found).toBe(true)
		})
	})

	describe('occupation and stacking', () => {
		it('returns not found for destination occupied by non-stackable unit', () => {
			const map = {
				...baseMap,
				occupiedHexes: [{ q: 1, r: 1, role: 'defender', unitType: 'Puss' }],
			}
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
			}
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
				occupiedHexes: [{ q: 1, r: 1, role: 'defender', unitType: 'LittlePigs', squads: 2 }],
			}
			const result = findMovePath({
				map,
				from: { q: 0, r: 0 },
				to: { q: 1, r: 1 },
				movementAllowance: 2,
				movingRole: 'defender',
				movingUnitType: 'LittlePigs',
				incomingSquads: 2,
			})
			expect(result.found).toBe(false)
		})

		it('returns not found for defender moving into Onion-occupied hex', () => {
			const map = {
				...baseMap,
				occupiedHexes: [{ q: 1, r: 1, role: 'onion', unitType: 'TheOnion' }],
			}
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
	})
})
