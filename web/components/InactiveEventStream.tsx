import { useEffect, useState } from 'react'
import type { TimelineEvent } from '../lib/battlefieldView'

type InactiveEventStreamProps = {
	entries: ReadonlyArray<TimelineEvent>
	errorMessage: string | null
	isLoading: boolean
	onDismissError: () => void
	onFocusChange: (unitIds: ReadonlyArray<string>) => void
}

const NO_FOCUS_UNIT_IDS: ReadonlyArray<string> = []

export function InactiveEventStream({ entries, errorMessage, isLoading, onDismissError, onFocusChange }: InactiveEventStreamProps) {
	const [hoveredEntrySeq, setHoveredEntrySeq] = useState<number | null>(null)
	const [focusedEntrySeq, setFocusedEntrySeq] = useState<number | null>(null)
	const activeEntrySeq = hoveredEntrySeq ?? focusedEntrySeq
	const activeEntry = entries.find((entry) => entry.seq === activeEntrySeq)
	const focusUnitIds = activeEntry?.focusUnitIds ?? NO_FOCUS_UNIT_IDS
	const showLoading = isLoading && entries.length === 0
	const showError = errorMessage !== null

	useEffect(() => {
		onFocusChange(focusUnitIds)
	}, [focusUnitIds, onFocusChange])

	useEffect(() => () => onFocusChange(NO_FOCUS_UNIT_IDS), [onFocusChange])

	return (
		<section className="panel panel-subtle inactive-event-stream" role="status" aria-live="polite" data-testid="inactive-event-stream">
			<div className="inactive-event-stream-head">
				<h3>Opponent’s Results</h3>
			</div>

			{showError ? (
				<div className="inactive-event-stream-notice inactive-event-stream-notice-error" role="alert">
					<p className="summary-line">{errorMessage}</p>
					<button className="inactive-event-stream-notice-dismiss" type="button" onClick={onDismissError}>
						Dismiss notice
					</button>
				</div>
			) : null}

			{showLoading ? (
				<div className="inactive-event-stream-notice inactive-event-stream-notice-loading" aria-label="Loading inactive events">
					<span className="event-dot-spinner" aria-hidden="true" />
					<p className="summary-line">Refreshing remote results.</p>
				</div>
			) : null}

			<ul className="inactive-event-stream-list">
				{entries.length > 0 ? (
					entries.map((entry) => (
						<li
							key={entry.seq}
							className={`inactive-event-stream-entry tone-${entry.tone ?? 'normal'}`}
							title={entry.details !== undefined && entry.details.length > 0 ? entry.details.join('\n') : undefined}
							tabIndex={0}
							onMouseEnter={() => setHoveredEntrySeq(entry.seq)}
							onMouseLeave={() => setHoveredEntrySeq((current) => current === entry.seq ? null : current)}
							onFocus={() => setFocusedEntrySeq(entry.seq)}
							onBlur={() => setFocusedEntrySeq((current) => current === entry.seq ? null : current)}
						>
							<p className="summary-line">{entry.summary}</p>
						</li>
					))
				) : showLoading ? (
					<li className="inactive-event-stream-entry tone-normal">
						<p className="summary-line">Loading remote actions.</p>
					</li>
				) : (
					<li className="inactive-event-stream-entry tone-normal">
						<p className="summary-line">Waiting for remote actions.</p>
					</li>
				)}
			</ul>
		</section>
	)
}