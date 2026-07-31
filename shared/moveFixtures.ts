import type { GameState } from './types/index.js'

export function createMoveGameState(treads: number): GameState {
	return {
		onions: {
		'onion-1': {
			unitId: 'onion-1',
			typeId: 'TheOnion',
			role: 'onion',
			friendlyName: 'The Onion',
			position: { q: 0, r: 1 },
			treads,
			state: 'operational',
			ramsRemaining: 2,
			weapons: [
				{
					id: 'main-1',
					typeId: 'TheOnion.main',
					state: 'ready',
					friendlyName: 'Main Battery',
				},
			],
		},
		},
		defenders: {
			'wolf-2': {
				unitId: 'wolf-2',
				typeId: 'BigBadWolf',
				role: 'defender',
				friendlyName: 'Big Bad Wolf 2',
				position: { q: 6, r: 6 },
				state: 'operational',
				weapons: [
					{
						id: 'main',
						typeId: 'BigBadWolf.main',
						state: 'ready',
						friendlyName: 'Main Gun',
					},
				],
			},
			'puss-1': {
				unitId: 'puss-1',
				typeId: 'Puss',
				role: 'defender',
				friendlyName: 'Puss 1',
				position: { q: 6, r: 4 },
				state: 'operational',
				weapons: [
					{
						id: 'main',
						typeId: 'Puss.main',
						state: 'ready',
						friendlyName: 'Main Gun',
					},
				],
			},
		},
		stackNaming: { groupsInUse: [], usedGroupNames: [] },
		stackRoster: { groupsById: {} },
		currentPhase: 'ONION_MOVE',
		turn: 1,
	}
}