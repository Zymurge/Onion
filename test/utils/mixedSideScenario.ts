import type { InitialState } from '#server/engine/scenarioSchema'

export function makeMixedSideInitialState(): InitialState {
	return {
		deployments: {
			'onion-puss': {
				type: 'Puss',
				side: 'onion',
				position: { q: 0, r: 0 },
			},
			'defender-onion': {
				type: 'TheOnion',
				side: 'defender',
				position: { q: 2, r: 0 },
			},
		},
	}
}