import { describe, expect, it } from 'vitest'

import { findMovePath, listReachableMoves } from './movePlanner.js'

type MoveMapSnapshot = {
	width: number
	height: number
	hexes: Array<{ q: number; r: number; t: number }>
}

const clearMap: MoveMapSnapshot = {
	width: 4,
	height: 4,
	hexes: [],
}

const terrainMap: MoveMapSnapshot = {
	width: 4,
	height: 4,
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
			canCrossRidgelines: false,
		})

		expect(result).toEqual({
			found: true,
			path: [{ q: 2, r: 1 }],
			cost: 1,
		})
	})

	it('treats ridgelines as cost 2 when the unit can cross them', () => {
		const result = findMovePath({
			map: terrainMap,
			from: { q: 1, r: 1 },
			to: { q: 2, r: 1 },
			movementAllowance: 2,
			canCrossRidgelines: true,
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
			canCrossRidgelines: true,
		})

		expect(result).toEqual({
			found: false,
			path: [],
			cost: 0,
		})
	})

	it('lists all reachable neighbors from the center of a clear board', () => {
		const result = listReachableMoves({
			map: clearMap,
			from: { q: 1, r: 1 },
			movementAllowance: 1,
			canCrossRidgelines: false,
		})

		expect(result).toHaveLength(6)
		expect(result).toContainEqual({ to: { q: 2, r: 1 }, path: [{ q: 2, r: 1 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 0, r: 1 }, path: [{ q: 0, r: 1 }], cost: 1 })
		expect(result).toContainEqual({ to: { q: 1, r: 2 }, path: [{ q: 1, r: 2 }], cost: 1 })
	})

	it('omits ridgelines and craters that exceed the current allowance', () => {
		const result = listReachableMoves({
			map: terrainMap,
			from: { q: 1, r: 1 },
			movementAllowance: 1,
			canCrossRidgelines: false,
		})

		expect(result.find((move) => move.to.q === 2 && move.to.r === 1)).toBeUndefined()
		expect(result.find((move) => move.to.q === 2 && move.to.r === 2)).toBeUndefined()
	})
})