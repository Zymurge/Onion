// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBattlefieldInteractionState } from '#web/lib/useBattlefieldInteractionState'
import type { GameSessionController } from '#web/lib/gameSessionTypes'
import type { GameSnapshot } from '#web/lib/gameClient'

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return {
		gameId: 123,
		mode: 'fire',
		phase: 'ONION_MOVE',
		scenarioName: 'Interaction state scenario',
		turnNumber: 3,
		lastEventSeq: 10,
		selectedUnitId: null,
		authoritativeState: {
			onion: {
				id: 'onion-1',
				type: 'TheOnion',
				position: { q: 0, r: 0 },
				treads: 33,
				status: 'operational',
				weapons: [],
				batteries: { main: 1, secondary: 0, ap: 0 },
			},
			defenders: {
				'def-1': {
					id: 'def-1',
					type: 'Puss',
					position: { q: 0, r: 1 },
					status: 'operational',
					weapons: [],
				},
			},
			ramsThisTurn: 0,
		},
		movementRemainingByUnit: { 'onion-1': 3 },
		scenarioMap: {
			width: 3,
			height: 3,
			cells: [
				{ q: 0, r: 0 },
				{ q: 0, r: 1 },
				{ q: 1, r: 0 },
				{ q: 1, r: 1 },
			],
			hexes: [
				{ q: 0, r: 0, t: 0 },
				{ q: 0, r: 1, t: 0 },
				{ q: 1, r: 0, t: 0 },
				{ q: 1, r: 1, t: 0 },
			],
		},
		...overrides,
	}
}
function createController() {
	return {
		subscribe: vi.fn(),
		getSnapshot: vi.fn(),
		load: vi.fn(),
		refresh: vi.fn(),
		submitAction: vi.fn(),
		dispose: vi.fn(),
	} satisfies GameSessionController
}

