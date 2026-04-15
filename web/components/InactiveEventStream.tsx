import type { TimelineEvent } from '../lib/battlefieldView'

type InactiveEventStreamProps = {
	entries: ReadonlyArray<TimelineEvent>
	onDismiss: () => void
}

export function InactiveEventStream({ entries, onDismiss }: InactiveEventStreamProps) {
	return (
		<section className="panel panel-subtle inactive-event-stream" role="status" aria-live="polite" data-testid="inactive-event-stream">
			<div className="inactive-event-stream-head">
				<h3>Opponent’s Results</h3>
				<button
					className="inactive-event-stream-dismiss"
					type="button"
					onClick={onDismiss}
					aria-label="Dismiss inactive event stream"
				>
					Dismiss
				</button>
			</div>

			<ul className="inactive-event-stream-list">
				{entries.length > 0 ? (
					entries.map((entry) => (
						<li key={entry.seq} className={`inactive-event-stream-entry tone-${entry.tone ?? 'normal'}`}>
							<p className="summary-line">{entry.summary}</p>
						</li>
					))
				) : (
					<li className="inactive-event-stream-entry tone-normal">
						<p className="summary-line">Waiting for remote actions.</p>
					</li>
				)}
			</ul>
		</section>
	)
}