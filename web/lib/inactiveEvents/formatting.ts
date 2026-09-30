import { MOVE_EVENT_TYPES } from './eventFamilies'
import type { InactiveEventPayload } from './types'
import { resolveCombatOutcomeLabel as resolveSharedCombatOutcomeLabel } from '../combatOutcome'

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0
}

function humanizeIdentifier(value: unknown): string {
	if (!isNonEmptyString(value)) {
		return ''
	}

	const normalized = value.replace(/[_-]+/g, ' ').trim().toLowerCase()
	return normalized.length > 0 ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : ''
}

function formatRawValue(value: unknown): string {
	return isNonEmptyString(value) ? value : ''
}

function formatValueList(value: unknown): string {
	if (!Array.isArray(value)) {
		return formatDetailValue(value)
	}

	return value.map((item) => formatDetailValue(item)).filter((item) => item.length > 0).join(', ')
}

function formatFriendlyName(value: unknown): string {
	const raw = formatRawValue(value)
	return raw.length > 0 ? raw : ''
}

function formatCoordinate(value: unknown): string {
	if (value === null || value === undefined || typeof value !== 'object') {
		return formatDetailValue(value)
	}

	const candidate = value as { q?: unknown; r?: unknown }
	if (typeof candidate.q === 'number' && typeof candidate.r === 'number') {
		return `(${candidate.q}, ${candidate.r})`
	}

	return formatObjectValue(value as Record<string, unknown>)
}

function formatObjectValue(value: Record<string, unknown>): string {
	const entries = Object.entries(value)
		.filter(([, entryValue]) => entryValue !== undefined)
		.map(([key, entryValue]) => `${key}: ${formatDetailValue(entryValue)}`)

	return entries.join(', ')
}

function formatDetailValue(value: unknown): string {
	if (typeof value === 'string') {
		return value
	}

	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value)
	}

	if (Array.isArray(value)) {
		return value.map((item) => formatDetailValue(item)).filter((item) => item.length > 0).join(', ')
	}

	if (value === null || value === undefined) {
		return '—'
	}

	if (typeof value === 'object') {
		return formatObjectValue(value as Record<string, unknown>)
	}

	return String(value)
}

function isConnectionNoiseSummary(summary: string): boolean {
	return /\b(join(?:ed|ing)?|connect(?:ed|ing|ion)?)\b/i.test(summary)
}

function hasDestroyedStatusChange(events: ReadonlyArray<InactiveEventPayload>): boolean {
	return events.some((event) => event.type === 'UNIT_STATUS_CHANGED' && formatRawValue(event.to) === 'destroyed')
}

/** Returns whether an event should be hidden from the inactive timeline. */
export function isNoiseEvent(event: InactiveEventPayload): boolean {
	if (event.type === 'PHASE_CHANGED') {
		return true
	}

	// Connection/session chatter is intentionally hidden from the inactive stream.
	// We keep a regex here because upstream event types and fallback summaries are not
	// yet normalized into one explicit connection-event family, but the pattern is
	// deliberately narrow so gameplay text like "reconnect beacon" does not get
	// suppressed by accident.
	if (/join|connect/i.test(event.type)) {
		return true
	}

	return isNonEmptyString(event.summary) && isConnectionNoiseSummary(event.summary)
}

/** Returns the event's grouping cause identifier, when one is present. */
export function getEventCauseId(event: InactiveEventPayload): string | null {
	const causeId = formatRawValue(event.causeId)
	return causeId.length > 0 ? causeId : null
}

function resolveCombatOutcomeLabel(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload>): string {
	return resolveSharedCombatOutcomeLabel(event, relatedEvents)
}

function resolveRamOutcomeLabel(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload>): string {
	if (hasDestroyedStatusChange(relatedEvents)) {
		return 'destroyed'
	}

	if (Array.isArray(event.destroyedUnitIds) && event.destroyedUnitIds.length > 0) {
		return 'destroyed'
	}

	return 'survived'
}

