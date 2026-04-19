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
		it('returns not found for blocked by impassable terrain', () => {
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
			expect(result.found).toBe(false)
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

		it('returns not found for ridgeline if unit cannot cross', () => {
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
		role: 'onion' | 'defender'
		unitType: string
		squads?: number
	}>
}

const clearMap: MoveMapSnapshot = {
	width: 4,
	height: 4,
	cells: Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, q) => ({ q, r }))).flat(),
	hexes: [],
}

const terrainMap: MoveMapSnapshot = {
	width: 4,
	height: 4,
	cells: Array.from({ length: 4 }, (_, r) => Array.from({ length: 4 }, (_, q) => ({ q, r }))).flat(),
	hexes: [
		{ q: 2, r: 1, t: 1 },
		{ q: 2, r: 2, t: 2 },
	],
}

describe('movePlanner', () => {
	it('returns a path and cost for a reachable destination on clear terrain', () => {
		const result = findMovePath({
			map: clearMap,
			from: { q: 1, r: 1 },
			to: { q: 2, r: 1 },
			movementAllowance: 1,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 2, r: 1 }],
			cost: 1,
		})
	})

	it('treats the southwest axial diagonal as an adjacent move', () => {
		const result = findMovePath({
			map: clearMap,
			from: { q: 1, r: 1 },
			to: { q: 0, r: 2 },
			movementAllowance: 1,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 0, r: 2 }],
			cost: 1,
		})
	})

	it('treats ridgelines as cost 2 when the unit can cross them', () => {
		const result = findMovePath({
			map: terrainMap,
			from: { q: 1, r: 1 },
			to: { q: 2, r: 1 },
			movementAllowance: 2,
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 2, r: 1 }],
			cost: 2,
		})
	})

	it('returns no path when a crater blocks the destination', () => {
		const result = findMovePath({
			map: terrainMap,
			from: { q: 1, r: 1 },
			to: { q: 2, r: 2 },
			movementAllowance: 3,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toEqual({
			found: false,
			path: [],
			cost: 0,
		})
	})

	it('traverses an occupied ally hex en route to a farther destination', () => {
		const result = findMovePath({
			map: {
				...clearMap,
				occupiedHexes: [{ q: 2, r: 1, role: 'defender', unitType: 'Dragon' }],
			},
			from: { q: 1, r: 1 },
			to: { q: 3, r: 1 },
			movementAllowance: 3,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 2, r: 1 }, { q: 3, r: 1 }],
			cost: 2,
		})
	})

	it('does not allow a non-Little Pigs unit to stop on an allied occupied destination', () => {
		const result = findMovePath({
			map: {
				...clearMap,
				occupiedHexes: [{ q: 2, r: 1, role: 'defender', unitType: 'Dragon' }],
			},
			from: { q: 1, r: 1 },
			to: { q: 2, r: 1 },
			movementAllowance: 1,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toEqual({
			found: false,
			path: [],
			cost: 0,
		})
	})

	it('allows Little Pigs to stack on an allied Little Pigs hex', () => {
		const result = findMovePath({
			map: {
				...clearMap,
				occupiedHexes: [{ q: 2, r: 1, role: 'defender', unitType: 'LittlePigs', squads: 1 }],
			},
			from: { q: 1, r: 1 },
			to: { q: 2, r: 1 },
			movementAllowance: 1,
			movingRole: 'defender',
			movingUnitType: 'LittlePigs',
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 2, r: 1 }],
			cost: 1,
		})
	})

	it('treats enemy occupied hexes as traversable for the Onion', () => {
		const result = findMovePath({
			map: {
				...clearMap,
				occupiedHexes: [{ q: 2, r: 1, role: 'defender', unitType: 'Puss' }],
			},
			from: { q: 1, r: 1 },
			to: { q: 3, r: 1 },
			movementAllowance: 3,
			movingRole: 'onion',
			movingUnitType: 'TheOnion',
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 2, r: 1 }, { q: 3, r: 1 }],
			cost: 2,
		})
	})

	it('lists all reachable neighbors from the center of a clear board', () => {
		const result = listReachableMoves({
			map: clearMap,
			from: { q: 1, r: 1 },
			movementAllowance: 1,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toHaveLength(6)
		expect(result).toContainEqual({ to: { q: 2, r: 1 }, path: [{ q: 2, r: 1 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 0, r: 1 }, path: [{ q: 0, r: 1 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 2, r: 0 }, path: [{ q: 2, r: 0 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 0, r: 2 }, path: [{ q: 0, r: 2 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 1, r: 0 }, path: [{ q: 1, r: 0 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 1, r: 2 }, path: [{ q: 1, r: 2 }], cost: 1 })
	})

	it('omits ridgelines and craters that exceed the current allowance', () => {
		const result = listReachableMoves({
			map: terrainMap,
			from: { q: 1, r: 1 },
			movementAllowance: 1,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result.find((move) => move.to.q === 2 && move.to.r === 1)).toBeUndefined()
		expect(result.find((move) => move.to.q === 2 && move.to.r === 2)).toBeUndefined()
	})

	it('omits occupied hexes from normal reachable moves', () => {
		const result = listReachableMoves({
			map: {
				...clearMap,
				occupiedHexes: [{ q: 2, r: 1, role: 'defender', unitType: 'Dragon' }],
			},
			from: { q: 1, r: 1 },
			movementAllowance: 3,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result.find((move) => move.to.q === 2 && move.to.r === 1)).toBeUndefined()
	})

	it('restricts reachable moves to the explicit cell list', () => {
		const result = listReachableMoves({
			map: {
				width: 4,
				height: 4,
				cells: [{ q: 1, r: 1 }, { q: 2, r: 1 }, { q: 1, r: 2 }],
				hexes: [],
			},
			from: { q: 1, r: 1 },
			movementAllowance: 2,
			movingRole: 'defender',
			movingUnitType: 'Puss',
		})

		expect(result).toEqual([
			{ to: { q: 1, r: 2 }, path: [{ q: 1, r: 2 }], cost: 1 },
			{ to: { q: 2, r: 1 }, path: [{ q: 2, r: 1 }], cost: 1 },
		])
	})
})