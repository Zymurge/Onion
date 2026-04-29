// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useBattlefieldDisplayState } from '#web/lib/useBattlefieldDisplayState'
import type { GameSnapshot } from '#web/lib/gameClient'
import type { GameSessionViewState } from '#web/lib/gameSessionTypes'
import type { BattlefieldInteractionState } from '#web/lib/useBattlefieldInteractionState'

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
		victoryObjectives: [],
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

function createInteractionState(overrides: Partial<BattlefieldInteractionState> = {}): BattlefieldInteractionState {
	return {
		selectedUnitIds: [],
		hasExplicitSelection: false,
		selectedCombatTargetId: null,
		activeMode: 'fire',
		actionError: null,
		combatBaseSnapshot: null,
		pendingCombatResolution: null,
		pendingRamResolution: null,
		pendingRamPrompt: null,
		lastRefreshAt: null,
		isRefreshing: false,
		...overrides,
	}
}

describe('useBattlefieldDisplayState', () => {
	it('returns error if stacked defenders are present but stackRoster is missing', () => {
		const { result } = renderHook(() =>
			useBattlefieldDisplayState({
				combatBaseSnapshot: null,
				interactionState: createInteractionState(),
				sessionState: createSessionState(createSnapshot()),
				activeSessionBinding: null,
			})
		)
		expect(result.current.error).toMatch(/missing canonical stackRoster data/)
		// Game state should still be present
		expect(result.current.clientSnapshot).toBeTruthy()
	})

	it('returns error if stackRoster is present but inconsistent with unit positions', () => {
		const snapshot = createSnapshot()
		const authoritativeState = snapshot.authoritativeState!
		authoritativeState.stackRoster = {
			groupsById: {
				'LittlePigs:3,9': {
					groupName: 'LittlePigs',
					unitType: 'LittlePigs',
					position: { q: 3, r: 9 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}
		const { result } = renderHook(() =>
			useBattlefieldDisplayState({
				combatBaseSnapshot: null,
				interactionState: createInteractionState(),
				sessionState: createSessionState(snapshot),
				activeSessionBinding: null,
			})
		)
		expect(String(result.current.error)).toMatch(/invalid stack roster/)
		expect(result.current.clientSnapshot).toBeTruthy()
	})

	it('returns no error for valid stackRoster and unit positions', () => {
		const snapshot = createSnapshot()
		const authoritativeState = snapshot.authoritativeState!
		authoritativeState.stackRoster = {
			groupsById: {
				'LittlePigs:4,4': {
					groupName: 'LittlePigs',
					unitType: 'LittlePigs',
					position: { q: 4, r: 4 },
					unitIds: ['pigs-1', 'pigs-2'],
				},
			},
		}
		const { result } = renderHook(() =>
			useBattlefieldDisplayState({
				combatBaseSnapshot: null,
				interactionState: createInteractionState(),
				sessionState: createSessionState(snapshot),
				activeSessionBinding: null,
			})
		)
		expect(result.current.error).toBeFalsy()
		expect(result.current.clientSnapshot).toBeTruthy()
	})

})