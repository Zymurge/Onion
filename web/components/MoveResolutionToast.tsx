import { useEffect } from 'react'
import type { RamResolution } from '../lib/gameClient'

type MoveResolutionToastProps = {
	title: string
	resolution: RamResolution
	onDismiss: () => void
}

export function MoveResolutionToast({ title, resolution, onDismiss }: MoveResolutionToastProps) {
	useEffect(() => {
		const timer = window.setTimeout(() => {
			onDismiss()
		}, 10_000)

		return () => {
			window.clearTimeout(timer)
		}
	}, [onDismiss])

	return (
		<aside className="combat-resolution-toast" role="status" aria-live="polite" data-testid="ram-resolution-toast">
			<div className="combat-resolution-head">
				<div>
					<p className="eyebrow">Ram result</p>
					<h3>{title}</h3>
				</div>
				<span className="mini-tag mini-tag-live">Resolved</span>
			</div>

			<div className="combat-resolution-stats">
				<div className="combat-resolution-stat">
					<span className="stat-label-small">Rammed</span>
					<strong>{resolution.rammedUnitIds.length}</strong>
				</div>
				{resolution.treadDamage !== undefined ? (
					<div className="combat-resolution-stat">
						<span className="stat-label-small">Tread loss</span>
						<strong>{resolution.treadDamage}</strong>
					</div>
				) : null}
				<div className="combat-resolution-stat">
					<span className="stat-label-small">Destroyed</span>
					<strong>{resolution.destroyedUnitIds.length}</strong>
				</div>
			</div>

			<div className="combat-resolution-section">
				<span className="stat-label-small">Effects</span>
				{resolution.details.length > 0 ? (
					<ul className="combat-resolution-list">
						{resolution.details.map((detail) => (
							<li key={detail}>{detail}</li>
						))}
					</ul>
				) : (
					<p className="summary-line">No additional effects.</p>
				)}
			</div>

			<div className="combat-resolution-actions">
				<button
					className="combat-resolution-dismiss"
					type="button"
					onClick={(event) => {
						event.stopPropagation()
						onDismiss()
					}}
				>
					Dismiss
				</button>
			</div>
		</aside>
	)
}