describe('useBattlefieldInteractionState', () => {
	it('prompts for a ram move and resolves it through the controller', async () => {
		const submitAction = vi.fn().mockResolvedValue(createSnapshot({ lastEventSeq: 11 }))
		const controller = createController()
		controller.submitAction = submitAction

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.handleSelectUnit('onion-1')
		})

		await act(async () => {
			await result.current.handleMoveUnit('onion-1', { q: 0, r: 1 })
		})

		expect(result.current.pendingRamPrompt).toMatchObject({
			unitId: 'onion-1',
			to: { q: 0, r: 1 },
			targetLabel: 'Puss',
		})

		await act(async () => {
			result.current.handleResolveRamPrompt(false)
		})

		await waitFor(() => {
			expect(submitAction).toHaveBeenCalledWith({
				type: 'MOVE',
				movers: ['onion-1'],
				to: { q: 0, r: 1 },
				attemptRam: false,
			})
		})
		expect(result.current.pendingRamPrompt).toBeNull()
		expect(result.current.selectedUnitIds).toEqual([])
	})

	it('falls back to refresh completion when no controller is connected', async () => {
		vi.useFakeTimers()
		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: null,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				isControlledSession: false,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			void result.current.handleRefresh()
		})
		expect(result.current.isRefreshing).toBe(true)

		await act(async () => {
			vi.advanceTimersByTime(800)
		})

		expect(result.current.isRefreshing).toBe(false)
		expect(result.current.lastRefreshAt).not.toBeNull()
		vi.useRealTimers()
	})

	it('submits a straight move without prompting for ram', async () => {
		const submitAction = vi.fn().mockResolvedValue(createSnapshot({ lastEventSeq: 11 }))
		const controller = createController()
		controller.submitAction = submitAction

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.handleSelectUnit('onion-1')
		})

		await act(async () => {
			await result.current.handleMoveUnit('onion-1', { q: 1, r: 1 })
		})

		await waitFor(() => {
			expect(submitAction).toHaveBeenCalledWith({
				type: 'MOVE',
				movers: ['onion-1'],
				to: { q: 1, r: 1 },
			})
		})
		expect(result.current.pendingRamPrompt).toBeNull()
		expect(result.current.selectedUnitIds).toEqual([])
	})

	it('refreshes through the controller when one is available', async () => {
		const controller = createController()
		controller.refresh = vi.fn().mockResolvedValue(undefined)

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			await result.current.handleRefresh()
		})

		expect(controller.refresh).toHaveBeenCalledTimes(1)
		expect(result.current.isRefreshing).toBe(false)
		expect(result.current.lastRefreshAt).not.toBeNull()
	})

	it('reports a validation error when moving without a selection', async () => {
		const submitAction = vi.fn().mockResolvedValue(createSnapshot({ lastEventSeq: 11, phase: 'DEFENDER_MOVE' }))
		const controller = createController()
		controller.submitAction = submitAction
		const snapshot = {
			gameId: 123,
			mode: 'fire',
			phase: 'DEFENDER_MOVE' as const,
			scenarioName: 'Interaction state scenario',
			turnNumber: 3,
			lastEventSeq: 10,
			selectedUnitId: null,
			authoritativeState: {
				onion: {
					id: 'onion-1',
					type: 'TheOnion',
					position: { q: 0, r: 0 },
					treads: 33,
					status: 'operational',
					weapons: [],
					batteries: { main: 1, secondary: 0, ap: 0 },
				},
				defenders: {
					'wolf-2': {
						id: 'wolf-2',
						type: 'BigBadWolf',
						position: { q: 1, r: 1 },
						status: 'operational',
						weapons: [],
						squads: 2,
					},
				},
				ramsThisTurn: 0,
			},
			movementRemainingByUnit: { 'wolf-2': 4 },
			scenarioMap: {
				width: 3,
				height: 3,
				cells: [
					{ q: 0, r: 0 },
					{ q: 0, r: 1 },
					{ q: 1, r: 0 },
					{ q: 1, r: 1 },
					{ q: 2, r: 2 },
				],
				hexes: [
					{ q: 0, r: 0, t: 0 },
					{ q: 0, r: 1, t: 0 },
					{ q: 1, r: 0, t: 0 },
					{ q: 1, r: 1, t: 0 },
					{ q: 2, r: 2, t: 0 },
				],
			},
		} satisfies GameSnapshot

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: 'DEFENDER_MOVE',
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			await result.current.handleMoveUnit('wolf-2', { q: 2, r: 2 })
		})

		await waitFor(() => {
			expect(submitAction).toHaveBeenCalledWith({
				type: 'MOVE',
				movers: ['wolf-2'],
				to: { q: 2, r: 2 },
			})
		})
		expect(result.current.actionError).toBeNull()
	})

	it('keeps state unchanged when selection and movement are locked', async () => {
		const submitAction = vi.fn().mockResolvedValue(createSnapshot({ lastEventSeq: 11, phase: 'DEFENDER_MOVE' }))
		const controller = createController()
		controller.submitAction = submitAction

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot({ phase: 'DEFENDER_MOVE' }),
				clientSnapshotPhase: 'DEFENDER_MOVE',
				isControlledSession: true,
				isInteractionLocked: true,
				isSelectionLocked: true,
			}),
		)

		await act(async () => {
			result.current.setSelectedUnitIds(['def-1'])
		})

		await act(async () => {
			result.current.handleSelectUnit('def-1')
			result.current.handleSelectStackMember('def-1', ['def-1'])
			result.current.handleSelectAllStackMembers(['def-1'])
			result.current.handleClearStackSelection()
			result.current.handleDeselectUnit()
		})

		await act(async () => {
			await result.current.handleMoveUnit('def-1', { q: 1, r: 1 })
		})

		expect(result.current.selectedUnitIds).toEqual(['def-1'])
		expect(result.current.actionError).toBeNull()
		expect(result.current.pendingRamPrompt).toBeNull()
		expect(submitAction).not.toHaveBeenCalled()
	})

	it('refreshes after a failed combat commit', async () => {
		const submitAction = vi.fn().mockRejectedValue(new Error('combat exploded'))
		const refresh = vi.fn().mockResolvedValue(undefined)
		const controller = createController()
		controller.submitAction = submitAction
		controller.refresh = refresh

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot({ phase: 'DEFENDER_COMBAT' }),
				clientSnapshotPhase: 'DEFENDER_COMBAT',
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			await result.current.commitClientAction({ type: 'FIRE', attackers: ['def-1'], targetId: 'onion-1' })
		})

		expect(refresh).toHaveBeenCalledTimes(1)
		expect(result.current.actionError).toContain('combat exploded')
		expect(result.current.pendingCombatResolution).toBeNull()
		expect(result.current.selectedUnitIds).toEqual([])
	})
})