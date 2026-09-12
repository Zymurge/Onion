// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { GameClientSeamError, type GameSnapshot } from '#web/lib/gameClient'
import { useAppNotificationPolicy } from '#web/lib/appNotificationPolicy'

function createSnapshot(overrides: Partial<GameSnapshot> = {}): GameSnapshot {
	return {
		gameId: 123,
		phase: 'DEFENDER_MOVE',
		scenarioName: 'Notification policy scenario',
		turnNumber: 4,
		lastEventSeq: 10,
		winner: null,
		victoryObjectives: [],
		...overrides,
	}
}

function createSessionError(message: string, status?: number): GameClientSeamError {
	return new GameClientSeamError('transport', message, undefined, status)
}

function renderPolicy(initialOptions: Partial<Parameters<typeof useAppNotificationPolicy>[0]> = {}) {
	return renderHook(
		(options: Partial<Parameters<typeof useAppNotificationPolicy>[0]>) => useAppNotificationPolicy({
			activeGameId: 123,
			actionError: null,
			sessionError: null,
			snapshot: null,
			snapshotError: null,
			...options,
		}),
		{ initialProps: initialOptions },
	)
}

describe('useAppNotificationPolicy', () => {
	it('gives action errors precedence over recoverable session errors', () => {
		const { result } = renderPolicy({
			actionError: 'Failed to submit action: mock failure',
			sessionError: createSessionError('temporary session failure'),
		})

		expect(result.current.actionError).toBe('Failed to submit action: mock failure')
		expect(result.current.shouldShowActionError).toBe(true)
		expect(result.current.shouldShowSessionError).toBe(false)
	})

	it('dismisses a session error by its game, kind, status, and message key', () => {
		const sessionError = createSessionError('temporary session failure', 503)
		const { result, rerender } = renderPolicy({ sessionError })

		expect(result.current.sessionErrorKey).toBe('123:transport:503:temporary session failure')
		expect(result.current.shouldShowSessionError).toBe(true)

		act(() => {
			result.current.dismissSessionError()
		})
		expect(result.current.shouldShowSessionError).toBe(false)

		rerender()
		expect(result.current.shouldShowSessionError).toBe(false)
	})

	it('shows a later session failure after the previous error clears', () => {
		const firstError = createSessionError('first failure')
		const secondError = createSessionError('first failure')
		const { result, rerender } = renderPolicy({ sessionError: firstError })

		act(() => {
			result.current.dismissSessionError()
		})
		expect(result.current.shouldShowSessionError).toBe(false)

		rerender({ sessionError: null })
		expect(result.current.sessionErrorKey).toBeNull()

		rerender({ sessionError: secondError })
		expect(result.current.shouldShowSessionError).toBe(true)
		expect(result.current.sessionErrorKey).toContain('first failure')
})

	it('shows and dismisses game-over once per snapshot event sequence', () => {
		const { result, rerender } = renderPolicy({
			snapshot: createSnapshot({ winner: 'defender', lastEventSeq: 10 }),
		})

		expect(result.current.sessionWinner).toBe('defender')
		expect(result.current.sessionWinnerToastKey).toBe('123:10')
		expect(result.current.shouldShowGameOverToast).toBe(true)

		act(() => {
			result.current.dismissGameOverToast()
		})
		expect(result.current.shouldShowGameOverToast).toBe(false)

		rerender({ snapshot: createSnapshot({ winner: 'defender', lastEventSeq: 11 }) })
		expect(result.current.sessionWinnerToastKey).toBe('123:11')
		expect(result.current.shouldShowGameOverToast).toBe(true)
	})

	it('keeps snapshot validation failures terminal and non-dismissible', () => {
		const { result } = renderPolicy({ snapshotError: 'Loaded game snapshot is invalid' })

		expect(result.current.snapshotError).toBe('Loaded game snapshot is invalid')
		expect(result.current.snapshotErrorDismissible).toBe(false)
		expect(result.current.shouldShowSessionError).toBe(false)
		expect(result.current.shouldShowActionError).toBe(false)
	})
})