function resolveRamTargetLabel(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload>): string {
	const resolvedEvent = relatedEvents.find((relatedEvent) => relatedEvent.type === 'MOVE_RESOLVED') ?? event

	if (isNonEmptyString(resolvedEvent.rammedUnitFriendlyName)) {
		return resolvedEvent.rammedUnitFriendlyName
	}

	if (Array.isArray(resolvedEvent.rammedUnitFriendlyNames) && resolvedEvent.rammedUnitFriendlyNames.length > 0) {
		return formatValueList(resolvedEvent.rammedUnitFriendlyNames)
	}

	if (Array.isArray(resolvedEvent.destroyedUnitFriendlyNames) && resolvedEvent.destroyedUnitFriendlyNames.length > 0) {
		return formatValueList(resolvedEvent.destroyedUnitFriendlyNames)
	}

	if (Array.isArray(resolvedEvent.rammedUnitIds) && resolvedEvent.rammedUnitIds.length > 0) {
		return formatValueList(resolvedEvent.rammedUnitIds)
	}

	if (Array.isArray(resolvedEvent.destroyedUnitIds) && resolvedEvent.destroyedUnitIds.length > 0) {
		return formatValueList(resolvedEvent.destroyedUnitIds)
	}

	if (isNonEmptyString(resolvedEvent.unitFriendlyName)) {
		return resolvedEvent.unitFriendlyName
	}

	if (isNonEmptyString(resolvedEvent.unitId)) {
		return resolvedEvent.unitId
	}

	return 'unknown'
}

function hasRamResolutionPayload(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload>): boolean {
	const resolvedEvent = relatedEvents.find((relatedEvent) => relatedEvent.type === 'MOVE_RESOLVED') ?? event

	return (
		(Array.isArray(resolvedEvent.rammedUnitIds) && resolvedEvent.rammedUnitIds.length > 0)
		|| (Array.isArray(resolvedEvent.rammedUnitFriendlyNames) && resolvedEvent.rammedUnitFriendlyNames.length > 0)
		|| (Array.isArray(resolvedEvent.destroyedUnitIds) && resolvedEvent.destroyedUnitIds.length > 0)
		|| (Array.isArray(resolvedEvent.destroyedUnitFriendlyNames) && resolvedEvent.destroyedUnitFriendlyNames.length > 0)
		|| (typeof resolvedEvent.treadDamage === 'number' && resolvedEvent.treadDamage > 0)
	)
}

/** Builds detail lines for one inactive event and its related follow-up events. */
export function buildEventDetails(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload> = [event]): string[] {
	switch (event.type) {
		case 'ONION_MOVED':
			return [`${formatFriendlyName(event.unitFriendlyName) || 'The Onion'} moved to ${formatCoordinate(event.to)}`]
		case 'UNIT_MOVED': {
			const unitName = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
			const destination = formatCoordinate(event.to)
			return unitName.length > 0 ? [`${unitName} moved to ${destination}`] : [`Moved to ${destination}`]
		}
		case 'FIRE_RESOLVED': {
			const details: string[] = []
			if (Array.isArray(event.attackerFriendlyNames) && event.attackerFriendlyNames.length > 0) {
				details.push(`Attackers: ${formatValueList(event.attackerFriendlyNames)}`)
			} else if (Array.isArray(event.attackers) && event.attackers.length > 0) {
				details.push(`Attackers: ${formatValueList(event.attackers)}`)
			}
			const targetName = formatFriendlyName(event.targetFriendlyName) || formatRawValue(event.targetId)
			if (targetName.length > 0) {
				details.push(`Target: ${targetName}`)
			}
			if (event.roll !== undefined) {
				details.push(`Roll: ${formatDetailValue(event.roll)}`)
			}
			if (event.outcome !== undefined) {
				details.push(`Outcome: ${resolveCombatOutcomeLabel(event, relatedEvents)}`)
			}
			if (event.odds !== undefined) {
				details.push(`Odds: ${formatDetailValue(event.odds)}`)
			}
			return details
		}
		case 'MOVE_RESOLVED': {
			const details: string[] = []
			const moveName = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
			const ramTarget = Array.isArray(event.rammedUnitFriendlyNames) && event.rammedUnitFriendlyNames.length > 0
				? formatValueList(event.rammedUnitFriendlyNames)
				: Array.isArray(event.destroyedUnitFriendlyNames) && event.destroyedUnitFriendlyNames.length > 0
					? formatValueList(event.destroyedUnitFriendlyNames)
					: Array.isArray(event.rammedUnitIds) && event.rammedUnitIds.length > 0
						? formatValueList(event.rammedUnitIds)
						: Array.isArray(event.destroyedUnitIds) && event.destroyedUnitIds.length > 0
							? formatValueList(event.destroyedUnitIds)
							: 'unknown'
			details.push(`Unit: ${moveName || 'Unknown'}`)
			details.push(`Target: ${ramTarget}`)
			details.push(`Result: ${resolveRamOutcomeLabel(event, relatedEvents)}`)
			if (typeof event.treadDamage === 'number' && event.treadDamage > 0) {
				details.push(`Tread loss: ${event.treadDamage}`)
			}
			return details
		}
		case 'ONION_TREADS_LOST': {
			const details: string[] = []
			if (typeof event.amount === 'number') {
				details.push(`Treads lost: ${event.amount}`)
			}
			if (typeof event.remaining === 'number') {
				details.push(`Remaining: ${event.remaining}`)
			}
			return details
		}
		case 'ONION_WEAPON_DESTROYED': {
			const weaponName = formatFriendlyName(event.weaponFriendlyName) || humanizeIdentifier(event.weaponType)
			return [weaponName.length > 0 ? `Weapon destroyed: ${weaponName}` : 'Weapon destroyed']
		}
		case 'UNIT_STATUS_CHANGED': {
			const unitId = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
			const from = formatRawValue(event.from)
			const to = formatRawValue(event.to)
			return unitId.length > 0 && from.length > 0 && to.length > 0 ? [`Unit: ${unitId}: ${from} → ${to}`] : ['Unit status changed']
		}
		case 'UNIT_SQUADS_LOST': {
			const unitId = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
			const amount = typeof event.amount === 'number' ? String(event.amount) : formatDetailValue(event.amount)
			return unitId.length > 0 ? [`Squads lost for ${unitId}: ${amount}`] : [`Squads lost: ${amount}`]
		}
		case 'GAME_OVER': {
			const winner = formatRawValue((event as { winner?: unknown }).winner)
			return winner.length > 0 ? [`Game over: ${winner} won`] : ['Game over']
		}
		default:
			return []
	}
}

