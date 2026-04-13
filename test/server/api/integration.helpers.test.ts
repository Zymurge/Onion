import { describe, expect, it } from 'vitest'
import { translateScenarioCoord } from '#shared/scenarioMap'
import { buildExpectedState } from './integration.helpers.js'

describe('buildExpectedState', () => {
	it('remaps onion and defender positions using the cached radius', () => {
		const previousRadius = translateScenarioCoord.lastRadius
		translateScenarioCoord.lastRadius = 7

		try {
			const initialState = {
				onion: {
					position: { q: 3, r: 10 },
					treads: 45,
					missiles: 2,
					batteries: { main: 1, secondary: 4, ap: 8 },
				},
				defenders: {
					'wolf-1': { position: { q: 5, r: 6 }, status: 'operational' },
					'pigs-1': { position: { q: 4, r: 7 }, status: 'operational', squads: 3 },
				},
			}

			const expectedState = buildExpectedState(initialState)

			expect(expectedState.onion.position).toEqual({ q: 0, r: 10 })
			expect(expectedState.defenders['wolf-1'].position).toEqual({ q: 6, r: 6 })
			expect(expectedState.defenders['pigs-1'].position).toEqual({ q: 4, r: 7 })
			expect(initialState.onion.position).toEqual({ q: 3, r: 10 })
			expect(initialState.defenders['wolf-1'].position).toEqual({ q: 5, r: 6 })
		} finally {
			translateScenarioCoord.lastRadius = previousRadius
		}
	})
})