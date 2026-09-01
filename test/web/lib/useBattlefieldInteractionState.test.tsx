// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { buildStackRosterFromUnits } from '#shared/stackRoster'
import { useBattlefieldInteractionState } from '#web/lib/useBattlefieldInteractionState'
import type { GameSessionController } from '#web/lib/gameSessionTypes'
import type { GameSnapshot } from '#web/lib/gameClient'
import { getUnitTypeCatalog, getWeaponTypeCatalog } from '#shared/unitDefinitions'
import { createSessionCatalog } from '#web/lib/sessionCatalog'
import { makeDefender, makeOnion, makeScenarioSnapshot, makeWeapon } from '#test/utils/gameStateUtils'

const sessionCatalog = createSessionCatalog(getUnitTypeCatalog(), getWeaponTypeCatalog())

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	const { authoritativeState, scenarioMap, ...snapshotOverrides } = overrides
	const baseSnapshot = makeScenarioSnapshot({
		gameId: 123,
		phase: 'ONION_MOVE',
		scenarioName: 'Interaction state scenario',
		turnNumber: 3,
		lastEventSeq: 10,
		authoritativeState: {
			onions: {
				'onion-1': makeOnion({
					position: { q: 0, r: 0 },
					treads: 33,
					weapons: [makeWeapon({ id: 'main', typeId: 'TheOnion.main' })],
					ramsRemaining: 1,
				}),
			},
			defenders: {
				'def-1': makeDefender({
					unitId: 'def-1',
					position: { q: 0, r: 1 },
					weapons: [],
				}),
			},
		},
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
	})

	return {
		...baseSnapshot,
		...snapshotOverrides,
		...(authoritativeState === undefined ? {} : { authoritativeState }),
		...(scenarioMap === undefined ? {} : { scenarioMap }),
	}
}
function createController() {
	return {
		subscribe: vi.fn(),
		getSnapshot: vi.fn(),
		load: vi.fn(),
		refresh: vi.fn(),
		submitAction: vi.fn(),
		abort: vi.fn(),
		dispose: vi.fn(),
	} satisfies GameSessionController
}

