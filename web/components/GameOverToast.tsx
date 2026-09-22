import { useEffect } from 'react'
import { GameOverSummary, type GameOverSummaryProps } from './GameOverSummary'

type GameOverToastProps = GameOverSummaryProps & {
	onDismiss: () => void
}

export function GameOverToast({ winner, objectives, onDismiss }: GameOverToastProps) {
	useEffect(() => {
		const timer = window.setTimeout(() => {
			onDismiss()
		}, 12_000)

		return () => {
			window.clearTimeout(timer)
		}
	}, [onDismiss])

	return (
		<aside className="game-over-toast" role="status" aria-live="assertive" data-testid="game-over-toast">
			<div className="game-over-toast-head">
				<div><GameOverSummary winner={winner} objectives={objectives} /></div>
				<span className="mini-tag mini-tag-alert">Match complete</span>
			</div>
			<div className="combat-resolution-actions">
				<button className="combat-resolution-dismiss" type="button" onClick={onDismiss}>
					Dismiss
				</button>
			</div>
		</aside>
	)
}
