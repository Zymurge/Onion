import { describe, expect, it } from 'vitest'

import { createAxialRegion, getNeighbors, hexDistance, hexKey, hexesWithinRange } from './hex.js'

describe('shared hex primitives', () => {
	describe('hexDistance', () => {
		it('returns 0 for the same hex', () => {
			expect(hexDistance({ q: 3, r: 3 }, { q: 3, r: 3 })).toBe(0)
		})

		it('returns 1 for all six direct axial neighbors', () => {
			const origin = { q: 2, r: 2 }

			expect(hexDistance(origin, { q: 3, r: 2 })).toBe(1)
			expect(hexDistance(origin, { q: 1, r: 2 })).toBe(1)
			expect(hexDistance(origin, { q: 2, r: 3 })).toBe(1)
			expect(hexDistance(origin, { q: 2, r: 1 })).toBe(1)
			expect(hexDistance(origin, { q: 3, r: 1 })).toBe(1)
			expect(hexDistance(origin, { q: 1, r: 3 })).toBe(1)
		})

		it('returns correct distance for further hexes', () => {
			expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(2)
			expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 3 })).toBe(3)
			expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -3 })).toBe(3)
		})

		it('is symmetric', () => {
			const left = { q: 1, r: 4 }
			const right = { q: 5, r: 2 }

			expect(hexDistance(left, right)).toBe(hexDistance(right, left))
		})
	})

	describe('getNeighbors', () => {
		it('returns exactly 6 neighbors', () => {
			expect(getNeighbors({ q: 3, r: 3 })).toHaveLength(6)
		})

		it('returns the correct 6 axial neighbor positions', () => {
			const neighbors = getNeighbors({ q: 0, r: 0 })
			const expected = [
				{ q: 1, r: 0 },
				{ q: -1, r: 0 },
				{ q: 0, r: 1 },
				{ q: 0, r: -1 },
				{ q: 1, r: -1 },
				{ q: -1, r: 1 },
			]

			for (const neighbor of expected) {
				expect(neighbors).toContainEqual(neighbor)
			}
		})

		it('returns only neighbors at distance 1', () => {
			const origin = { q: 3, r: 3 }

			for (const neighbor of getNeighbors(origin)) {
				expect(hexDistance(origin, neighbor)).toBe(1)
			}
		})
	})

	describe('hexesWithinRange', () => {
		it('returns all hexes within range 2, excluding origin by default', () => {
			const keys = hexesWithinRange({ q: 0, r: 0 }, 2).map(hexKey)

			expect(keys).toHaveLength(18)
			expect(keys).not.toContain('0,0')
			expect(new Set(keys)).toEqual(
				new Set([
					'-2,0', '-2,1', '-2,2',
					'-1,-1', '-1,0', '-1,1', '-1,2',
					'0,-2', '0,-1', '0,1', '0,2',
					'1,-2', '1,-1', '1,0', '1,1',
					'2,-2', '2,-1', '2,0',
				]),
			)
		})

		it('supports a minimum distance for annular overlays', () => {
			const coords = hexesWithinRange({ q: 0, r: 0 }, 3, 2)

			expect(coords).toHaveLength(30)
			expect(coords.some((coord) => hexDistance({ q: 0, r: 0 }, coord) === 1)).toBe(false)
			expect(coords.some((coord) => hexDistance({ q: 0, r: 0 }, coord) === 2)).toBe(true)
			expect(coords.some((coord) => hexDistance({ q: 0, r: 0 }, coord) === 3)).toBe(true)
		})

		it('returns an empty array when the requested range is invalid', () => {
			expect(hexesWithinRange({ q: 0, r: 0 }, 1, 2)).toEqual([])
		})
	})

	describe('createAxialRegion', () => {
		it('enumerates all cells in a bounded radius with the origin at the center by default', () => {
			const region = createAxialRegion(2)

			expect(region.radius).toBe(2)
			expect(region.center).toEqual({ q: 0, r: 0 })
			expect(region.cells).toHaveLength(19)
			expect(new Set(region.cells.map(hexKey))).toEqual(
				new Set([
					'0,0',
					'-1,0', '1,0', '0,-1', '0,1', '1,-1', '-1,1',
					'-2,0', '-2,1', '-2,2',
					'-1,-1', '-1,2',
					'0,-2', '0,2',
					'1,-2', '1,1',
					'2,-2', '2,-1', '2,0',
				]),
			)
		})

		it('treats membership as distance-bounded axial containment', () => {
			const region = createAxialRegion(2, { q: 3, r: 4 })

			expect(region.contains({ q: 3, r: 4 })).toBe(true)
			expect(region.contains({ q: 5, r: 4 })).toBe(true)
			expect(region.contains({ q: 6, r: 4 })).toBe(false)
			expect(region.contains({ q: 4, r: 2 })).toBe(true)
			expect(region.contains({ q: 1, r: 1 })).toBe(false)
		})

		it('normalizes non-integer and invalid radii to a non-negative integer region', () => {
			const fractional = createAxialRegion(2.9)
			const invalid = createAxialRegion(-1)

			expect(fractional.radius).toBe(2)
			expect(fractional.cells).toHaveLength(19)
			expect(invalid.radius).toBe(0)
			expect(invalid.cells).toEqual([{ q: 0, r: 0 }])
			expect(invalid.contains({ q: 0, r: 0 })).toBe(true)
			expect(invalid.contains({ q: 0, r: 1 })).toBe(false)
		})
	})
})