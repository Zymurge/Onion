import type { GameState } from '../types/index.js'

export function createMoveGameState(treads: number): GameState {
	return {
		onion: {
			id: 'onion-1',
			type: 'TheOnion',
			position: { q: 0, r: 1 },
			treads,
			status: 'operational',
			weapons: [
				{
					id: 'main-1',
					name: 'Main Battery',
					attack: 4,
					range: 4,
					defense: 4,
					status: 'ready',
					individuallyTargetable: true,
				},
			],
			batteries: {
				main: 1,
				secondary: 0,
				ap: 0,
			},
		},
		defenders: {
			'wolf-2': {
				id: 'wolf-2',
				type: 'BigBadWolf',
				position: { q: 6, r: 6 },
				status: 'operational',
				weapons: [
					{
						id: 'main',
						name: 'Main Gun',
						attack: 4,
						range: 2,
						defense: 2,
						status: 'ready',
						individuallyTargetable: false,
					},
				],
			},
			'puss-1': {
				id: 'puss-1',
				type: 'Puss',
				position: { q: 6, r: 4 },
				status: 'operational',
				weapons: [
					{
						id: 'main',
						name: 'Main Gun',
						attack: 4,
						range: 2,
						defense: 3,
						status: 'ready',
						individuallyTargetable: false,
					},
				],
			},
		},
		ramsThisTurn: 0,
	}
}