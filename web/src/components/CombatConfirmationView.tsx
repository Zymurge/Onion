import { calculateCombatOdds } from '../lib/combatOdds'

type CombatConfirmationViewProps = {
  title: string
  attackStrength: number
  defenseStrength: number
  modifiers: string[]
  dataTestId?: string
}

export function CombatConfirmationView({ title, attackStrength, defenseStrength, modifiers, dataTestId }: CombatConfirmationViewProps) {
  const odds = calculateCombatOdds(attackStrength, defenseStrength)

  return (
    <article className="combat-confirmation-view" data-testid={dataTestId}>
      <div className="card-head combat-confirmation-head">
        <div>
          <p className="eyebrow">Combat</p>
          <h3>{title}</h3>
        </div>
        <span className="mini-tag mini-tag-live">confirmation</span>
      </div>

      <div className="combat-confirmation-stats">
        <div className="combat-confirmation-stat">
          <span className="stat-label-small">Attack</span>
          <strong>{attackStrength}</strong>
        </div>
        <div className="combat-confirmation-stat">
          <span className="stat-label-small">Defense</span>
          <strong>{defenseStrength}</strong>
        </div>
        <div className="combat-confirmation-stat">
          <span className="stat-label-small">Attack:Defense ratio</span>
          <strong>{odds}</strong>
        </div>
      </div>

      <div className="combat-confirmation-modifiers">
        <span className="stat-label-small">Relevant modifiers</span>
        {modifiers.length > 0 ? (
          <ul className="combat-confirmation-modifier-list">
            {modifiers.map((modifier) => (
              <li key={modifier}>{modifier}</li>
            ))}
          </ul>
        ) : (
          <p className="summary-line">No additional modifiers.</p>
        )}
      </div>
    </article>
  )
}