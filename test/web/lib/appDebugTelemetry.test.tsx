// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAppDebugTelemetry } from '#web/lib/appDebugTelemetry'

const { debug } = vi.hoisted(() => ({ debug: vi.fn() }))

vi.mock('#web/lib/logger', () => ({
	default: { debug, info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

function createInputs(overrides: Record<string, unknown> = {}) {
	return {
		display: {
			phaseAdvanceLabel: 'Advance to defender movement',
		},
		gate: {
			controlsLocked: false,
			screenLocked: false,
			inactiveEventWindowVisible: false,
		},
		inactiveEventStream: {
			entries: [],
			isDismissed: false,
		},
		session: {
			activeGameId: 123,
			state: {
				lastAppliedEventSeq: 10,
				lastAppliedEventType: 'snapshot',
				liveConnection: 'connected',
			},
			turn: {
				activeOwner: 'onion',
				phase: 'ONION_MOVE',
				role: 'onion',
				isActive: true,
			},
		},
		...overrides,
	}
}

function messagesFor(message: string) {
	return debug.mock.calls.filter(([entry]) => entry === message)
}

beforeEach(() => {
	debug.mockReset()
	vi.spyOn(Date, 'now').mockReturnValue(1_000)
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('useAppDebugTelemetry', () => {
	it('logs one initial reload and one initial turn transition with consistent timestamps', () => {
		renderHook(() => useAppDebugTelemetry(createInputs()))

		const reload = messagesFor('[app-debug] session reload')
		const transition = messagesFor('[app-debug] turn state transition')
		expect(reload).toHaveLength(1)
		expect(transition).toHaveLength(1)
		expect(reload[0][1]).toMatchObject({ ts: 1_000, deltaMs: null })
		expect(transition[0][1]).toMatchObject({ ts: 1_000, deltaMs: null })
		expect(transition[0][1].atMs).toBeUndefined()
	})

	it('does not log unchanged rerenders and logs each changed state once', () => {
		const initial = createInputs()
		const view = renderHook(
			(inputs: ReturnType<typeof createInputs>) => useAppDebugTelemetry(inputs),
			{ initialProps: initial },
		)

		view.rerender(createInputs())
		expect(messagesFor('[app-debug] session reload')).toHaveLength(1)
		expect(messagesFor('[app-debug] turn state transition')).toHaveLength(1)

		view.rerender(createInputs({
			session: {
				...initial.session,
				state: { ...initial.session.state, lastAppliedEventSeq: 11, lastAppliedEventType: 'event' },
			},
			gate: { ...initial.gate, controlsLocked: true, screenLocked: true, inactiveEventWindowVisible: true },
			inactiveEventStream: { entries: [{ type: 'FIRE_RESOLVED' }], isDismissed: false },
		}))

		expect(messagesFor('[app-debug] session reload')).toHaveLength(2)
		expect(messagesFor('[app-debug] turn state transition')).toHaveLength(2)
	})

	it('retains the prior state and current diagnostic fields in transition payloads', () => {
		const initial = createInputs()
		const view = renderHook(
			(inputs: ReturnType<typeof createInputs>) => useAppDebugTelemetry(inputs),
			{ initialProps: initial },
		)
		vi.spyOn(Date, 'now').mockReturnValue(1_250)
		view.rerender(createInputs({
			session: {
				...initial.session,
				turn: { ...initial.session.turn, phase: 'DEFENDER_MOVE', role: 'defender', activeOwner: 'defender', isActive: false },
				state: { ...initial.session.state, lastAppliedEventSeq: 12, lastAppliedEventType: 'phase-changed', liveConnection: 'reconnecting' },
			},
			gate: { controlsLocked: true, screenLocked: false, inactiveEventWindowVisible: true },
			display: { phaseAdvanceLabel: 'Advance to defender combat' },
			inactiveEventStream: { entries: [{ type: 'PHASE_CHANGED' }, { type: 'FIRE_RESOLVED' }], isDismissed: true },
		}))

		const reloadPayload = messagesFor('[app-debug] session reload')[1][1]
		const transitionPayload = messagesFor('[app-debug] turn state transition')[1][1]
		expect(reloadPayload).toMatchObject({
			ts: 1_250,
			deltaMs: 250,
			previous: expect.objectContaining({ lastAppliedEventSeq: 10, liveConnection: 'connected' }),
			current: expect.objectContaining({ lastAppliedEventSeq: 12, lastAppliedEventType: 'phase-changed', liveConnection: 'reconnecting' }),
		})
		expect(transitionPayload).toMatchObject({
			ts: 1_250,
			deltaMs: 250,
			previous: expect.objectContaining({ sessionPhase: 'ONION_MOVE', sessionRole: 'onion' }),
			current: expect.objectContaining({
				sessionPhase: 'DEFENDER_MOVE',
				sessionRole: 'defender',
				inactiveEntryCount: 2,
				inactiveDismissed: true,
				lastAppliedEventSeq: 12,
				phaseAdvanceLabel: 'Advance to defender combat',
			}),
		})
	})

	it('does not write telemetry when browser globals are unavailable', () => {
		const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
		Object.defineProperty(globalThis, 'window', { configurable: true, value: undefined })

		try {
			function TelemetryProbe() {
				useAppDebugTelemetry(createInputs())
				return createElement('div')
			}

			renderToString(createElement(TelemetryProbe))
			expect(debug).not.toHaveBeenCalled()
		} finally {
			if (windowDescriptor === undefined) {
				Reflect.deleteProperty(globalThis, 'window')
			} else {
				Object.defineProperty(globalThis, 'window', windowDescriptor)
			}
		}
	})
})