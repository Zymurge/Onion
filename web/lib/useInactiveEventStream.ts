import { useEffect, useRef, useState } from 'react'

import type { TimelineEvent } from './battlefieldView'
import type { GameEvent } from './gameClient'
import type { GameRequestTransport } from './gameSessionTypes'

type UseInactiveEventStreamOptions = {
	activeGameId: number | null
	activeTurnActive: boolean
	lastAppliedEventSeq: number | null
	pollEvents?: GameRequestTransport['pollEvents']
}

type InactiveEventPayload = GameEvent & {
	attackers?: unknown
	amount?: unknown
	destroyedUnitIds?: unknown
	from?: unknown
	// Keep the payload open so the web client can render structured summaries from backend envelopes.
	outcome?: unknown
	odds?: unknown
	rammedUnitIds?: unknown
	remaining?: unknown
	roll?: unknown
	squadsLost?: unknown
	targetId?: unknown
	to?: unknown
	unitId?: unknown
	weaponId?: unknown
	weaponType?: unknown
	treadDamage?: unknown
}

const MOVE_EVENT_TYPES = new Set(['ONION_MOVED', 'UNIT_MOVED'])
const RESOLVED_EVENT_TYPES = new Set(['FIRE_RESOLVED', 'MOVE_RESOLVED'])
const FOLLOW_UP_EVENT_TYPES = new Set(['ONION_TREADS_LOST', 'ONION_BATTERY_DESTROYED', 'UNIT_STATUS_CHANGED', 'UNIT_SQUADS_LOST'])

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

function isNoiseEvent(event: InactiveEventPayload): boolean {
	if (event.type === 'PHASE_CHANGED') {
		return true
	}

	if (/join|connect/i.test(event.type)) {
		return true
	}

	return isNonEmptyString(event.summary) && /join|connect/i.test(event.summary)
}

