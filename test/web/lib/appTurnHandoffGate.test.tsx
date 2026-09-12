// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useTurnHandoffGate } from '#web/lib/appTurnHandoffGate'
import type { GameSessionController, GameSessionViewState } from '#web/lib/gameSessionTypes'

function createController(): GameSessionController & { abort: ReturnType<typeof vi.fn> } {
	return {
		subscribe: vi.fn().mockReturnValue(() => undefined),
		getSnapshot: vi.fn((): GameSessionViewState => ({
			status: 'ready',
			catalog: null,
			snapshot: null,
			session: null,
			liveConnection: 'idle',
			lastAppliedEventSeq: null,
			lastAppliedEventType: null,
			lastUpdatedAt: null,
			error: null,
		})),
		load: vi.fn().mockResolvedValue(undefined),
		refresh: vi.fn().mockResolvedValue(undefined),
		submitAction: vi.fn().mockResolvedValue(null),
		abort: vi.fn(),
		dispose: vi.fn(),
	}
}

function createStream(entries: ReadonlyArray<{ type: string }> = []) {
	return {
		entries,
		errorMessage: null,
		isLoading: false,
		isDismissed: false,
		clearEntries: vi.fn(),
		clearErrorMessage: vi.fn(),
	}
}

function activeTurn() {
	return {
		phase: 'ONION_MOVE' as const,
		number: 4,
		role: 'onion' as const,
		activeOwner: 'onion' as const,
		isKnown: true,
		isLifecycleActive: true,
		isActive: true,
	}
}

describe('useTurnHandoffGate', () => {
	it('locks controls and shows the event window while the player is inactive', () => {
		const inactiveStream = createStream([{ type: 'FIRE_RESOLVED' }])
		const { result } = renderHook(() => useTurnHandoffGate({
			activeGameId: 123,
			controller: createController(),
			inactiveEventStream: inactiveStream,
			sessionStatus: 'ready',
			turn: { ...activeTurn(), isActive: false },
		}))

		expect(result.current.inactiveEventWindowVisible).toBe(true)
		expect(result.current.controlsLocked).toBe(true)
		expect(result.current.screenLocked).toBe(false)
		expect(result.current.acknowledgementPending).toBe(false)
	})

	it('requires acknowledgement before unlocking an active turn', async () => {
		const inactiveStream = createStream([{ type: 'FIRE_RESOLVED' }])
		const { result } = renderHook(() => useTurnHandoffGate({
			activeGameId: 123,
			controller: createController(),
			inactiveEventStream: inactiveStream,
			sessionStatus: 'ready',
			turn: activeTurn(),
		}))

		await waitFor(() => {
			expect(result.current.acknowledgementPending).toBe(true)
		})
		expect(result.current.inactiveEventWindowVisible).toBe(true)
		expect(result.current.controlsLocked).toBe(true)
		expect(result.current.screenLocked).toBe(true)
		expect(result.current.currentActiveTurnKey).toBe('123:4:onion')

		act(() => {
			result.current.acknowledgeCurrentTurn()
		})

		expect(inactiveStream.clearEntries).toHaveBeenCalledTimes(1)
		expect(result.current.acknowledgementPending).toBe(false)
		expect(result.current.inactiveEventWindowVisible).toBe(false)
		expect(result.current.controlsLocked).toBe(false)
		expect(result.current.screenLocked).toBe(false)
	})

	it('requires a new acknowledgement when the active turn key changes', async () => {
		const inactiveStream = createStream()
		const { result, rerender } = renderHook(
			(props: { turnNumber: number }) => useTurnHandoffGate({
				activeGameId: 123,
				controller: createController(),
				inactiveEventStream: inactiveStream,
				sessionStatus: 'ready',
				turn: { ...activeTurn(), number: props.turnNumber },
			}),
			{ initialProps: { turnNumber: 4 } },
		)

		await waitFor(() => {
			expect(result.current.acknowledgementPending).toBe(true)
		})
		act(() => {
			result.current.acknowledgeCurrentTurn()
		})
		expect(result.current.acknowledgementPending).toBe(false)

		rerender({ turnNumber: 5 })
		await waitFor(() => {
			expect(result.current.acknowledgementPending).toBe(true)
		})
		expect(result.current.currentActiveTurnKey).toBe('123:5:onion')
	})

	it('keeps controls locked for completed or aborted lifecycle states', () => {
		const controller = createController()
		const { result } = renderHook(() => useTurnHandoffGate({
			activeGameId: 123,
			controller,
			inactiveEventStream: createStream(),
			sessionStatus: 'aborted',
			turn: { ...activeTurn(), isLifecycleActive: false },
		}))

		expect(result.current.controlsLocked).toBe(true)
		expect(result.current.screenLocked).toBe(false)
	})

	it('aborts the controller when a remote GAME_ABORTED entry arrives', async () => {
		const controller = createController()
		const { result, rerender } = renderHook(
			(props: { entries: ReadonlyArray<{ type: string }> }) => useTurnHandoffGate({
				activeGameId: 123,
				controller,
				inactiveEventStream: createStream(props.entries),
				sessionStatus: 'ready',
				turn: activeTurn(),
			}),
			{ initialProps: { entries: [] } },
		)

		rerender({ entries: [{ type: 'GAME_ABORTED' }] })
		await waitFor(() => {
			expect(controller.abort).toHaveBeenCalledWith('The game was aborted because a client reported an invalid snapshot.')
		})
		expect(controller.abort).toHaveBeenCalledTimes(1)
		expect(result.current.controlsLocked).toBe(true)
	})
})