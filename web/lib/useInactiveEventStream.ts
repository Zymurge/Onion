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


function formatEventSummary(event: GameEvent) {
	if (typeof event.summary === 'string' && event.summary.trim().length > 0) {
		return event.summary
	}

	return event.type.replace(/_/g, ' ').toLowerCase()
}

function toTimelineEvent(event: GameEvent): TimelineEvent {
	return {
		seq: event.seq,
		type: event.type,
		summary: formatEventSummary(event),
		timestamp: event.timestamp,
		tone: event.type === 'UNIT_STATUS_CHANGED' || event.type === 'PHASE_CHANGED' ? 'alert' : 'normal',
	}
}

export function useInactiveEventStream({
	activeGameId,
	activeTurnActive,
	lastAppliedEventSeq,
	pollEvents,
}: UseInactiveEventStreamOptions) {
	const [entries, setEntries] = useState<TimelineEvent[]>([])
	const [isDismissed, setIsDismissed] = useState(false)
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
				return undefined
			}
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
						const nextEntries = currentEntries.concat(unseenEvents.map(toTimelineEvent))
						nextEntries.sort((left, right) => left.seq - right.seq)
						return nextEntries
					})
					setIsDismissed(false)
				}

				const maxReturnedSeq = events.reduce((maxSeq, event) => Math.max(maxSeq, event.seq), afterSeq)
				// Default lastAppliedEventSeq to 0 if null
				loadedThroughSeqRef.current = Math.max(maxReturnedSeq, lastAppliedEventSeq ?? 0)
			} catch {
				// Keep the existing stream in place; the next live hint can retry.
			} finally {
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
					queuedRefreshRef.current = false
					void loadEvents()
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
	}

	return {
		clearEntries,
		entries,
		isDismissed,
	}
}