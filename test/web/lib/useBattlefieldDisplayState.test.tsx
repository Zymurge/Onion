// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useBattlefieldDisplayState } from '#web/lib/useBattlefieldDisplayState'
import type { GameSnapshot } from '#web/lib/gameClient'
import type { GameSessionViewState } from '#web/lib/gameSessionTypes'

function createSnapshot(): GameSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		scenarioName: 'Display state invariant scenario',
		turnNumber: 8,
		lastEventSeq: 47,
		authoritativeState: {
			onion: {
				id: 'onion-live',
				type: 'TheOnion',
				position: { q: 1, r: 1 },
				treads: 27,
				status: 'operational',
				weapons: [],
				batteries: { main: 1, secondary: 0, ap: 0 },
			},
			defenders: {
				'pigs-1': {
					id: 'pigs-1',
					type: 'LittlePigs',
					position: { q: 4, r: 4 },
					status: 'operational',
					weapons: [],
				},
				'pigs-2': {
					id: 'pigs-2',
					type: 'LittlePigs',
					position: { q: 4, r: 4 },
					status: 'operational',
					weapons: [],
				},
			},
			ramsThisTurn: 0,
		},
		movementRemainingByUnit: {
			'onion-live': 3,
			'pigs-1': 3,
			'pigs-2': 3,
		},
		scenarioMap: {
			width: 8,
			height: 8,
			cells: [],
			hexes: [],
		},
	}
}

function createSessionState(snapshot: GameSnapshot): GameSessionViewState {
	return {
		status: 'ready',
		snapshot,
		session: { role: 'defender' },
		liveConnection: 'connected',
		lastAppliedEventSeq: snapshot.lastEventSeq,
		lastAppliedEventType: 'snapshot',
		lastUpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
		error: null,
	}
}

describe('useBattlefieldDisplayState', () => {
	it('rejects stacked defenders when canonical stack roster data is missing', () => {
		expect(() => {
			renderHook(() =>
				useBattlefieldDisplayState({
					combatBaseSnapshot: null,
					activeMode: 'fire',
					lastRefreshAt: null,
					selectedCombatTargetId: null,
					selectedUnitIds: [],
					sessionState: createSessionState(createSnapshot()),
					activeSessionBinding: null,
				}),
			)
		}).toThrow('missing canonical stackRoster data')
	})
})