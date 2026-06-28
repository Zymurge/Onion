export type InteractionViewerRole = 'onion' | 'defender'

export type InteractionViewerActivity = 'active' | 'inactive'

export type InteractionPhaseMode = 'movement' | 'combat' | 'locked'

export type InteractionSurface = 'map' | 'left-rail' | 'right-rail' | 'header/control'

export type InteractionGesture = 'primary' | 'primary-additive' | 'secondary'

export type InteractionSubjectRelation = 'self' | 'opponent' | 'neutral/system' | 'background'

export type InteractionSubjectKind = 'unit' | 'weapon' | 'stack' | 'subsystem' | 'hex' | 'background' | 'control'

export type InteractionSubjectCapability = {
	inspectable: boolean
	moveEligible: boolean
	attackerEligible: boolean
	targetEligible: boolean
}

export type InteractionModeFlags = {
	groupExpansionTarget?: boolean
	expandedStackEditor?: boolean
	destinationReachable?: boolean
}

export type InteractionRoutingRequest = {
	viewerRole: InteractionViewerRole
	viewerActivity: InteractionViewerActivity
	phaseMode: InteractionPhaseMode
	surface: InteractionSurface
	gesture: InteractionGesture
	subjectRelation: InteractionSubjectRelation
	subjectKind: InteractionSubjectKind
	subjectCapability: InteractionSubjectCapability
	interactionMode?: InteractionModeFlags
}

export type InteractionIntent =
	| 'inspect-subject'
	| 'select-actor'
	| 'expand-group'
	| 'toggle-actor'
	| 'select-target'
	| 'clear-local-selection'
	| 'submit-move'
	| 'show-illegal-local-feedback'
	| 'noop'

export type InteractionRoutingDecision = {
	intent: InteractionIntent
	reason: string
}

export type InteractionRoutingTrace = {
	request: InteractionRoutingRequest
	decision: InteractionRoutingDecision
}

function isInspectableSubject(request: InteractionRoutingRequest): boolean {
	return request.subjectRelation !== 'background' && request.subjectCapability.inspectable
}

function isMovementTargetRequest(request: InteractionRoutingRequest): boolean {
	return request.surface === 'map' && request.subjectKind === 'hex' && request.gesture === 'secondary'
}

export function resolveInteractionRoutingDecision(request: InteractionRoutingRequest): InteractionRoutingDecision {
	if (request.surface === 'header/control') {
		return { intent: 'noop', reason: 'header-controls-do-not-route-to-board-intents' }
	}

	if (request.viewerActivity === 'inactive') {
		if (request.gesture === 'secondary') {
			return { intent: 'noop', reason: 'inactive-secondary-is-noop' }
		}

		if (request.subjectRelation === 'background') {
			return { intent: 'clear-local-selection', reason: 'inactive-background-clears-local-inspection' }
		}

		if (isInspectableSubject(request)) {
			return { intent: 'inspect-subject', reason: 'inactive-interaction-is-inspection-only' }
		}

		return { intent: 'noop', reason: 'inactive-non-actionable-subject' }
	}

	if (request.phaseMode === 'locked') {
		if (request.subjectRelation === 'background' && request.gesture === 'primary') {
			return { intent: 'clear-local-selection', reason: 'locked-background-clears-local-state' }
		}

		return { intent: 'noop', reason: 'locked-phase-is-non-actionable' }
	}

	if (request.phaseMode === 'movement') {
		if (request.gesture === 'secondary') {
			if (isMovementTargetRequest(request) && request.interactionMode?.destinationReachable === true) {
				return { intent: 'submit-move', reason: 'movement-reachable-destination-submits-move' }
			}

			return { intent: 'show-illegal-local-feedback', reason: 'movement-secondary-non-reachable' }
		}

		if (request.subjectRelation === 'background') {
			return { intent: 'clear-local-selection', reason: 'movement-background-clears-local-selection' }
		}

		if (request.subjectRelation === 'self' && request.subjectCapability.moveEligible) {
			return { intent: 'select-actor', reason: 'movement-self-move-eligible-selects-mover' }
		}

		if (isInspectableSubject(request)) {
			return { intent: 'inspect-subject', reason: 'movement-non-eligible-subject-is-inspectable' }
		}

		return { intent: 'noop', reason: 'movement-non-actionable-subject' }
	}

	if (request.gesture === 'secondary') {
		if ((request.surface === 'map' || request.surface === 'right-rail') && (request.subjectRelation === 'opponent' || request.subjectRelation === 'neutral/system') && request.subjectCapability.targetEligible) {
			return { intent: 'select-target', reason: 'combat-legal-target-selects-target' }
		}

		return { intent: 'noop', reason: 'combat-secondary-is-explicit-confirmation-only' }
	}

	if (request.subjectRelation === 'background') {
		return { intent: 'clear-local-selection', reason: 'combat-background-clears-local-prep-state' }
	}

	if (request.subjectRelation === 'self') {
		if (request.subjectKind === 'stack' && request.interactionMode?.groupExpansionTarget === true) {
			return { intent: 'expand-group', reason: 'combat-stack-summary-expands-group' }
		}

		if (request.subjectCapability.attackerEligible) {
			if (request.gesture === 'primary-additive' || request.interactionMode?.expandedStackEditor === true) {
				return { intent: 'toggle-actor', reason: 'combat-self-eligible-toggle' }
			}

			return { intent: 'select-actor', reason: 'combat-self-eligible-select' }
		}

		if (isInspectableSubject(request)) {
			return { intent: 'inspect-subject', reason: 'combat-self-non-eligible-inspect-only' }
		}

		return { intent: 'noop', reason: 'combat-self-non-actionable' }
	}

	if (request.subjectRelation === 'opponent' || request.subjectRelation === 'neutral/system') {
		if (request.subjectCapability.targetEligible) {
			return { intent: 'select-target', reason: 'combat-legal-target-selects-target' }
		}

		if (isInspectableSubject(request)) {
			return { intent: 'inspect-subject', reason: 'combat-illegal-but-inspectable-subject' }
		}

		return { intent: 'noop', reason: 'combat-opponent-non-actionable' }
	}

	if (isInspectableSubject(request)) {
		return { intent: 'inspect-subject', reason: 'combat-fallback-inspectable-subject' }
	}

	return { intent: 'noop', reason: 'fallback-noop' }
}

export function routeInteraction(
	request: InteractionRoutingRequest,
	onTrace?: (trace: InteractionRoutingTrace) => void,
): InteractionRoutingDecision {
	const decision = resolveInteractionRoutingDecision(request)
	onTrace?.({ request, decision })
	return decision
}