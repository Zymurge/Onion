export type ShellControlSurface = 'header/control'

export type ShellControl = 'refresh-session' | 'advance-phase' | 'acknowledge-turn' | 'toggle-debug-diagnostics'

export type ShellControlRequest = {
	surface: ShellControlSurface
	control: ShellControl
	enabled: boolean
}

export type ShellControlIntent = ShellControl | 'noop'

export type ShellControlDecision = {
	intent: ShellControlIntent
	reason: string
}

export type ShellControlTrace = {
	request: ShellControlRequest
	decision: ShellControlDecision
}

export function resolveShellControlDecision(request: ShellControlRequest): ShellControlDecision {
	if (!request.enabled) {
		return { intent: 'noop', reason: 'shell-control-disabled' }
	}

	return {
		intent: request.control,
		reason: `shell-control-${request.control}`,
	}
}

export function routeShellControl(
	request: ShellControlRequest,
	onTrace?: (trace: ShellControlTrace) => void,
): ShellControlDecision {
	const decision = resolveShellControlDecision(request)
	onTrace?.({ request, decision })
	return decision
}