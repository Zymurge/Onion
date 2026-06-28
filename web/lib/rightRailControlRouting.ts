export type RightRailControl =
	| 'confirm-combat'
	| 'attempt-ram'
	| 'decline-ram'
	| 'select-all-stack-members'
	| 'clear-stack-selection'

export type RightRailControlRequest = {
	surface: 'right-rail'
	control: RightRailControl
	enabled: boolean
}

export type RightRailControlDecision = {
	intent: RightRailControl | 'noop'
	reason: string
}

export type RightRailControlTrace = {
	request: RightRailControlRequest
	decision: RightRailControlDecision
}

export function resolveRightRailControlDecision(request: RightRailControlRequest): RightRailControlDecision {
	if (!request.enabled) {
		return { intent: 'noop', reason: 'right-rail-control-disabled' }
	}

	return {
		intent: request.control,
		reason: `right-rail-control-${request.control}`,
	}
}

export function routeRightRailControl(
	request: RightRailControlRequest,
	onTrace?: (trace: RightRailControlTrace) => void,
): RightRailControlDecision {
	const decision = resolveRightRailControlDecision(request)
	onTrace?.({ request, decision })
	return decision
}