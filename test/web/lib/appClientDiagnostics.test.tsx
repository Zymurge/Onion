// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { GameClient, GameSnapshot } from '#web/lib/gameClient'
import type { GameSessionController, GameSessionViewState } from '#web/lib/gameSessionTypes'
import type { SessionBinding } from '#web/lib/sessionBinding'
import { useClientDiagnosticsReporter } from '#web/lib/appClientDiagnostics'

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_MOVE',
		scenarioName: 'Diagnostics scenario',
		turnNumber: 4,
		lastEventSeq: 10,
		victoryObjectives: [],
		...overrides,
	}
}

function createState(overrides: Partial<GameSessionViewState> = {}): GameSessionViewState {
	return {
		status: 'ready',
		catalog: null,
		snapshot: createSnapshot(),
		session: { role: 'defender' },
		liveConnection: 'connected',
		lastAppliedEventSeq: 10,
		lastAppliedEventType: 'snapshot',
		lastUpdatedAt: new Date('2026-01-01T00:00:00.000Z'),
		error: null,
		...overrides,
	}
}

function createController() {
	return {
		subscribe: vi.fn().mockReturnValue(() => undefined),
		getSnapshot: vi.fn(),
		load: vi.fn(),
		refresh: vi.fn(),
		submitAction: vi.fn(),
		abort: vi.fn(),
		dispose: vi.fn(),
	} satisfies GameSessionController
}

function createBinding(reportDiagnostic: GameClient['reportDiagnostic']): SessionBinding {
	return {
		gameId: 123,
		requestTransport: {
			getState: vi.fn(),
			submitAction: vi.fn(),
			pollEvents: vi.fn(),
			reportDiagnostic,
		},
		liveEventSource: {
			subscribe: vi.fn().mockReturnValue(() => undefined),
			connect: vi.fn(),
			disconnect: vi.fn(),
			getConnectionState: vi.fn().mockReturnValue('connected'),
		},
	}
}

function renderReporter(options: {
	binding: SessionBinding | null
	controller: GameSessionController
	state?: GameSessionViewState
	snapshotError?: string | null
}) {
	return renderHook(() => useClientDiagnosticsReporter({
		binding: options.binding,
		controller: options.controller,
		sessionState: options.state ?? createState(),
		snapshotError: options.snapshotError ?? null,
	}))
}

beforeEach(() => {
	vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'diagnostic-id') })
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('useClientDiagnosticsReporter', () => {
	it('reports CLIENT_SESSION_READY once per game with the snapshot context', async () => {
		const reportDiagnostic = vi.fn().mockResolvedValue(undefined)
		const controller = createController()
		const binding = createBinding(reportDiagnostic)
		const view = renderReporter({ binding, controller })

		await waitFor(() => expect(reportDiagnostic).toHaveBeenCalledTimes(1))
		const [gameId, diagnostic] = reportDiagnostic.mock.calls[0]
		expect(gameId).toBe(123)
		expect(diagnostic).toMatchObject({
			reportId: 'diagnostic-id',
			code: 'CLIENT_SESSION_READY',
			message: 'Client loaded an authoritative game snapshot',
			snapshot: {
				gameId: 123,
				scenarioName: 'Diagnostics scenario',
				phase: 'DEFENDER_MOVE',
				turnNumber: 4,
				lastEventSeq: 10,
			},
			client: { build: 'web-client', userAgent: navigator.userAgent },
			protocolTraffic: [],
		})

		view.rerender()
		expect(reportDiagnostic).toHaveBeenCalledTimes(1)
	})

	it('reports and aborts one invalid snapshot per game', async () => {
		const reportDiagnostic = vi.fn().mockResolvedValue(undefined)
		const controller = createController()
		const binding = createBinding(reportDiagnostic)
		const view = renderReporter({
			binding,
			controller,
			snapshotError: 'Loaded game snapshot is invalid',
		})

		await waitFor(() => expect(controller.abort).toHaveBeenCalledWith('Loaded game snapshot is invalid'))
		expect(controller.abort).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(reportDiagnostic).toHaveBeenCalledTimes(2))
		const invalidCall = reportDiagnostic.mock.calls.find(([, diagnostic]) => diagnostic.code === 'SNAPSHOT_INVALID')
		expect(invalidCall).toBeDefined()
		expect(invalidCall?.[1]).toMatchObject({
			code: 'SNAPSHOT_INVALID',
			path: 'authoritativeState',
			refreshAttempt: 0,
			message: 'Loaded game snapshot is invalid',
		})

		view.rerender()
		expect(controller.abort).toHaveBeenCalledTimes(1)
		expect(reportDiagnostic).toHaveBeenCalledTimes(2)
	})

	it('aborts invalid snapshots even when diagnostic reporting is unavailable', async () => {
		const controller = createController()
		const view = renderReporter({
			binding: createBinding(undefined),
			controller,
			snapshotError: 'Invalid authoritative state',
		})

		await waitFor(() => expect(controller.abort).toHaveBeenCalledWith('Invalid authoritative state'))
		expect(controller.abort).toHaveBeenCalledTimes(1)
		view.unmount()
	})

	it('does not report diagnostics before a ready snapshot exists', () => {
		const reportDiagnostic = vi.fn().mockResolvedValue(undefined)
		const controller = createController()

		renderReporter({
			binding: createBinding(reportDiagnostic),
			controller,
			state: createState({ status: 'loading', snapshot: null }),
		})

		expect(reportDiagnostic).not.toHaveBeenCalled()
	})

	it('swallows diagnostic submission failures after attempting the report', async () => {
		const reportDiagnostic = vi.fn().mockRejectedValue(new Error('diagnostic transport failure'))
		const controller = createController()

		renderReporter({ binding: createBinding(reportDiagnostic), controller })

		await waitFor(() => expect(reportDiagnostic).toHaveBeenCalledTimes(1))
		expect(controller.abort).not.toHaveBeenCalled()
	})
})