/** Builds the primary summary line for one inactive event group. */
export function buildPrimarySummary(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload>): string {
	if (event.type === 'FIRE_RESOLVED') {
		const target = formatFriendlyName(event.targetFriendlyName) || formatRawValue(event.targetId)
		const fragments: string[] = []
		if (target.length > 0) {
			fragments.push(`Fire on ${target}`)
		} else {
			fragments.push('Fire resolved')
		}

		if (event.outcome !== undefined) {
			fragments.push(resolveCombatOutcomeLabel(event, relatedEvents))
		}

		return fragments.join(': ')
	}

	if (event.type === 'MOVE_RESOLVED' || MOVE_EVENT_TYPES.has(event.type)) {
		const mover = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
		if (hasRamResolutionPayload(event, relatedEvents)) {
			const rammedUnit = resolveRamTargetLabel(event, relatedEvents)
			const result = resolveRamOutcomeLabel(event, relatedEvents)
			return `Ram on ${rammedUnit}: ${result}`
		}

		if (mover.length > 0) {
			return `Move by ${mover}`
		}

		return 'Move resolved'
	}

	return formatEventSummary(event)
}

function formatEventSummary(event: InactiveEventPayload): string {
	if (isNonEmptyString(event.summary)) {
		return event.summary
	}

	switch (event.type) {
		case 'UNIT_STATUS_CHANGED': {
			const unitId = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
			const from = formatRawValue(event.from)
			const to = formatRawValue(event.to)
			return unitId.length > 0 && from.length > 0 && to.length > 0 ? `Unit: ${unitId}: ${from} → ${to}` : 'Unit status changed'
		}
		case 'MOVE_RESOLVED': {
			const unitId = formatFriendlyName(event.unitFriendlyName) || formatRawValue(event.unitId)
			const fragments: string[] = []
			if (unitId.length > 0) {
				fragments.push(`Move resolved for ${unitId}`)
			} else {
				fragments.push('Move resolved')
			}

			if (Array.isArray(event.rammedUnitIds) && event.rammedUnitIds.length > 0) {
				fragments.push(`${event.rammedUnitIds.length} rammed`)
			}

			if (Array.isArray(event.destroyedUnitIds) && event.destroyedUnitIds.length > 0) {
				fragments.push(`${event.destroyedUnitIds.length} destroyed`)
			}

			if (typeof event.treadDamage === 'number' && event.treadDamage > 0) {
				fragments.push(`${event.treadDamage} tread loss`)
			}

			return fragments.join(', ')
		}
		case 'FIRE_RESOLVED': {
			const targetId = formatRawValue(event.targetId)
			return targetId.length > 0 ? `Fire resolved on target ${targetId}` : 'Fire resolved'
		}
		case 'ONION_TREADS_LOST': {
			return typeof event.amount === 'number' ? `The Onion lost ${event.amount} treads` : 'The Onion lost treads'
		}
		case 'ONION_WEAPON_DESTROYED': {
			const weaponType = humanizeIdentifier(event.weaponType)
			return weaponType.length > 0 ? `The Onion lost the ${weaponType} weapon` : 'The Onion lost a weapon'
		}
		case 'GAME_OVER': {
			const winner = formatRawValue((event as { winner?: unknown }).winner)
			return winner.length > 0 ? `Game over: ${winner} wins` : 'Game over'
		}
		default:
			return event.type.replace(/_/g, ' ').toLowerCase()
	}
}
