import { describe, expect, it, vi } from 'vitest'

import { resolveShellControlDecision, routeShellControl, type ShellControlRequest } from '#web/lib/shellControlRouting'

function createRequest(overrides: Partial<ShellControlRequest> = {}): ShellControlRequest {
	return {
		surface: 'header/control',
		control: 'refresh-session',
		enabled: true,
		...overrides,
	}
}

describe('shellControlRouting', () => {
	it.each([
		['refresh-session routes when enabled', createRequest({ control: 'refresh-session' }), { intent: 'refresh-session', reason: 'shell-control-refresh-session' }],
		['advance-phase routes when enabled', createRequest({ control: 'advance-phase' }), { intent: 'advance-phase', reason: 'shell-control-advance-phase' }],
		['acknowledge-turn routes when enabled', createRequest({ control: 'acknowledge-turn' }), { intent: 'acknowledge-turn', reason: 'shell-control-acknowledge-turn' }],
		['toggle-debug-diagnostics routes when enabled', createRequest({ control: 'toggle-debug-diagnostics' }), { intent: 'toggle-debug-diagnostics', reason: 'shell-control-toggle-debug-diagnostics' }],
		['disabled control becomes noop', createRequest({ control: 'refresh-session', enabled: false }), { intent: 'noop', reason: 'shell-control-disabled' }],
	])('%s', (_, request, expectedDecision) => {
		expect(resolveShellControlDecision(request)).toEqual(expectedDecision)
	})

	it('emits a trace with the request and decision', () => {
		const request = createRequest({ control: 'advance-phase' })
		const onTrace = vi.fn()

		const decision = routeShellControl(request, onTrace)

		expect(decision).toEqual({ intent: 'advance-phase', reason: 'shell-control-advance-phase' })
		expect(onTrace).toHaveBeenCalledTimes(1)
		expect(onTrace).toHaveBeenCalledWith({ request, decision })
	})
})