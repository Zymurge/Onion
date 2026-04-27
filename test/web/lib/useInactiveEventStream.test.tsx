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
	it('filters inactive events to the current turn window', async () => {
		const pollEvents = vi.fn().mockResolvedValue([
			createEvent({ seq: 1, type: 'FIRE_RESOLVED', timestamp: 't1', turnNumber: 2, targetId: 'onion-1', outcome: 'X' }),
			createEvent({ seq: 2, type: 'UNIT_MOVED', timestamp: 't2', turnNumber: 3, unitFriendlyName: 'The Onion 1', to: { q: 1, r: 2 } }),
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
			expect(result.current.entries).toHaveLength(1)
		})

		expect(result.current.entries[0]).toMatchObject({ seq: 2 })
	})

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

	it('builds rich inactive event summaries and details', async () => {
		const pollEvents = vi.fn().mockResolvedValue([
			createEvent({ seq: 1, type: 'PHASE_CHANGED', timestamp: 't1', turnNumber: 3, to: 'DEFENDER_MOVE' }),
			createEvent({ seq: 2, type: 'ONION_MOVED', timestamp: 't2', turnNumber: 3, unitFriendlyName: 'The Onion 1', to: { q: 1, r: 2 } }),
			createEvent({ seq: 3, type: 'UNIT_MOVED', timestamp: 't3', turnNumber: 3, unitId: 'u-2', to: { q: 4, r: 5 } }),
			createEvent({ seq: 4, type: 'FIRE_RESOLVED', timestamp: 't4', turnNumber: 3, causeId: 'combat-1', attackers: ['Alpha', 'Bravo'], targetId: 'onion-1', outcome: 'NE', odds: '2:1', roll: 6 }),
			createEvent({ seq: 5, type: 'FIRE_RESOLVED', timestamp: 't5', turnNumber: 3, causeId: 'combat-2', targetFriendlyName: 'Enemy Unit', outcome: 'X' }),
			createEvent({ seq: 6, type: 'FIRE_RESOLVED', timestamp: 't6', turnNumber: 3, causeId: 'combat-3', targetId: 'main-12', outcome: 'D' }),
			createEvent({ seq: 7, type: 'ONION_TREADS_LOST', timestamp: 't7', turnNumber: 3, causeId: 'combat-3', amount: 2, remaining: 3 }),
			createEvent({ seq: 8, type: 'MOVE_RESOLVED', timestamp: 't8', turnNumber: 3, causeId: 'ram-1', unitFriendlyName: 'Rammy', rammedUnitFriendlyNames: ['Puss 1'], destroyedUnitFriendlyNames: ['Thing'], destroyedUnitIds: ['d-1'], treadDamage: 1 }),
			createEvent({ seq: 9, type: 'UNIT_STATUS_CHANGED', timestamp: 't9', turnNumber: 3, causeId: 'ram-1', unitFriendlyName: 'Rammy', from: 'operational', to: 'destroyed' }),
			createEvent({ seq: 10, type: 'UNIT_SQUADS_LOST', timestamp: 't10', turnNumber: 3, causeId: 'ram-1', unitFriendlyName: 'Rammy', amount: 3 }),
			createEvent({ seq: 11, type: 'MOVE_RESOLVED', timestamp: 't11', turnNumber: 3, unitId: 'ram-2', rammedUnitIds: ['other-1'] }),
			createEvent({ seq: 12, type: 'ONION_BATTERY_DESTROYED', timestamp: 't12', turnNumber: 3, weaponFriendlyName: 'Ion Cannon' }),
			createEvent({ seq: 13, type: 'ONION_BATTERY_DESTROYED', timestamp: 't13', turnNumber: 3, weaponType: 'heavy_laser' }),
			createEvent({ seq: 14, type: 'UNIT_SQUADS_LOST', timestamp: 't14', turnNumber: 3, unitFriendlyName: 'Puss 1', amount: 1 }),
			createEvent({ seq: 15, type: 'UNIT_STATUS_CHANGED', timestamp: 't15', turnNumber: 3, unitId: 'u-3', from: 'operational', to: 'disabled' }),
			createEvent({ seq: 16, type: 'GAME_OVER', timestamp: 't16', turnNumber: 3, winner: 'Defender' }),
			createEvent({ seq: 17, type: 'GAME_OVER', timestamp: 't17', turnNumber: 3 }),
			createEvent({ seq: 18, type: 'CUSTOM_EVENT', timestamp: 't18', turnNumber: 3, summary: 'Already summarized' }),
			createEvent({ seq: 19, type: 'CUSTOM_UNKNOWN', timestamp: 't19', turnNumber: 3 }),
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
			expect(result.current.entries.length).toBeGreaterThan(0)
		})

		expect(result.current.entries.map((entry) => entry.summary)).toEqual(
			expect.arrayContaining([
				'Move by The Onion 1',
				'Move by u-2',
				'Fire on onion-1: missed',
				'Fire on Enemy Unit: destroyed',
				'Fire on main-12: missed',
				'Ram on Puss 1 - destroyed',
				'Ram on other-1 - survived',
				'Game over: Defender wins',
				'Game over',
				'Already summarized',
				'custom unknown',
			]),
		)

		const ramEntry = result.current.entries.find((entry) => entry.summary === 'Ram on other-1 - survived')
		expect(ramEntry?.details).toEqual(
			expect.arrayContaining([
				'Unit: ram-2',
				'Target: other-1',
				'Result: survived',
				'Battery destroyed: Ion Cannon',
				'Battery destroyed: Heavy laser',
				'Squads lost for Puss 1: 1',
				'Unit: u-3: operational → disabled',
			]),
		)

		const destroyedRamEntry = result.current.entries.find((entry) => entry.summary === 'Ram on Puss 1 - destroyed')
		expect(destroyedRamEntry?.details).toEqual(
			expect.arrayContaining(['Unit: Rammy: operational → destroyed', 'Squads lost for Rammy: 3']),
		)
	})

	it('formats standalone inactive events and structured detail values', async () => {
		const pollEvents = vi.fn().mockResolvedValue([
			createEvent({ seq: 1, type: 'PHASE_CHANGED', timestamp: 't1', turnNumber: 3, to: 'DEFENDER_MOVE' }),
			createEvent({ seq: 2, type: 'UNIT_STATUS_CHANGED', timestamp: 't2', turnNumber: 3, unitFriendlyName: 'Puss 1', from: 'operational', to: 'disabled' }),
			createEvent({ seq: 3, type: 'UNIT_SQUADS_LOST', timestamp: 't3', turnNumber: 3, unitId: 'u-4', amount: '3' }),
			createEvent({ seq: 4, type: 'ONION_BATTERY_DESTROYED', timestamp: 't4', turnNumber: 3, weaponType: 'heavy_laser' }),
			createEvent({ seq: 5, type: 'UNIT_MOVED', timestamp: 't5', turnNumber: 3, unitId: 'u-5', to: { foo: 'bar', nested: { baz: 'qux' } } }),
			createEvent({ seq: 6, type: 'FIRE_RESOLVED', timestamp: 't6', turnNumber: 3, causeId: 'combat-5', attackers: ['Alpha', { name: 'Bravo' }], targetFriendlyName: 'Enemy Unit', odds: { left: 1, right: 2 }, roll: null, outcome: 'D' }),
			createEvent({ seq: 7, type: 'FIRE_RESOLVED', timestamp: 't7', turnNumber: 3, targetId: 'main-1', outcome: 'D' }),
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
			expect(result.current.entries).toHaveLength(6)
		})

		expect(result.current.entries.map((entry) => entry.summary)).toEqual(
			expect.arrayContaining([
				'Unit: Puss 1: operational → disabled',
				'unit squads lost',
				'The Onion lost the Heavy laser battery',
				'Move by u-5',
				'Fire on Enemy Unit: disabled',
				'Fire on main-1: no effect',
			]),
		)

		const moveEntry = result.current.entries.find((entry) => entry.summary === 'Move by u-5')
		expect(moveEntry?.details).toEqual(expect.arrayContaining(['u-5 moved to foo: bar, nested: baz: qux']))
		const combatEntry = result.current.entries.find((entry) => entry.summary === 'Fire on Enemy Unit: disabled')
		expect(combatEntry?.details).toEqual(
			expect.arrayContaining([
				'Attackers: Alpha, name: Bravo',
				'Target: Enemy Unit',
				'Roll: —',
				'Outcome: disabled',
				'Odds: left: 1, right: 2',
			]),
		)
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