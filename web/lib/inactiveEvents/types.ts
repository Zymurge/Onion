import type { EventEnvelope } from '../../../shared/types/index.js'

import type { TimelineEvent } from '../battlefieldView'
import type { GameRequestTransport } from '../gameSessionTypes'

/** Options used to load and filter inactive-player events. */
export type UseInactiveEventStreamOptions = {
	activeGameId: number | null
	activeTurnActive: boolean
	currentPhase?: string | null
	currentTurnNumber: number | null
	phaseStartEventSeq?: number | null
	lastAppliedEventSeq: number | null
	pollEvents?: GameRequestTransport['pollEvents']
}

/** Event payload fields used to build inactive-event summaries and details. */
export type InactiveEventPayload = EventEnvelope & {
	attackers?: unknown
	attackerFriendlyNames?: unknown
	amount?: unknown
	destroyedUnitIds?: unknown
	from?: unknown
	// Keep the payload open so the web client can render structured summaries from backend envelopes.
	outcome?: unknown
	odds?: unknown
	rammedUnitIds?: unknown
	rammedUnitFriendlyNames?: unknown
	remaining?: unknown
	roll?: unknown
	squadsLost?: unknown
	targetId?: unknown
	targetFriendlyName?: unknown
	destroyedUnitFriendlyNames?: unknown
	to?: unknown
	unitId?: unknown
	unitFriendlyName?: unknown
	weaponId?: unknown
	weaponFriendlyName?: unknown
	weaponType?: unknown
	treadDamage?: unknown
}

/** Public state and actions returned by the inactive-event stream hook. */
export type InactiveEventStream = {
	clearForTurnAcknowledgement: () => void
	entries: TimelineEvent[]
	errorMessage: string | null
	isLoading: boolean
	clearErrorMessage: () => void
}
