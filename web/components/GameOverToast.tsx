import { useEffect } from 'react'

type GameOverToastProps = {
	winner: 'onion' | 'defender'
	onDismiss: () => void
}

export function GameOverToast({ winner, onDismiss }: GameOverToastProps) {
	useEffect(() => {
		const timer = window.setTimeout(() => {
			onDismiss()
		}, 12_000)

		return () => {
			window.clearTimeout(timer)
		}
	}, [onDismiss])

	const title = winner === 'onion' ? 'Victory for the Onion' : 'Defenders prevail'
	const description = winner === 'onion' ? 'The Onion has escaped. This game is over.' : 'The defenders have won. This game is over.'

	return (
		<aside className="game-over-toast" role="status" aria-live="assertive" data-testid="game-over-toast">
			<div className="game-over-toast-head">
				<div>
					<p className="eyebrow">Game over</p>
					<h3>{title}</h3>
				</div>
				<span className="mini-tag mini-tag-alert">Terminal</span>
			</div>
			<p className="summary-line">{description}</p>
			<div className="combat-resolution-actions">
				<button className="combat-resolution-dismiss" type="button" onClick={onDismiss}>
					Dismiss
				</button>
			</div>
		</aside>
	)
}