function createGroupedDefenderSnapshot(options?: {
	includeStackRoster?: boolean
	includeRosterEntryForSecondUnit?: boolean
}): GameSnapshot {
	const defenders = {
		'pigs-1': makeDefender({
			unitId: 'pigs-1',
			typeId: 'LittlePigs',
			position: { q: 1, r: 1 },
			weapons: [],
		}),
		'pigs-2': makeDefender({
			unitId: 'pigs-2',
			typeId: 'LittlePigs',
			position: { q: 1, r: 1 },
			weapons: [],
		}),
	}

	const stackRoster = options?.includeStackRoster === false
		? undefined
		: options?.includeRosterEntryForSecondUnit === false
			? {
				groupsById: {
					'LittlePigs:1,1': {
						groupName: 'Little Pigs group 1',
						unitType: 'LittlePigs',
						position: { q: 1, r: 1 },
						unitIds: ['pigs-1'],
					},
				},
			}
			: buildStackRosterFromUnits(Object.values(defenders))

	const baseSnapshot = createSnapshot({ phase: 'DEFENDER_MOVE' })
	const baseState = {
		...baseSnapshot.authoritativeState!,
		defenders,
		currentPhase: 'DEFENDER_MOVE' as const,
		turn: 3,
		...(stackRoster === undefined ? {} : { stackRoster }),
	}
	const authoritativeState = stackRoster === undefined
		? (() => {
			const { stackRoster: stackRosterToOmit, ...stateWithoutRoster } = baseState
			void stackRosterToOmit
			return stateWithoutRoster as unknown as NonNullable<GameSnapshot['authoritativeState']>
		})()
		: baseState

	return createSnapshot({
		phase: 'DEFENDER_MOVE',
		authoritativeState,
	})
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
				catalog: sessionCatalog,
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

	it('exposes a single interaction state model', async () => {
		const controller = createController()

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		expect(result.current.interactionState).toMatchObject({
			selectedUnitIds: null,
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
		})
	})

	it('preserves the Onion combat target while changing a non-empty weapon group', async () => {
		const controller = createController()
		const snapshot = createSnapshot({
			phase: 'ONION_COMBAT',
			authoritativeState: {
				...createSnapshot().authoritativeState!,
				onions: {
					'onion-1': makeOnion({
						unitId: 'onion-1',
						weapons: [
							makeWeapon({ id: 'main', typeId: 'TheOnion.main' }),
							makeWeapon({ id: 'secondary', typeId: 'TheOnion.secondary_1' }),
						],
					}),
				},
			},
		})

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: 'ONION_COMBAT',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.setSelectedUnitIds(['weapon:main', 'weapon:secondary'])
			result.current.setSelectedCombatTargetId('def-1')
		})

		await act(async () => {
			result.current.handleSelectUnit('weapon:secondary', true)
		})

		expect(result.current.selectedUnitIds).toEqual(['weapon:main'])
		expect(result.current.selectedCombatTargetId).toBe('def-1')

		await act(async () => {
			result.current.handleSelectUnit('weapon:main', true)
		})

		expect(result.current.selectedUnitIds).toEqual([])
		expect(result.current.selectedCombatTargetId).toBeNull()
	})

	it('preserves the Defender combat target while changing a non-empty attacker group', async () => {
		const controller = createController()
		const baseSnapshot = createSnapshot({ phase: 'DEFENDER_COMBAT' })
		const snapshot = createSnapshot({
			phase: 'DEFENDER_COMBAT',
			authoritativeState: {
				...baseSnapshot.authoritativeState!,
				defenders: {
					...baseSnapshot.authoritativeState!.defenders,
					'def-2': makeDefender({
						unitId: 'def-2',
						position: { q: 1, r: 1 },
						weapons: [],
					}),
				},
			},
		})

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: 'DEFENDER_COMBAT',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.setSelectedUnitIds(['def-1', 'def-2'])
			result.current.setSelectedCombatTargetId('onion-1:treads')
		})

		await act(async () => {
			result.current.handleSelectUnit('def-2', true)
		})

		expect(result.current.selectedUnitIds).toEqual(['def-1'])
		expect(result.current.selectedCombatTargetId).toBe('onion-1:treads')

		await act(async () => {
			result.current.handleSelectUnit('def-1', true)
		})

		expect(result.current.selectedUnitIds).toEqual([])
		expect(result.current.selectedCombatTargetId).toBeNull()
	})

	it('clears a Defender treads target when adding an attacker from another group', async () => {
		const controller = createController()
		const baseSnapshot = createSnapshot({ phase: 'DEFENDER_COMBAT' })
		const defenders = {
			'pigs-1': makeDefender({ unitId: 'pigs-1', typeId: 'LittlePigs', position: { q: 0, r: 1 }, weapons: [] }),
			'pigs-2': makeDefender({ unitId: 'pigs-2', typeId: 'LittlePigs', position: { q: 1, r: 1 }, weapons: [] }),
		}
		const snapshot = createSnapshot({
			phase: 'DEFENDER_COMBAT',
			authoritativeState: {
				...baseSnapshot.authoritativeState!,
				defenders,
				stackRoster: buildStackRosterFromUnits(Object.values(defenders)),
			},
		})

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: 'DEFENDER_COMBAT',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.setSelectedUnitIds(['pigs-1'])
			result.current.setSelectedCombatTargetId('onion-1:treads')
		})

		await act(async () => {
			result.current.handleSelectUnit('pigs-2', true)
		})

		expect(result.current.selectedUnitIds).toEqual(['pigs-1', 'pigs-2'])
		expect(result.current.selectedCombatTargetId).toBeNull()
	})

	it('falls back to refresh completion when no controller is connected', async () => {
		vi.useFakeTimers()
		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: null,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				catalog: sessionCatalog,
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
				catalog: sessionCatalog,
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
				catalog: sessionCatalog,
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
		const snapshot = createSnapshot({
			phase: 'DEFENDER_MOVE',
			authoritativeState: {
				...createSnapshot().authoritativeState!,
				onions: {
					'onion-1': makeOnion({
						position: { q: 0, r: 0 },
						treads: 33,
						weapons: [makeWeapon({ id: 'main', typeId: 'TheOnion.main' })],
					}),
				},
				defenders: {
					'wolf-2': makeDefender({
						unitId: 'wolf-2',
						typeId: 'BigBadWolf',
						position: { q: 1, r: 1 },
						weapons: [],
					}),
				},
				currentPhase: 'DEFENDER_MOVE',
				turn: 3,
			},
			victoryObjectives: [],
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
		})

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: 'DEFENDER_MOVE',
				catalog: sessionCatalog,
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
				catalog: sessionCatalog,
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

	it('does not throw out of handleSelectUnit when grouped-unit stack metadata is missing', async () => {
		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: createController(),
				activeTurnActive: true,
				clientSnapshot: createGroupedDefenderSnapshot({ includeStackRoster: false }),
				clientSnapshotPhase: 'DEFENDER_MOVE',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		expect(() => {
			act(() => {
				result.current.handleSelectUnit('pigs-1')
			})
		}).not.toThrow()
	})

	it('surfaces selection resolution failures via actionError and keeps the prior selection unchanged', async () => {
		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: createController(),
				activeTurnActive: true,
				clientSnapshot: createGroupedDefenderSnapshot({ includeStackRoster: false }),
				clientSnapshotPhase: 'DEFENDER_MOVE',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.setSelectedUnitIds(['def-1'])
		})

		await act(async () => {
			result.current.handleSelectUnit('pigs-1')
		})

		expect(result.current.actionError).toMatch(/Missing stackRoster for grouped unit pigs-1/)
		expect(result.current.actionError).toContain('unitId=pigs-1')
		expect(result.current.actionError).toContain('phase=DEFENDER_MOVE')
		expect(result.current.actionError).toContain('stackableDefenders=pigs-1, pigs-2')
		expect(result.current.actionError).toContain('stackRosterGroups=none')
		expect(result.current.selectedUnitIds).toEqual(['def-1'])
	})

	it('expands grouped defender selection to canonical member ids when stack metadata is present', async () => {
		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: createController(),
				activeTurnActive: true,
				clientSnapshot: createGroupedDefenderSnapshot(),
				clientSnapshotPhase: 'DEFENDER_MOVE',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.handleSelectUnit('pigs-1')
		})

		expect(result.current.actionError).toBeNull()
		expect(result.current.selectedUnitIds).toEqual(['pigs-1', 'pigs-2'])
	})

	it('clears selections when the authoritative phase changes', async () => {
		const controller = createController()
		const initialSnapshot = createSnapshot({ phase: 'DEFENDER_MOVE' })
		const { result, rerender } = renderHook(
			({ snapshot, phase }: { snapshot: GameSnapshot; phase: GameSnapshot['phase'] }) => useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: phase,
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
			{ initialProps: { snapshot: initialSnapshot, phase: initialSnapshot.phase } },
		)

		await act(async () => {
			result.current.handleSelectUnit('def-1')
		})
		expect(result.current.selectedUnitIds).toEqual(['def-1'])

		const nextSnapshot = createSnapshot({ phase: 'DEFENDER_COMBAT', lastEventSeq: 11 })
		rerender({ snapshot: nextSnapshot, phase: nextSnapshot.phase })

		await waitFor(() => {
			expect(result.current.selectedUnitIds).toEqual([])
		})
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
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			await result.current.commitClientAction({ type: 'FIRE', attackers: ['def-1'], targetId: 'onion-1', onionId: 'onion-1' })
		})

		expect(refresh).toHaveBeenCalledTimes(1)
		expect(result.current.actionError).toContain('combat exploded')
		expect(result.current.pendingCombatResolution).toBeNull()
		expect(result.current.selectedUnitIds).toEqual([])
	})

	it('reconciles selected units and weapons against the next authoritative snapshot', async () => {
		const controller = createController()
		const { result, rerender } = renderHook(
			({ snapshot }: { snapshot: GameSnapshot }) => useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: snapshot.phase,
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
			{ initialProps: { snapshot: createSnapshot() } },
		)

		await act(async () => {
			result.current.setSelectedUnitIds(['def-1', 'weapon:main'])
		})

		const nextSnapshot = createSnapshot({
			lastEventSeq: 11,
			authoritativeState: {
				...createSnapshot().authoritativeState!,
				onions: {
					'onion-1': makeOnion({ position: { q: 0, r: 0 }, weapons: [] }),
				},
				defenders: {},
			currentPhase: 'ONION_MOVE',
			turn: 3,
			},
		})
		rerender({ snapshot: nextSnapshot })

		await waitFor(() => {
			expect(result.current.selectedUnitIds).toEqual([])
		})
	})

	it('reports failed movement submissions and clears the attempted selection', async () => {
		const submitAction = vi.fn().mockRejectedValue(new Error('move exploded'))
		const controller = createController()
		controller.submitAction = submitAction

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: createSnapshot(),
				clientSnapshotPhase: 'ONION_MOVE',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.handleSelectUnit('onion-1')
			await result.current.handleMoveUnit('onion-1', { q: 1, r: 0 })
		})

		expect(submitAction).toHaveBeenCalledWith({
			type: 'MOVE',
			movers: ['onion-1'],
			to: { q: 1, r: 0 },
		})
		expect(result.current.actionError).toContain('move exploded')
		expect(result.current.selectedUnitIds).toEqual([])
	})

	it('submits a normal move when an Onion has no ram capacity', async () => {
		const submitAction = vi.fn().mockResolvedValue(createSnapshot({ lastEventSeq: 11 }))
		const controller = createController()
		controller.submitAction = submitAction
		const snapshot = createSnapshot({
			authoritativeState: {
				...createSnapshot().authoritativeState!,
				onions: {
					'onion-1': makeOnion({ ramsRemaining: 0 }),
				},
				defenders: createSnapshot().authoritativeState!.defenders,
			currentPhase: 'ONION_MOVE',
			turn: 3,
			},
		})

		const { result } = renderHook(() =>
			useBattlefieldInteractionState({
				activeSessionController: controller,
				activeTurnActive: true,
				clientSnapshot: snapshot,
				clientSnapshotPhase: 'ONION_MOVE',
				catalog: sessionCatalog,
				isControlledSession: true,
				isInteractionLocked: false,
				isSelectionLocked: false,
			}),
		)

		await act(async () => {
			result.current.handleSelectUnit('onion-1')
			await result.current.handleMoveUnit('onion-1', { q: 0, r: 1 })
		})

		expect(result.current.pendingRamPrompt).toBeNull()
		expect(submitAction).toHaveBeenCalledWith({
			type: 'MOVE',
			movers: ['onion-1'],
			to: { q: 0, r: 1 },
		})
	})
})