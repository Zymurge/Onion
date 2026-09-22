import type { ServerGameSnapshot } from '../lib/gameClient'

export type GameOverSummaryProps = {
	winner: NonNullable<ServerGameSnapshot['winner']>
	objectives?: ReadonlyArray<ServerGameSnapshot['victoryObjectives'][number]>
}

export function GameOverSummary({ winner, objectives }: GameOverSummaryProps) {
	const completedObjectives = (objectives ?? []).filter((objective) => objective.completed)
	const winnerTitle = winner === 'onion' ? 'Victory for the Onion' : 'Defenders prevail'
	const resultDescription = winner === 'onion'
		? 'The Onion completed every required victory objective.'
		: 'The Onion was immobilized or destroyed before completing its objectives.'

	return (
		<>
			<p className="eyebrow">Game over</p>
			<h2>{winnerTitle}</h2>
			<p className="summary-line">{resultDescription}</p>
			<div className="game-over-objectives">
				<span className="stat-label-small">Completed objectives</span>
				{completedObjectives.length > 0 ? (
					<ul>
						{completedObjectives.map((objective) => <li key={objective.id}>{objective.label}</li>)}
					</ul>
				) : (
					<p className="summary-line">Onion immobilized or destroyed</p>
				)}
			</div>
		</>
	)
}