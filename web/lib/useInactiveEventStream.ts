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

function formatEventTitle(type: string) {
	switch (type) {
		case 'FIRE_RESOLVED':
			return 'Combat attempt'
		case 'MOVE_RESOLVED':
			return 'Ram resolved'
		case 'UNIT_STATUS_CHANGED':
			return 'Unit status changed'
		case 'PHASE_CHANGED':
			return 'Phase changed'
		default:
			return type.replace(/_/g, ' ').toLowerCase()
	}
}

function formatEventSummary(event: GameEvent) {
	if (typeof event.summary === 'string' && event.summary.trim().length > 0) {
		return event.summary
	}

	if (event.type === 'FIRE_RESOLVED') {
		const attackers = Array.isArray(event.attackers) ? event.attackers.join(', ') : 'Unknown attackers'
		const targetId = typeof event.targetId === 'string' ? event.targetId : 'unknown target'
		const outcome = typeof event.outcome === 'string' ? event.outcome : 'resolved'
		const roll = typeof event.roll === 'number' ? ` roll ${event.roll}` : ''
		const odds = typeof event.odds === 'string' ? ` at ${event.odds}` : ''
		return `${attackers} fired at ${targetId}${odds}${roll} (${outcome}).`
	}

	if (event.type === 'MOVE_RESOLVED') {
		const unitId = typeof event.unitId === 'string' ? event.unitId : 'Unknown unit'
		const rammed = Array.isArray(event.rammedUnitIds) && event.rammedUnitIds.length > 0 ? event.rammedUnitIds.join(', ') : 'no units'
		const destroyed = Array.isArray(event.destroyedUnitIds) && event.destroyedUnitIds.length > 0 ? event.destroyedUnitIds.join(', ') : 'none'
		const treadDamage = typeof event.treadDamage === 'number' ? event.treadDamage : 0
		return `${unitId} rammed ${rammed}; destroyed ${destroyed}; tread damage ${treadDamage}.`
	}

	if (event.type === 'UNIT_STATUS_CHANGED') {
		const unitId = typeof event.unitId === 'string' ? event.unitId : 'Unknown unit'
		const from = typeof event.from === 'string' ? event.from : 'unknown'
		const to = typeof event.to === 'string' ? event.to : 'unknown'
		return `${unitId} changed status from ${from} to ${to}.`
	}

	if (event.type === 'PHASE_CHANGED') {
		const from = typeof event.from === 'string' ? event.from : 'unknown'
		const to = typeof event.to === 'string' ? event.to : 'unknown'
		const turnNumber = typeof event.turnNumber === 'number' ? ` on turn ${event.turnNumber}` : ''
		return `Phase changed from ${from} to ${to}${turnNumber}.`
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
	const lastGameIdRef = useRef<number | null>(null)

	useEffect(() => {
		if (lastGameIdRef.current !== activeGameId) {
			lastGameIdRef.current = activeGameId
			setEntries([])
			setIsDismissed(false)
			seenSeqsRef.current = new Set<number>()
			loadedThroughSeqRef.current = null
			inFlightAfterSeqRef.current = null
		}
	}, [activeGameId])

	useEffect(() => {
		if (lastAppliedEventSeq === null || activeTurnActive || activeGameId === null || pollEvents === undefined) {
			return
		}

		const loadedThroughSeq = loadedThroughSeqRef.current
		if (loadedThroughSeq !== null && lastAppliedEventSeq <= loadedThroughSeq) {
			return
		}

		const afterSeq = loadedThroughSeq ?? 0
		if (inFlightAfterSeqRef.current === afterSeq) {
			return
		}

		let cancelled = false
		inFlightAfterSeqRef.current = afterSeq

		async function loadEvents() {
			try {
				const events = await pollEvents(activeGameId, afterSeq)
				if (cancelled) {
					return
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
				loadedThroughSeqRef.current = Math.max(maxReturnedSeq, lastAppliedEventSeq)
			} catch {
				// Keep the existing stream in place; the next live hint can retry.
			} finally {
				if (inFlightAfterSeqRef.current === afterSeq) {
					inFlightAfterSeqRef.current = null
				}
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