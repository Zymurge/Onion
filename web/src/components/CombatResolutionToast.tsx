import { useEffect } from 'react'
import type { CombatResolution } from '../lib/gameClient'

type CombatResolutionToastProps = {
	title: string
	resolution: CombatResolution
	modifiers: string[]
	onDismiss: () => void
}

export function CombatResolutionToast({ title, resolution, modifiers, onDismiss }: CombatResolutionToastProps) {
	useEffect(() => {
		const timer = window.setTimeout(() => {
			onDismiss()
		}, 10_000)

		return () => {
			window.clearTimeout(timer)
		}
	}, [onDismiss])

	return (
		<aside className="combat-resolution-toast" role="status" aria-live="polite" data-testid="combat-resolution-toast">
			<div className="combat-resolution-head">
				<div>
					<p className="eyebrow">Combat result</p>
					<h3>{title}</h3>
				</div>
				<span className="mini-tag mini-tag-live">{resolution.outcomeLabel}</span>
			</div>

			<div className="combat-resolution-stats">
				<div className="combat-resolution-stat">
					<span className="stat-label-small">Outcome</span>
					<strong>{resolution.outcome}</strong>
				</div>
				{resolution.roll !== undefined ? (
					<div className="combat-resolution-stat">
						<span className="stat-label-small">Roll</span>
						<strong>{resolution.roll}</strong>
					</div>
				) : null}
				{resolution.odds ? (
					<div className="combat-resolution-stat">
						<span className="stat-label-small">Odds</span>
						<strong>{resolution.odds}</strong>
					</div>
				) : null}
			</div>

			<div className="combat-resolution-section">
				<span className="stat-label-small">Relevant modifiers</span>
				{modifiers.length > 0 ? (
					<ul className="combat-resolution-list">
						{modifiers.map((modifier) => (
							<li key={modifier}>{modifier}</li>
						))}
					</ul>
				) : (
					<p className="summary-line">No additional modifiers.</p>
				)}
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
				<button className="combat-resolution-dismiss" type="button" onClick={onDismiss}>
					Dismiss
				</button>
			</div>
		</aside>
	)
}