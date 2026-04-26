// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useInactiveEventStream } from '#web/lib/useInactiveEventStream'
import type { GameEvent } from '#web/lib/gameClient'

function createEvent(overrides: Partial<GameEvent> & { seq: number; type: string; timestamp: string; turnNumber: number }): GameEvent {
	return {
		seq: overrides.seq,
		type: overrides.type,
		timestamp: overrides.timestamp,
		turnNumber: overrides.turnNumber,
		...overrides,
	}
}

describe('useInactiveEventStream', () => {
	it('groups inactive events into timeline entries and supports clearing them', async () => {
		const pollEvents = vi.fn().mockResolvedValue([
			createEvent({ seq: 1, type: 'PHASE_CHANGED', timestamp: 't1', turnNumber: 3, to: 'DEFENDER_MOVE' }),
			createEvent({
				seq: 2,
				type: 'MOVE_RESOLVED',
				timestamp: 't2',
				turnNumber: 3,
				unitFriendlyName: 'The Onion 1',
				rammedUnitFriendlyNames: ['Puss 1'],
				destroyedUnitIds: ['def-1'],
				treadDamage: 1,
			}),
			createEvent({
				seq: 3,
				type: 'UNIT_STATUS_CHANGED',
				timestamp: 't3',
				turnNumber: 3,
				unitFriendlyName: 'Puss 1',
				from: 'operational',
				to: 'destroyed',
			}),
			createEvent({
				seq: 4,
				type: 'UNIT_SQUADS_LOST',
				timestamp: 't4',
				turnNumber: 3,
				unitFriendlyName: 'Puss 1',
				amount: 1,
			}),
			createEvent({
				seq: 5,
				type: 'FIRE_RESOLVED',
				timestamp: 't5',
				turnNumber: 3,
				targetId: 'onion-1',
				targetFriendlyName: 'The Onion',
				outcome: 'D',
				odds: '2:1',
				roll: 5,
			}),
		])

		const { result } = renderHook(() =>
			useInactiveEventStream({
				activeGameId: 123,
				activeTurnActive: false,
				currentTurnNumber: 3,
				lastAppliedEventSeq: 10,
				pollEvents,
			}),
		)

		await waitFor(() => {
			expect(pollEvents).toHaveBeenCalledWith(123, 0)
			expect(result.current.entries).toHaveLength(2)
		})

		expect(result.current.entries[0]).toMatchObject({
			summary: 'Ram on Puss 1 - destroyed',
			details: expect.arrayContaining(['Unit: The Onion 1', 'Target: Puss 1', 'Result: destroyed']),
		})
		expect(result.current.entries[1]).toMatchObject({
			summary: 'Fire on The Onion: no effect',
			tone: 'normal',
		})

		act(() => {
			result.current.clearEntries()
		})
		expect(result.current.entries).toEqual([])
		expect(result.current.isDismissed).toBe(true)

		act(() => {
			result.current.clearErrorMessage()
		})
		expect(result.current.errorMessage).toBeNull()
	})

	it('reports an error when polling inactive events fails', async () => {
		const pollEvents = vi.fn().mockRejectedValue(new Error('network down'))
		const { result } = renderHook(() =>
			useInactiveEventStream({
				activeGameId: 123,
				activeTurnActive: false,
				currentTurnNumber: 3,
				lastAppliedEventSeq: 10,
				pollEvents,
			}),
		)

		await waitFor(() => {
			expect(result.current.errorMessage).toBe('Unable to refresh inactive events.')
		})
		expect(result.current.isLoading).toBe(false)
	})

	it('resets and reloads when the active game id changes', async () => {
		const pollEvents = vi
			.fn()
			.mockResolvedValueOnce([
				createEvent({ seq: 2, type: 'UNIT_MOVED', timestamp: 't2', turnNumber: 3, unitFriendlyName: 'The Onion 1', to: { q: 1, r: 1 } }),
			])
			.mockResolvedValueOnce([
				createEvent({ seq: 8, type: 'UNIT_MOVED', timestamp: 't8', turnNumber: 3, unitFriendlyName: 'The Onion 1', to: { q: 2, r: 2 } }),
			])

		const { result, rerender } = renderHook(
			({ gameId }) =>
				useInactiveEventStream({
					activeGameId: gameId,
					activeTurnActive: false,
					currentTurnNumber: 3,
					lastAppliedEventSeq: 10,
					pollEvents,
				}),
			{ initialProps: { gameId: 123 } },
		)

		await waitFor(() => {
			expect(result.current.entries).toHaveLength(1)
			expect(result.current.entries[0].summary).toBe('Move by The Onion 1')
		})

		rerender({ gameId: 456 })

		await waitFor(() => {
			expect(pollEvents).toHaveBeenCalledWith(456, 0)
			expect(result.current.entries).toHaveLength(1)
			expect(result.current.entries[0].summary).toBe('Move by The Onion 1')
		})
	})

	it('stays idle while the active turn is still live', async () => {
		const pollEvents = vi.fn().mockResolvedValue([])
		const { result } = renderHook(() =>
			useInactiveEventStream({
				activeGameId: 123,
				activeTurnActive: true,
				currentTurnNumber: 3,
				lastAppliedEventSeq: 10,
				pollEvents,
			}),
		)

		expect(pollEvents).not.toHaveBeenCalled()
		expect(result.current.entries).toEqual([])
		expect(result.current.isLoading).toBe(false)
	})
})