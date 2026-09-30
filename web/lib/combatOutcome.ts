export type CombatOutcomeEvent = {
	type?: unknown
	outcome?: unknown
	targetId?: unknown
	to?: unknown
	amount?: unknown
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0
}

function isOnionTarget(targetId: unknown): boolean {
	if (!isNonEmptyString(targetId)) {
		return false
	}

	return /^onion(?:-\d+)?$/i.test(targetId) || targetId.endsWith(':treads') || /^(main|secondary_|ap_|missile_)/.test(targetId)
}

function hasDestroyedStatusChange(events: ReadonlyArray<CombatOutcomeEvent>): boolean {
	return events.some((event) => event.type === 'UNIT_STATUS_CHANGED' && event.to === 'destroyed')
}

function getSquadsLost(events: ReadonlyArray<CombatOutcomeEvent>): number | null {
	for (const event of events) {
		if (event.type === 'UNIT_SQUADS_LOST' && typeof event.amount === 'number') {
			return event.amount
		}
	}

	return null
}

function hasOnionTreadLoss(events: ReadonlyArray<CombatOutcomeEvent>): boolean {
	return events.some((event) => event.type === 'ONION_TREADS_LOST')
}

/** Resolves the semantic outcome shared by active and inactive combat displays. */
export function resolveCombatOutcomeLabel(event: CombatOutcomeEvent, relatedEvents: ReadonlyArray<CombatOutcomeEvent>): string {
	switch (event.outcome) {
		case 'NE':
			return 'missed'
		case 'X':
			return 'destroyed'
		case 'D': {
			if (hasDestroyedStatusChange(relatedEvents)) {
				return 'destroyed'
			}

			if (isOnionTarget(event.targetId)) {
				return hasOnionTreadLoss(relatedEvents) ? 'missed' : 'no effect'
			}

			const squadsLost = getSquadsLost(relatedEvents)
			if (squadsLost !== null) {
				return squadsLost === 1 ? '1 squad lost' : `${squadsLost} squads lost`
			}

			return 'disabled'
		}
		default:
			return typeof event.outcome === 'string' ? event.outcome : 'unknown'
	}
}