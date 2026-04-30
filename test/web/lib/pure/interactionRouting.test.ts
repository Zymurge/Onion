import { describe, expect, it, vi } from 'vitest'

import {
	resolveInteractionRoutingDecision,
	routeInteraction,
	type InteractionRoutingRequest,
} from '#web/lib/interactionRouting'

function createRequest(overrides: Partial<InteractionRoutingRequest> = {}): InteractionRoutingRequest {
	const base: InteractionRoutingRequest = {
		viewerRole: 'defender',
		viewerActivity: 'active',
		phaseMode: 'combat',
		surface: 'map',
		gesture: 'primary',
		subjectRelation: 'background',
		subjectKind: 'hex',
		subjectCapability: {
			inspectable: false,
			moveEligible: false,
			attackerEligible: false,
			targetEligible: false,
		},
		interactionMode: {},
	}

	return {
		...base,
		...overrides,
		subjectCapability: {
			...base.subjectCapability,
			...overrides.subjectCapability,
		},
		interactionMode: {
			...base.interactionMode,
			...overrides.interactionMode,
		},
	}
}

describe('interactionRouting', () => {
	it.each([
		[
			'inactive primary click inspects an inspectable subject',
			createRequest({ viewerActivity: 'inactive', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'inspect-subject', reason: 'inactive-interaction-is-inspection-only' },
		],
		[
			'inactive primary-additive click also inspects',
			createRequest({ viewerActivity: 'inactive', gesture: 'primary-additive', subjectRelation: 'self', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'inspect-subject', reason: 'inactive-interaction-is-inspection-only' },
		],
		[
			'inactive secondary click is a noop',
			createRequest({ viewerActivity: 'inactive', gesture: 'secondary', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'noop', reason: 'inactive-secondary-is-noop' },
		],
		[
			'inactive background click clears local inspection',
			createRequest({ viewerActivity: 'inactive', subjectRelation: 'background', subjectKind: 'background' }),
			{ intent: 'clear-local-selection', reason: 'inactive-background-clears-local-inspection' },
		],
		[
			'active movement selects a move-eligible self source',
			createRequest({ phaseMode: 'movement', subjectRelation: 'self', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: true, attackerEligible: false, targetEligible: false } }),
			{ intent: 'select-actor', reason: 'movement-self-move-eligible-selects-mover' },
		],
		[
			'active movement inspects a non-eligible self source',
			createRequest({ phaseMode: 'movement', subjectRelation: 'self', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'inspect-subject', reason: 'movement-non-eligible-subject-is-inspectable' },
		],
		[
			'active movement inspects an opponent subject',
			createRequest({ phaseMode: 'movement', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'inspect-subject', reason: 'movement-non-eligible-subject-is-inspectable' },
		],
		[
			'active movement background click clears local selection',
			createRequest({ phaseMode: 'movement', subjectRelation: 'background', subjectKind: 'background' }),
			{ intent: 'clear-local-selection', reason: 'movement-background-clears-local-selection' },
		],
		[
			'active movement reachable secondary click submits a move',
			createRequest({ phaseMode: 'movement', gesture: 'secondary', subjectRelation: 'background', subjectKind: 'hex', interactionMode: { destinationReachable: true } }),
			{ intent: 'submit-move', reason: 'movement-reachable-destination-submits-move' },
		],
		[
			'active movement non-reachable secondary click shows local feedback',
			createRequest({ phaseMode: 'movement', gesture: 'secondary', subjectRelation: 'background', subjectKind: 'hex', interactionMode: { destinationReachable: false } }),
			{ intent: 'show-illegal-local-feedback', reason: 'movement-secondary-non-reachable' },
		],
		[
			'active combat selects an attacker source',
			createRequest({ phaseMode: 'combat', subjectRelation: 'self', subjectKind: 'weapon', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: true, targetEligible: false } }),
			{ intent: 'select-actor', reason: 'combat-self-eligible-select' },
		],
		[
			'active combat expands a collapsed group summary',
			createRequest({ phaseMode: 'combat', subjectRelation: 'self', subjectKind: 'stack', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: true, targetEligible: false }, interactionMode: { groupExpansionTarget: true } }),
			{ intent: 'expand-group', reason: 'combat-stack-summary-expands-group' },
		],
		[
			'active combat toggles an attacker source on additive click',
			createRequest({ phaseMode: 'combat', gesture: 'primary-additive', subjectRelation: 'self', subjectKind: 'weapon', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: true, targetEligible: false } }),
			{ intent: 'toggle-actor', reason: 'combat-self-eligible-toggle' },
		],
		[
			'active combat toggles an expanded stack editor member on primary click',
			createRequest({ phaseMode: 'combat', surface: 'right-rail', subjectRelation: 'self', subjectKind: 'stack', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: true, targetEligible: false }, interactionMode: { expandedStackEditor: true } }),
			{ intent: 'toggle-actor', reason: 'combat-self-eligible-toggle' },
		],
		[
			'active combat toggles a right-rail stack member',
			createRequest({ phaseMode: 'combat', surface: 'right-rail', subjectRelation: 'self', subjectKind: 'stack', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: true, targetEligible: false }, interactionMode: { expandedStackEditor: true } }),
			{ intent: 'toggle-actor', reason: 'combat-self-eligible-toggle' },
		],
		[
			'active combat selects a legal right-click target on the map',
			createRequest({ phaseMode: 'combat', gesture: 'secondary', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: true } }),
			{ intent: 'select-target', reason: 'combat-legal-target-selects-target' },
		],
		[
			'active combat selects a legal right-rail target',
			createRequest({ phaseMode: 'combat', surface: 'right-rail', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: true } }),
			{ intent: 'select-target', reason: 'combat-legal-target-selects-target' },
		],
		[
			'active combat inspects an illegal but inspectable target',
			createRequest({ phaseMode: 'combat', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'inspect-subject', reason: 'combat-illegal-but-inspectable-subject' },
		],
		[
			'active combat background click clears local prep state',
			createRequest({ phaseMode: 'combat', subjectRelation: 'background', subjectKind: 'background' }),
			{ intent: 'clear-local-selection', reason: 'combat-background-clears-local-prep-state' },
		],
		[
			'active combat secondary click on background is a noop',
			createRequest({ phaseMode: 'combat', gesture: 'secondary', subjectRelation: 'background', subjectKind: 'background', subjectCapability: { inspectable: false, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'noop', reason: 'combat-secondary-is-explicit-confirmation-only' },
		],
		[
			'locked background click still clears local state',
			createRequest({ phaseMode: 'locked', subjectRelation: 'background', subjectKind: 'background' }),
			{ intent: 'clear-local-selection', reason: 'locked-background-clears-local-state' },
		],
		[
			'locked non-background clicks are no-ops',
			createRequest({ phaseMode: 'locked', subjectRelation: 'opponent', subjectKind: 'unit', subjectCapability: { inspectable: true, moveEligible: false, attackerEligible: false, targetEligible: false } }),
			{ intent: 'noop', reason: 'locked-phase-is-non-actionable' },
		],
		[
			'header/control clicks are no-ops',
			createRequest({ surface: 'header/control', subjectRelation: 'background', subjectKind: 'control' }),
			{ intent: 'noop', reason: 'header-controls-do-not-route-to-board-intents' },
		],
	])('%s', (_, request, expectedDecision) => {
		expect(resolveInteractionRoutingDecision(request)).toEqual(expectedDecision)
	})

	it('emits a debug trace with request and decision', () => {
		const request = createRequest({
			phaseMode: 'movement',
			subjectRelation: 'self',
			subjectKind: 'unit',
			subjectCapability: {
				inspectable: true,
				moveEligible: true,
				attackerEligible: false,
				targetEligible: false,
			},
		})
		const onTrace = vi.fn()

		const decision = routeInteraction(request, onTrace)

		expect(decision).toEqual({ intent: 'select-actor', reason: 'movement-self-move-eligible-selects-mover' })
		expect(onTrace).toHaveBeenCalledTimes(1)
		expect(onTrace).toHaveBeenCalledWith({ request, decision })
	})
})