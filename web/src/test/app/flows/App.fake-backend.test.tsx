// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useMemo } from 'react'
import { describe, expect, it, vi } from 'vitest'

import App from '../../../App'
import { createFakeGameBackend } from '../../../lib/fakeGameBackend'
import { createGameSessionController } from '../../../lib/gameSessionController'
import { createGameClient, type GameSnapshot, type GameSessionContext } from '../../../lib/gameClient'
import type { GameState } from '../../../../../src/types/index'
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

function createAppShellSnapshot(): GameSnapshot & {
	authoritativeState: GameState
	scenarioMap: { width: number; height: number; hexes: Array<{ q: number; r: number; t: number }> }
} {
	return {
		...createSnapshot({
			phase: 'DEFENDER_COMBAT',
			lastEventSeq: 80,
			scenarioName: 'App shell baseline snapshot',
			selectedUnitId: 'wolf-2',
		}),
		authoritativeState: {
			onion: {
				id: 'onion-1',
				type: 'TheOnion',
				position: { q: 0, r: 1 },
				treads: 33,
				status: 'operational',
				weapons: [
					{
						id: 'main-1',
						name: 'Main Battery',
						attack: 4,
						range: 4,
						defense: 4,
						status: 'ready',
						individuallyTargetable: true,
					},
				],
				batteries: {
					main: 1,
					secondary: 0,
					ap: 0,
				},
			},
			defenders: {
				'wolf-2': {
					id: 'wolf-2',
					type: 'BigBadWolf',
					position: { q: 6, r: 6 },
					status: 'operational',
					weapons: [
						{
							id: 'main',
							name: 'Main Gun',
							attack: 4,
							range: 2,
							defense: 2,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
				'puss-1': {
					id: 'puss-1',
					type: 'Puss',
					position: { q: 6, r: 4 },
					status: 'operational',
					weapons: [
						{
							id: 'main',
							name: 'Main Gun',
							attack: 4,
							range: 2,
							defense: 3,
							status: 'ready',
							individuallyTargetable: false,
						},
					],
				},
			},
			ramsThisTurn: 0,
		},
		movementRemainingByUnit: {
			'onion-1': 0,
			'wolf-2': 4,
			'puss-1': 3,
		},
		scenarioMap: {
			width: 8,
			height: 8,
			hexes: [
				{ q: 0, r: 0, t: 0 },
				{ q: 1, r: 0, t: 0 },
				{ q: 2, r: 0, t: 0 },
				{ q: 3, r: 0, t: 0 },
				{ q: 4, r: 0, t: 0 },
				{ q: 5, r: 0, t: 0 },
				{ q: 6, r: 0, t: 0 },
				{ q: 7, r: 0, t: 0 },
			],
		},
	}
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

	it('reconnects and still applies a later live refresh through the fake backend', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createSnapshot({
				phase: 'DEFENDER_COMBAT',
				lastEventSeq: 70,
				scenarioName: 'Reconnect baseline snapshot',
			}),
			session,
		})

		render(<SessionHarness backend={backend} gameId={123} />)

		await waitFor(() => {
			expect(screen.getByTestId('status').textContent).toBe('ready')
		})
		expect(screen.getByTestId('connection').textContent).toBe('connected')

		vi.useFakeTimers()
		try {
			act(() => {
				backend.liveEventSource.disconnect(123)
			})
			expect(screen.getByTestId('connection').textContent).toBe('disconnected')

			backend.queueRefresh(
				createSnapshot({
					phase: 'ONION_MOVE',
					lastEventSeq: 71,
					scenarioName: 'Reconnect refreshed snapshot',
				}),
				session,
			)

			act(() => {
				backend.liveEventSource.connect(123)
			})

			await act(async () => {
				await vi.advanceTimersByTimeAsync(1)
			})
			expect(screen.getByTestId('connection').textContent).toBe('connected')

			act(() => {
				backend.emitLiveSignal({
					kind: 'event',
					gameId: 123,
					eventSeq: 71,
					eventType: 'PHASE_CHANGED',
				})
			})

			await act(async () => {
				await vi.advanceTimersByTimeAsync(5)
			})

			expect(screen.getByTestId('phase').textContent).toBe('ONION_MOVE')
			expect(screen.getByTestId('sequence').textContent).toBe('71')
			expect(screen.getByTestId('scenario').textContent).toBe('Reconnect refreshed snapshot')
		} finally {
			vi.useRealTimers()
		}
	})

	it('wires App shell actions through the fake backend request transport', async () => {
		const session: GameSessionContext = { role: 'defender' }
		const backend = createFakeGameBackend({
			initialSnapshot: createAppShellSnapshot(),
			session,
		})
		const client = createGameClient(backend.requestTransport)
		const user = userEvent.setup()

		render(<App gameClient={client} gameId={123} />)

		await waitFor(() => {
			expect(screen.getByText(/App shell baseline snapshot/i)).not.toBeNull()
			expect(screen.getByTestId('hex-unit-wolf-2').getAttribute('data-selected')).toBe('true')
		})

		await user.click(screen.getByRole('button', { name: /toggle debug diagnostics/i }))
		await user.click(screen.getByRole('button', { name: /advance phase/i }))

		await waitFor(() => {
			expect(backend.getSubmittedActions()).toContainEqual({
				gameId: 123,
				action: { type: 'end-phase' },
			})
		})
	})
})
