import type { TimelineEvent } from '../battlefieldView'
import type { EventEnvelope } from '../../../shared/types/index.js'

import { FOLLOW_UP_EVENT_TYPES, MOVE_EVENT_TYPES, RESOLVED_EVENT_TYPES } from './eventFamilies'
import { buildEventDetails, buildPrimarySummary, getEventCauseId, isNoiseEvent } from './formatting'
import type { InactiveEventPayload } from './types'

function buildTimelineEntry(events: ReadonlyArray<InactiveEventPayload>): TimelineEvent {
	const primaryEvent = events.find((event) => RESOLVED_EVENT_TYPES.has(event.type) || MOVE_EVENT_TYPES.has(event.type)) ?? events[0]
	const details = events.flatMap((event) => buildEventDetails(event, events))
	const summary = isNonEmptyString(primaryEvent.summary) ? primaryEvent.summary : buildPrimarySummary(primaryEvent, events)

	return {
		seq: primaryEvent.seq,
		type: primaryEvent.type,
		summary,
		timestamp: primaryEvent.timestamp,
		tone: primaryEvent.type === 'UNIT_STATUS_CHANGED' || primaryEvent.type === 'GAME_OVER' ? 'alert' : 'normal',
		details,
		payload: primaryEvent,
	}
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0
}

function shouldAttachToPreviousGroup(eventType: string): boolean {
	return FOLLOW_UP_EVENT_TYPES.has(eventType)
}

/** Groups persisted event envelopes into display-ready inactive timeline entries. */
export function buildTimelineEvents(events: ReadonlyArray<InactiveEventPayload>): TimelineEvent[] {
	const timelineEntries: TimelineEvent[] = []
	let index = 0

	while (index < events.length) {
		const currentEvent = events[index]

		if (isNoiseEvent(currentEvent)) {
			index += 1
			continue
		}

		const currentCauseId = getEventCauseId(currentEvent)
		if (currentCauseId !== null) {
			const relatedEvents: InactiveEventPayload[] = [currentEvent]
			let nextIndex = index + 1

			while (nextIndex < events.length) {
				const nextEvent = events[nextIndex]
				if (isNoiseEvent(nextEvent)) {
					nextIndex += 1
					continue
				}

				if (getEventCauseId(nextEvent) !== currentCauseId) {
					break
				}

				relatedEvents.push(nextEvent)
				nextIndex += 1
			}

			timelineEntries.push(buildTimelineEntry(relatedEvents))
			index = nextIndex
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

/** Converts generic event envelopes into inactive timeline entries. */
export function toTimelineEvents(events: ReadonlyArray<EventEnvelope>): TimelineEvent[] {
	return buildTimelineEvents(events as ReadonlyArray<InactiveEventPayload>)
}
