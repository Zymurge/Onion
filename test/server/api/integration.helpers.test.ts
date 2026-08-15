import { describe, expect, it } from 'vitest'
import { translateScenarioCoord } from '#shared/scenarioMap'
import { buildExpectedState } from './integration.helpers.js'
import type { InitialState } from '#server/engine/scenarioSchema'

	describe('buildExpectedState', () => {
	 it('remaps Onion and defender positions using the cached radius', () => {
		const previousRadius = translateScenarioCoord.lastRadius
		translateScenarioCoord.lastRadius = 7

		try {
			const initialState: InitialState = {
				deployments: {
					'onion-1': {
						type: 'TheOnion',
						side: 'onion',
					position: { q: 3, r: 10 },
					},
					'onion-2': {
						type: 'TheOnion',
						side: 'onion',
						position: { q: 4, r: 11 },
					},
					'wolf-1': { type: 'BigBadWolf', side: 'defender', position: { q: 5, r: 6 }, status: 'operational' },
					'pigs-1': { type: 'LittlePigs', side: 'defender', position: { q: 4, r: 7 }, status: 'operational' },
				},
			}

			const expectedState = buildExpectedState(initialState)

			expect(expectedState).not.toHaveProperty('onion')
			expect(expectedState.onions['onion-1'].position).toEqual({ q: 0, r: 10 })
			expect(expectedState.onions['onion-2'].position).toEqual({ q: 0, r: 11 })
			expect(expectedState.defenders['wolf-1'].position).toEqual({ q: 6, r: 6 })
			expect(expectedState.defenders['pigs-1'].position).toEqual({ q: 4, r: 7 })
			expect(initialState.deployments['onion-1'].position).toEqual({ q: 3, r: 10 })
			expect(initialState.deployments['wolf-1'].position).toEqual({ q: 5, r: 6 })
		} finally {
			translateScenarioCoord.lastRadius = previousRadius
		}
	})
})