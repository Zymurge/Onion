// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import { useMemo } from 'react'
import { describe, expect, it } from 'vitest'

import { createFakeGameBackend } from '../../../lib/fakeGameBackend'
import { createGameSessionController } from '../../../lib/gameSessionController'
import type { GameSnapshot, GameSessionContext } from '../../../lib/gameClient'
import { useGameSession } from '../../../lib/useGameSession'

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_COMBAT',
		selectedUnitId: 'dragon-7',
		mode: 'fire',
		scenarioName: 'Fake Test Scenario',
		turnNumber: 1,
		lastEventSeq: 1,
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

describe('App fake backend vertical slice', () => {
	it('loads the initial snapshot and reports live connection state', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 47,
				scenarioName: 'Initial fake backend snapshot',
			}),
			session,
		})

		render(<SessionHarness backend={backend} gameId={123} />)

		await waitFor(() => {
			expect(screen.getByTestId('status').textContent).toBe('ready')
		})

		await waitFor(() => {
			expect(screen.getByTestId('phase').textContent).toBe('DEFENDER_COMBAT')
			expect(screen.getByTestId('connection').textContent).toBe('connected')
			expect(screen.getByTestId('sequence').textContent).toBe('47')
			expect(screen.getByTestId('scenario').textContent).toBe('Initial fake backend snapshot')
		})

		expect(backend.getEmittedSignals().some((signal) => signal.kind === 'connection')).toBe(true)
		expect(backend.getEmittedSignals().some((signal) => signal.kind === 'connection' && signal.status === 'connected')).toBe(true)
	})

	it('tracks live connection transitions through the fake source', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 61,
				scenarioName: 'Connection transition snapshot',
			}),
			session,
		})

		render(<SessionHarness backend={backend} gameId={123} />)

		await waitFor(() => {
			expect(screen.getByTestId('status').textContent).toBe('ready')
		})

		expect(screen.getByTestId('connection').textContent).toBe('connected')

		act(() => {
			backend.liveEventSource.disconnect(123)
		})

		expect(screen.getByTestId('connection').textContent).toBe('disconnected')

		act(() => {
			backend.liveEventSource.connect(123)
		})

		await waitFor(() => {
			expect(screen.getByTestId('connection').textContent).toBe('connected')
		})
		expect(backend.getEmittedSignals().filter((signal) => signal.kind === 'connection').length).toBeGreaterThanOrEqual(3)
	})
})
