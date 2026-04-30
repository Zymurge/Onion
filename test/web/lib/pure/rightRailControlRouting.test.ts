import { describe, expect, it, vi } from 'vitest'

import { resolveRightRailControlDecision, routeRightRailControl, type RightRailControlRequest } from '#web/lib/rightRailControlRouting'

function createRequest(overrides: Partial<RightRailControlRequest> = {}): RightRailControlRequest {
	return {
		surface: 'right-rail',
		control: 'confirm-combat',
		enabled: true,
		...overrides,
	}
}

describe('rightRailControlRouting', () => {
	it.each([
		['confirm combat routes when enabled', createRequest({ control: 'confirm-combat' }), { intent: 'confirm-combat', reason: 'right-rail-control-confirm-combat' }],
		['attempt ram routes when enabled', createRequest({ control: 'attempt-ram' }), { intent: 'attempt-ram', reason: 'right-rail-control-attempt-ram' }],
		['decline ram routes when enabled', createRequest({ control: 'decline-ram' }), { intent: 'decline-ram', reason: 'right-rail-control-decline-ram' }],
		['select all routes when enabled', createRequest({ control: 'select-all-stack-members' }), { intent: 'select-all-stack-members', reason: 'right-rail-control-select-all-stack-members' }],
		['clear selection routes when enabled', createRequest({ control: 'clear-stack-selection' }), { intent: 'clear-stack-selection', reason: 'right-rail-control-clear-stack-selection' }],
		['disabled right rail control becomes noop', createRequest({ control: 'confirm-combat', enabled: false }), { intent: 'noop', reason: 'right-rail-control-disabled' }],
	])('%s', (_, request, expectedDecision) => {
		expect(resolveRightRailControlDecision(request)).toEqual(expectedDecision)
	})

	it('emits a trace with the request and decision', () => {
		const request = createRequest({ control: 'clear-stack-selection' })
		const onTrace = vi.fn()

		const decision = routeRightRailControl(request, onTrace)

		expect(decision).toEqual({ intent: 'clear-stack-selection', reason: 'right-rail-control-clear-stack-selection' })
		expect(onTrace).toHaveBeenCalledTimes(1)
		expect(onTrace).toHaveBeenCalledWith({ request, decision })
	})
})