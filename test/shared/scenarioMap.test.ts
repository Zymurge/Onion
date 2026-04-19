import { describe, expect, it } from 'vitest'

import { assertScenarioPositionsInMap, materializeScenarioMap } from '#shared/scenarioMap'

describe('scenarioMap materialization', () => {
	it('materializes a translated non-negative hex region from radius', () => {
		const map = materializeScenarioMap({ radius: 2, hexes: [] })

		expect(map.width).toBe(5)
		expect(map.height).toBe(5)
		expect(map.cells).toHaveLength(19)
		expect(map.cells).toContainEqual({ q: 2, r: 0 })
		expect(map.cells).toContainEqual({ q: 4, r: 0 })
		expect(map.cells).toContainEqual({ q: 1, r: 1 })
		expect(map.cells).toContainEqual({ q: 0, r: 2 })
		expect(map.cells).toContainEqual({ q: 0, r: 4 })
		expect(map.cells).not.toContainEqual({ q: 0, r: 0 })
		expect(map.cells).not.toContainEqual({ q: 5, r: 0 })
		expect(map.hexes).toEqual([])
	})

	it('translates authored terrain hexes into runtime coordinates', () => {
		const map = materializeScenarioMap({
			radius: 2,
			hexes: [{ q: 1, r: 0, t: 1 }, { q: 2, r: 1, t: 3 }],
		})

		expect(map.hexes).toContainEqual({ q: 3, r: 0, t: 1 })
		expect(map.hexes).toContainEqual({ q: 3, r: 1, t: 3 })
	})

	it('rejects terrain outside the generated map membership', () => {
		expect(() => materializeScenarioMap({ radius: 1, hexes: [{ q: 4, r: 4, t: 1 }] })).toThrow(
			'Scenario terrain hex is outside the map at (1, 4)',
		)
	})

	it('rejects explicit maps with no cells', () => {
		expect(() =>
			materializeScenarioMap({
				width: 1,
				height: 1,
				cells: [],
				hexes: [],
			}),
		).toThrow('Scenario map must contain at least one cell')
	})

	it('rejects authored positions outside the map membership', () => {
		const map = materializeScenarioMap({ radius: 1, hexes: [] })

		expect(() =>
			assertScenarioPositionsInMap(map, [{ label: 'onion start', position: { q: 4, r: 4 } }]),
		).toThrow('onion start is outside the scenario map at (4, 4)')
	})
})