function buildEventDetails(event: InactiveEventPayload): string[] {
	switch (event.type) {
		case 'ONION_MOVED':
			return [`The Onion moved to ${formatCoordinate(event.to)}`]
		case 'UNIT_MOVED': {
			const unitId = formatRawValue(event.unitId)
			const destination = formatCoordinate(event.to)
			return unitId.length > 0 ? [`${unitId} moved to ${destination}`] : [`Moved to ${destination}`]
		}
		case 'FIRE_RESOLVED': {
			const details: string[] = []
			if (Array.isArray(event.attackers) && event.attackers.length > 0) {
				details.push(`Attackers: ${formatValueList(event.attackers)}`)
			}
			if (formatRawValue(event.targetId).length > 0) {
				details.push(`Target: ${formatRawValue(event.targetId)}`)
			}
			if (event.roll !== undefined) {
				details.push(`Roll: ${formatDetailValue(event.roll)}`)
			}
			if (event.outcome !== undefined) {
				details.push(`Outcome: ${formatDetailValue(event.outcome)}`)
			}
			if (event.odds !== undefined) {
				details.push(`Odds: ${formatDetailValue(event.odds)}`)
			}
			return details
		}
		case 'MOVE_RESOLVED': {
			const details: string[] = []
			if (formatRawValue(event.unitId).length > 0) {
				details.push(`Mover: ${formatRawValue(event.unitId)}`)
			}
			if (Array.isArray(event.rammedUnitIds) && event.rammedUnitIds.length > 0) {
				details.push(`Rammed units: ${formatValueList(event.rammedUnitIds)}`)
			}
			if (Array.isArray(event.destroyedUnitIds) && event.destroyedUnitIds.length > 0) {
				details.push(`Destroyed units: ${formatValueList(event.destroyedUnitIds)}`)
			}
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
		case 'ONION_BATTERY_DESTROYED': {
			const weaponType = humanizeIdentifier(event.weaponType)
			return [weaponType.length > 0 ? `Battery destroyed: ${weaponType}` : 'Battery destroyed']
		}
		case 'UNIT_STATUS_CHANGED': {
			const unitId = formatRawValue(event.unitId)
			const from = formatRawValue(event.from)
			const to = formatRawValue(event.to)
			return unitId.length > 0 && from.length > 0 && to.length > 0 ? [`Unit ${unitId}: ${from} → ${to}`] : ['Unit status changed']
		}
		case 'UNIT_SQUADS_LOST': {
			const unitId = formatRawValue(event.unitId)
			const amount = typeof event.amount === 'number' ? String(event.amount) : formatDetailValue(event.amount)
			return unitId.length > 0 ? [`Squads lost for ${unitId}: ${amount}`] : [`Squads lost: ${amount}`]
		}
		default:
			return []
	}
}

function buildPrimarySummary(event: InactiveEventPayload, relatedEvents: ReadonlyArray<InactiveEventPayload>): string {
	if (event.type === 'FIRE_RESOLVED') {
		const target = formatRawValue(event.targetId)
		const fragments: string[] = []
		if (target.length > 0) {
			fragments.push(`Fire on ${target}`)
		} else {
			fragments.push('Fire resolved')
		}

		if (event.outcome !== undefined) {
			fragments.push(`result ${formatDetailValue(event.outcome)}`)
		}

		return fragments.join(': ')
	}

	if (event.type === 'MOVE_RESOLVED' || MOVE_EVENT_TYPES.has(event.type)) {
		const mover = formatRawValue(event.unitId)
		const moveDetails = relatedEvents.flatMap((relatedEvent) => buildEventDetails(relatedEvent))
		const ramDetails = moveDetails.filter((detail) => /rammed|destroyed|tread loss/i.test(detail))
		if (ramDetails.length > 0) {
			return mover.length > 0 ? `Ram attempt by ${mover}` : 'Ram attempt resolved'
		}

		if (mover.length > 0) {
			return `Move by ${mover}`
		}

		return 'Move resolved'
	}

	return formatEventSummary(event)
}

function formatEventSummary(event: InactiveEventPayload) {
	if (isNonEmptyString(event.summary)) {
		return event.summary
	}

	switch (event.type) {
		case 'UNIT_STATUS_CHANGED': {
			const unitId = formatRawValue(event.unitId)
			const from = formatRawValue(event.from)
			const to = formatRawValue(event.to)
			return unitId.length > 0 && from.length > 0 && to.length > 0 ? `Unit ${unitId}: ${from} → ${to}` : 'Unit status changed'
		}
		case 'MOVE_RESOLVED': {
			const unitId = formatRawValue(event.unitId)
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
		case 'ONION_BATTERY_DESTROYED': {
			const weaponType = humanizeIdentifier(event.weaponType)
			return weaponType.length > 0 ? `The Onion lost the ${weaponType} battery` : 'The Onion lost a battery'
		}
		default:
			return event.type.replace(/_/g, ' ').toLowerCase()
	}
}

function buildTimelineEntry(events: ReadonlyArray<InactiveEventPayload>): TimelineEvent {
	const primaryEvent = events.find((event) => RESOLVED_EVENT_TYPES.has(event.type) || MOVE_EVENT_TYPES.has(event.type)) ?? events[0]
	const details = events.flatMap((event) => buildEventDetails(event))
	const summary = isNonEmptyString(primaryEvent.summary) ? primaryEvent.summary : buildPrimarySummary(primaryEvent, events)

	return {
		seq: primaryEvent.seq,
		type: primaryEvent.type,
		summary,
		timestamp: primaryEvent.timestamp,
		tone: primaryEvent.type === 'UNIT_STATUS_CHANGED' ? 'alert' : 'normal',
		details,
		payload: primaryEvent,
	}
}

function shouldAttachToPreviousGroup(eventType: string): boolean {
	return FOLLOW_UP_EVENT_TYPES.has(eventType)
}

function buildTimelineEvents(events: ReadonlyArray<InactiveEventPayload>): TimelineEvent[] {
	const timelineEntries: TimelineEvent[] = []
	let index = 0

	while (index < events.length) {
		const currentEvent = events[index]

		if (isNoiseEvent(currentEvent)) {
			index += 1
			continue
		}

		if (MOVE_EVENT_TYPES.has(currentEvent.type)) {
			const relatedEvents: InactiveEventPayload[] = [currentEvent]
			let nextIndex = index + 1

			if (nextIndex < events.length && events[nextIndex].type === 'MOVE_RESOLVED') {
				relatedEvents.push(events[nextIndex] as InactiveEventPayload)
				nextIndex += 1
			}

			while (nextIndex < events.length && shouldAttachToPreviousGroup(events[nextIndex].type)) {
				relatedEvents.push(events[nextIndex] as InactiveEventPayload)
				nextIndex += 1
			}

			timelineEntries.push(buildTimelineEntry(relatedEvents))
			index = nextIndex
			continue
		}

		if (RESOLVED_EVENT_TYPES.has(currentEvent.type)) {
			const relatedEvents: InactiveEventPayload[] = [currentEvent]
			let nextIndex = index + 1

			while (nextIndex < events.length && shouldAttachToPreviousGroup(events[nextIndex].type)) {
				relatedEvents.push(events[nextIndex] as InactiveEventPayload)
				nextIndex += 1
			}

			timelineEntries.push(buildTimelineEntry(relatedEvents))
			index = nextIndex
			continue
		}

		timelineEntries.push(buildTimelineEntry([currentEvent]))
		index += 1
	}

	return timelineEntries
}

function toTimelineEvents(events: ReadonlyArray<GameEvent>): TimelineEvent[] {
	return buildTimelineEvents(events as ReadonlyArray<InactiveEventPayload>)
}

export function useInactiveEventStream({
	activeGameId,
	activeTurnActive,
	lastAppliedEventSeq,
	pollEvents,
}: UseInactiveEventStreamOptions) {
	const [entries, setEntries] = useState<TimelineEvent[]>([])
	const [isDismissed, setIsDismissed] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const seenSeqsRef = useRef(new Set<number>())
	const loadedThroughSeqRef = useRef<number | null>(null)
	const inFlightAfterSeqRef = useRef<number | null>(null)
	const latestAppliedEventSeqRef = useRef<number | null>(lastAppliedEventSeq)
	const queuedRefreshRef = useRef(false)
	const lastGameIdRef = useRef<number | null>(null)

	useEffect(() => {
		latestAppliedEventSeqRef.current = lastAppliedEventSeq
	}, [lastAppliedEventSeq])

	useEffect(() => {
		if (lastGameIdRef.current !== activeGameId) {
			lastGameIdRef.current = activeGameId
			setEntries([])
			setIsDismissed(false)
			setIsLoading(false)
			setErrorMessage(null)
			seenSeqsRef.current = new Set<number>()
			loadedThroughSeqRef.current = null
			inFlightAfterSeqRef.current = null
			queuedRefreshRef.current = false
		}
	}, [activeGameId])

	useEffect(() => {
		if (
			lastAppliedEventSeq === null ||
			activeTurnActive ||
			activeGameId === null ||
			pollEvents === undefined
		) {
			setIsLoading(false)
			return
		}

		const loadedThroughSeq = loadedThroughSeqRef.current
		if (loadedThroughSeq !== null && lastAppliedEventSeq <= loadedThroughSeq) {
			return
		}

		const afterSeq = loadedThroughSeq ?? 0
		if (inFlightAfterSeqRef.current === afterSeq) {
			queuedRefreshRef.current = true
			return
		}

		let cancelled = false
		inFlightAfterSeqRef.current = afterSeq

		async function loadEvents() {
			// Guard pollEvents and arguments
			if (pollEvents === undefined || activeGameId === null) {
				setIsLoading(false)
				return undefined
			}
			setIsLoading(true)
			setErrorMessage(null)
			try {
				const events = await pollEvents(Number(activeGameId), Number(afterSeq))
				if (cancelled) {
					return undefined
				}

				const unseenEvents = events.filter((event) => !seenSeqsRef.current.has(event.seq))
				for (const event of unseenEvents) {
					seenSeqsRef.current.add(event.seq)
				}

				if (unseenEvents.length > 0) {
					setEntries((currentEntries) => {
						const nextEntries = currentEntries.concat(toTimelineEvents(unseenEvents))
						nextEntries.sort((left, right) => left.seq - right.seq)
						return nextEntries
					})
					setIsDismissed(false)
				}

				const maxReturnedSeq = events.reduce((maxSeq, event) => Math.max(maxSeq, event.seq), afterSeq)
				// Default lastAppliedEventSeq to 0 if null
				loadedThroughSeqRef.current = Math.max(maxReturnedSeq, lastAppliedEventSeq ?? 0)
			} catch {
				if (!cancelled) {
					setErrorMessage('Unable to refresh inactive events.')
				}
			} finally {
				let shouldReload = false
				if (inFlightAfterSeqRef.current === afterSeq) {
					inFlightAfterSeqRef.current = null
				}

				if (
					!cancelled &&
					queuedRefreshRef.current &&
					latestAppliedEventSeqRef.current !== null &&
					loadedThroughSeqRef.current !== null &&
					loadedThroughSeqRef.current < latestAppliedEventSeqRef.current
				) {
					shouldReload = true
					queuedRefreshRef.current = false
				}

				if (shouldReload) {
					void loadEvents()
				} else {
					setIsLoading(false)
				}

				queuedRefreshRef.current = false
			}
		}

		void loadEvents()

		return () => {
			cancelled = true
			if (inFlightAfterSeqRef.current === afterSeq) {
				inFlightAfterSeqRef.current = null
			}
		}
	}, [activeGameId, activeTurnActive, lastAppliedEventSeq, pollEvents])

	function clearEntries() {
		setEntries([])
		setIsDismissed(true)
		setIsLoading(false)
		setErrorMessage(null)
	}

	function clearErrorMessage() {
		setErrorMessage(null)
	}

	return {
		clearEntries,
		entries,
		errorMessage,
		isLoading,
		isDismissed,
		clearErrorMessage,
	}
}