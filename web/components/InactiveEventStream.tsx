import type { TimelineEvent } from '../lib/battlefieldView'

type InactiveEventStreamProps = {
	entries: ReadonlyArray<TimelineEvent>
	errorMessage: string | null
	isLoading: boolean
	onDismiss: () => void
	onDismissError: () => void
}

export function InactiveEventStream({ entries, errorMessage, isLoading, onDismiss, onDismissError }: InactiveEventStreamProps) {
	const showLoading = isLoading && entries.length === 0
	const showError = errorMessage !== null

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
						>
							<p className="summary-line">{entry.summary}</p>
							{entry.details !== undefined && entry.details.length > 0 ? (
								<details className="inactive-event-stream-entry-details">
									<summary className="inactive-event-stream-entry-details-toggle">Details</summary>
									<ul className="inactive-event-stream-entry-details-list">
										{entry.details.map((detail, index) => (
											<li key={`${entry.seq}-${index}`} className="inactive-event-stream-entry-detail">
												{detail}
											</li>
										))}
									</ul>
								</details>
							) : null}
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