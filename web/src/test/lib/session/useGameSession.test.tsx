// @vitest-environment jsdom

import { StrictMode } from 'react'

import { act, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { GameSessionController, GameSessionViewState } from '../../../lib/gameSessionTypes'
import { useGameSession } from '../../../lib/useGameSession'

function createState(overrides: Partial<GameSessionViewState> = {}): GameSessionViewState {
	return {
		status: 'idle',
		snapshot: null,
		session: null,
		liveConnection: 'idle',
		lastAppliedEventSeq: null,
		lastAppliedEventType: null,
		lastUpdatedAt: null,
		error: null,
		...overrides,
	}
}

function createController(initialState = createState()) {
	let state = initialState
	const listeners = new Map<(state: GameSessionViewState) => void, () => void>()

	const controller: GameSessionController & { setState(nextState: GameSessionViewState): void } = {
		subscribe(listener) {
			const notify = () => {
				listener(state)
			}
			listeners.set(listener, notify)
			return () => {
				listeners.delete(listener)
			}
		},
		getSnapshot() {
			return state
		},
		load: vi.fn().mockResolvedValue(undefined),
		refresh: vi.fn().mockResolvedValue(undefined),
		submitAction: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		setState(nextState) {
			state = nextState
			for (const listener of listeners.values()) {
				listener()
			}
		},
	}

	return controller
}

function TestHarness({ controller }: { controller: GameSessionController }) {
	const state = useGameSession(controller)
	return <div>{state.status}</div>
}

describe('useGameSession', () => {
	it('auto-loads the controller, renders updates, and disposes on unmount', async () => {
		const controller = createController()
		const view = render(<TestHarness controller={controller} />)

		await waitFor(() => {
			expect(controller.load).toHaveBeenCalledTimes(1)
		})
		expect(screen.getByText('idle')).not.toBeNull()

		await act(async () => {
			controller.setState(createState({ status: 'ready' }))
		})
		await waitFor(() => {
			expect(screen.getByText('ready')).not.toBeNull()
		})

		view.unmount()
		await waitFor(() => {
			expect(controller.dispose).toHaveBeenCalledTimes(1)
		})
	})

	it('does not dispose the active controller during StrictMode effect replay', async () => {
		const controller = createController()
		const view = render(
			<StrictMode>
				<TestHarness controller={controller} />
			</StrictMode>,
		)

		await waitFor(() => {
			expect(controller.load).toHaveBeenCalled()
		})

		await act(async () => {
			await Promise.resolve()
		})

		expect(controller.dispose).toHaveBeenCalledTimes(0)

		view.unmount()

		await waitFor(() => {
			expect(controller.dispose).toHaveBeenCalledTimes(1)
		})
	})
})