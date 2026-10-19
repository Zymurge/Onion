import { useEffect, useRef, useState } from 'react'

import type { TimelineEvent } from '../battlefieldView'

import { toTimelineEvents } from './timeline'
import type { InactiveEventStream, UseInactiveEventStreamOptions } from './types'

/** Polls and buffers inactive-player events for the opponent activity feed. */
export function useInactiveEventStream({
	activeGameId,
	activeTurnActive,
	phaseStartEventSeq = null,
	lastAppliedEventSeq,
	pollEvents,
}: UseInactiveEventStreamOptions): InactiveEventStream {
	const [isInactiveEventWindowOpen, setIsInactiveEventWindowOpen] = useState(!activeTurnActive)
	const [entries, setEntries] = useState<TimelineEvent[]>([])
	const [isLoading, setIsLoading] = useState(false)
	const [errorMessage, setErrorMessage] = useState<string | null>(null)
	const seenSeqsRef = useRef(new Set<number>())
	const loadedThroughSeqRef = useRef<number | null>(null)
	const inFlightAfterSeqRef = useRef<number | null>(null)
	const latestAppliedEventSeqRef = useRef<number | null>(lastAppliedEventSeq)
	const queuedRefreshRef = useRef(false)
	const lastGameIdRef = useRef<number | null>(null)
	const lastActiveTurnActiveRef = useRef<boolean | null>(null)
	const windowStartSeqRef = useRef<number | null>(null)
	const clearVersionRef = useRef(0)

	useEffect(() => {
		latestAppliedEventSeqRef.current = lastAppliedEventSeq
	}, [lastAppliedEventSeq])

	useEffect(() => {
		if (lastGameIdRef.current !== activeGameId) {
			lastGameIdRef.current = activeGameId
			lastActiveTurnActiveRef.current = activeTurnActive
			windowStartSeqRef.current = activeTurnActive ? null : phaseStartEventSeq
			setIsInactiveEventWindowOpen(!activeTurnActive)
			setEntries([])
			setIsLoading(false)
			setErrorMessage(null)
			seenSeqsRef.current = new Set<number>()
			loadedThroughSeqRef.current = null
			inFlightAfterSeqRef.current = null
			queuedRefreshRef.current = false
		}
	}, [activeGameId, activeTurnActive, phaseStartEventSeq])

	useEffect(() => {
		const previousActiveTurnActive = lastActiveTurnActiveRef.current
		if (previousActiveTurnActive === true && activeTurnActive === false) {
			windowStartSeqRef.current = lastAppliedEventSeq
			setIsInactiveEventWindowOpen(true)
			setEntries([])
			setIsLoading(false)
			setErrorMessage(null)
			seenSeqsRef.current = new Set<number>()
			loadedThroughSeqRef.current = null
			inFlightAfterSeqRef.current = null
			queuedRefreshRef.current = false
		}

		lastActiveTurnActiveRef.current = activeTurnActive
	}, [activeTurnActive, lastAppliedEventSeq])

	useEffect(() => {
		if (
			lastAppliedEventSeq === null ||
			!isInactiveEventWindowOpen ||
			activeGameId === null ||
			pollEvents === undefined
		) {
			return
		}
		const activeGameIdForLoad = activeGameId
		const pollEventsForLoad = pollEvents

		const loadedThroughSeq = loadedThroughSeqRef.current
		if (loadedThroughSeq !== null && lastAppliedEventSeq <= loadedThroughSeq) {
			return
		}

		const afterSeq = loadedThroughSeq ?? windowStartSeqRef.current ?? phaseStartEventSeq ?? 0
		if (inFlightAfterSeqRef.current === afterSeq) {
			queuedRefreshRef.current = true
			return
		}

		let cancelled = false
			const clearVersion = clearVersionRef.current
		inFlightAfterSeqRef.current = afterSeq

		async function loadEvents() {
			setIsLoading(true)
			setErrorMessage(null)
			try {
				const events = await pollEventsForLoad(Number(activeGameIdForLoad), Number(afterSeq))
				if (cancelled) {
					return undefined
				}

				const unseenEvents = events.filter((event) => {
					return event.seq > afterSeq && !seenSeqsRef.current.has(event.seq)
				})
				for (const event of unseenEvents) {
					seenSeqsRef.current.add(event.seq)
				}

				if (unseenEvents.length > 0 && clearVersion === clearVersionRef.current) {
					setEntries((currentEntries) => {
						const nextEntries = currentEntries.concat(toTimelineEvents(unseenEvents))
						nextEntries.sort((left, right) => left.seq - right.seq)
						return nextEntries
					})
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
	}, [activeGameId, isInactiveEventWindowOpen, lastAppliedEventSeq, phaseStartEventSeq, pollEvents])

	function clearForTurnAcknowledgement() {
		clearVersionRef.current += 1
		setIsInactiveEventWindowOpen(false)
		setEntries([])
		setIsLoading(false)
		setErrorMessage(null)
	}

	function clearErrorMessage() {
		setErrorMessage(null)
	}

	return {
		clearForTurnAcknowledgement,
		entries,
		errorMessage,
		isLoading,
		clearErrorMessage,
	}
}
