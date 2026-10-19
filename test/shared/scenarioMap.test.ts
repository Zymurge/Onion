import { describe, expect, it } from 'vitest'

import { assertScenarioPositionsInMap, materializeScenarioMap } from '#shared/scenarioMap'

describe('scenarioMap materialization', () => {
	it('materializes an odd-diameter hex map with non-negative absolute coordinates', () => {
		const map = materializeScenarioMap({ shape: 'hex', size: 5, hexes: [] })

		expect(map.width).toBe(5)
		expect(map.height).toBe(5)
		expect(map.cells).toHaveLength(19)
		expect(map.cells).toContainEqual({ q: 0, r: 2 })
		expect(map.cells).toContainEqual({ q: 2, r: 0 })
		expect(map.cells).toContainEqual({ q: 4, r: 0 })
		expect(map.cells).not.toContainEqual({ q: 0, r: 0 })
	})

	it('keeps terrain and authored positions in the generated map coordinate space', () => {
		const map = materializeScenarioMap({
			shape: 'hex',
			size: 5,
			hexes: [{ q: 3, r: 0, t: 1 }],
		})

		expect(map.hexes).toEqual([{ q: 3, r: 0, t: 1 }])
		expect(() => assertScenarioPositionsInMap(map, [{ label: 'unit start', position: { q: 3, r: 0 } }])).not.toThrow()
	})

	it('generates rectangular maps from their dimensions', () => {
		const map = materializeScenarioMap({ shape: 'rectangle', width: 3, height: 2, hexes: [] })

		expect(map.cells).toHaveLength(6)
		expect(map.cells).toContainEqual({ q: 0, r: 0 })
		expect(map.cells).toContainEqual({ q: 2, r: 1 })
		expect(map.cells).not.toContainEqual({ q: 3, r: 1 })
	})

	it('rejects terrain and authored positions outside compact generated maps', () => {
		expect(() => materializeScenarioMap({
			shape: 'hex',
			size: 3,
			hexes: [{ q: 3, r: 0, t: 1 }],
		})).toThrow('Scenario terrain hex is outside the map at (3, 0)')

		const map = materializeScenarioMap({ shape: 'rectangle', width: 2, height: 2, hexes: [] })
		expect(() => assertScenarioPositionsInMap(map, [{ label: 'escape hex', position: { q: 2, r: 1 } }])).toThrow(
			'escape hex is outside the scenario map at (2, 1)',
		)
	})

	it('rejects invalid compact map dimensions', () => {
		expect(() => materializeScenarioMap({ shape: 'hex', size: 4, hexes: [] })).toThrow(
			'Hex map size must be a positive odd integer',
		)
		expect(() => materializeScenarioMap({ shape: 'hex', size: 0, hexes: [] })).toThrow(
			'Hex map size must be a positive odd integer',
		)
		expect(() => materializeScenarioMap({ shape: 'rectangle', width: 0, height: 2, hexes: [] })).toThrow(
			'Rectangle map dimensions must be positive integers',
		)
	})

	it('rejects terrain outside the generated map membership', () => {
		expect(() => materializeScenarioMap({ shape: 'hex', size: 3, hexes: [{ q: 3, r: 0, t: 1 }] })).toThrow(
			'Scenario terrain hex is outside the map at (3, 0)',
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
		const map = materializeScenarioMap({ shape: 'hex', size: 3, hexes: [] })

		expect(() =>
			assertScenarioPositionsInMap(map, [{ label: 'onion start', position: { q: 4, r: 4 } }]),
		).toThrow('onion start is outside the scenario map at (4, 4)')
	})
})
