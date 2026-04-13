// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import { useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createFakeGameBackend } from '#web/lib/fakeGameBackend'
import { createGameSessionController } from '#web/lib/gameSessionController'
import type { GameSnapshot, GameSessionContext } from '#web/lib/gameClient'
import { useGameSession } from '#web/lib/useGameSession'

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		selectedUnitId: 'dragon-7',
		mode: 'fire',
		scenarioName: 'Fake Test Scenario',
		turnNumber: 1,
		lastEventSeq: 47,
		...overrides,
	}
}

function SessionHarness(props: {
	backend: ReturnType<typeof createFakeGameBackend>
	gameId: number
}) {
	const controller = useMemo(() => {
		return createGameSessionController({
			gameId: props.gameId,
			requestTransport: props.backend.requestTransport,
			liveEventSource: props.backend.liveEventSource,
			liveRefreshQuietWindowMs: 5,
		})
	}, [props.backend, props.gameId])

	const state = useGameSession(controller)

	return (
		<section aria-label="session-shell">
			<div data-testid="status">{state.status}</div>
			<div data-testid="phase">{state.snapshot?.phase ?? 'none'}</div>
			<div data-testid="connection">{state.liveConnection}</div>
			<div data-testid="sequence">{state.lastAppliedEventSeq ?? 'none'}</div>
			<div data-testid="scenario">{state.snapshot?.scenarioName ?? 'none'}</div>
			<div data-testid="error">{state.error?.message ?? 'none'}</div>
		</section>
	)
}

describe('App fake backend live refresh slice', () => {
	it('applies a live refresh hint and records the fake signal stream', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 47,
				scenarioName: 'Refresh baseline snapshot',
			}),
			session,
		})

		render(<SessionHarness backend={backend} gameId={123} />)

		await waitFor(() => {
			expect(screen.getByTestId('status').textContent).toBe('ready')
		})
		expect(screen.getByTestId('phase').textContent).toBe('DEFENDER_COMBAT')

		const refreshDelayMs = 5
		vi.useFakeTimers()
		try {
		backend.queueRefresh(
			createSnapshot({
				phase: 'ONION_MOVE',
				lastEventSeq: 48,
				scenarioName: 'Refreshed fake snapshot',
			}),
			session,
		)

		backend.emitLiveSignal({
			kind: 'event',
			gameId: 123,
			eventSeq: 48,
			eventType: 'PHASE_CHANGED',
		})

		await act(async () => {
			await vi.advanceTimersByTimeAsync(refreshDelayMs)
		})

		expect(screen.getByTestId('phase').textContent).toBe('ONION_MOVE')
		expect(screen.getByTestId('sequence').textContent).toBe('48')
		expect(screen.getByTestId('scenario').textContent).toBe('Refreshed fake snapshot')

		expect(backend.getEmittedSignals().some((signal) => signal.kind === 'event' && signal.eventSeq === 48)).toBe(true)
		expect(backend.getCurrentSnapshot().phase).toBe('ONION_MOVE')
		} finally {
			vi.useRealTimers()
		}
	})

	it('surfaces a transient refresh failure and recovers on the next fake refresh', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 50,
				scenarioName: 'Recovery baseline snapshot',
			}),
			session,
		})

		render(<SessionHarness backend={backend} gameId={123} />)

		await waitFor(() => {
			expect(screen.getByTestId('status').textContent).toBe('ready')
		})
		expect(screen.getByTestId('phase').textContent).toBe('DEFENDER_COMBAT')

		const refreshDelayMs = 5
		vi.useFakeTimers()
		try {
		backend.failNextRefreshWith(new Error('temporary refresh failure'))

		backend.emitLiveSignal({
			kind: 'event',
			gameId: 123,
			eventSeq: 51,
			eventType: 'PHASE_CHANGED',
		})

		await act(async () => {
			await vi.advanceTimersByTimeAsync(refreshDelayMs)
		})

		expect(screen.getByTestId('status').textContent).toBe('error')
		expect(screen.getByTestId('error').textContent).toBe('temporary refresh failure')

		backend.clear()

		backend.queueRefresh(
			createSnapshot({
				phase: 'ONION_MOVE',
				lastEventSeq: 52,
				scenarioName: 'Recovered fake snapshot',
			}),
			session,
		)
		backend.emitLiveSignal({
			kind: 'event',
			gameId: 123,
			eventSeq: 52,
			eventType: 'PHASE_CHANGED',
		})

		await act(async () => {
			await vi.advanceTimersByTimeAsync(refreshDelayMs)
		})

		expect(screen.getByTestId('status').textContent).toBe('ready')
		expect(screen.getByTestId('phase').textContent).toBe('ONION_MOVE')
		expect(screen.getByTestId('error').textContent).toBe('none')

		expect(backend.getEmittedSignals().some((signal) => signal.kind === 'event' && signal.eventSeq === 52)).toBe(true)
		expect(backend.getCurrentSnapshot().phase).toBe('ONION_MOVE')
		} finally {
			vi.useRealTimers()
		}
	})
})
