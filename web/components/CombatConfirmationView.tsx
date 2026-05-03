import { calculateCombatOdds } from '../lib/combatOdds'
import logger from '../lib/logger'

type CombatConfirmationViewProps = {
  title: string
  attackStrength: number
  attackMemberCount?: number
  attackMemberLabels?: string[]
  defenseStrength?: number
  modifiers?: string[]
  confirmLabel?: string
  onConfirm?: () => void
  isConfirmReady?: boolean
  isDisabled?: boolean
  dataTestId?: string
}

export function CombatConfirmationView({
  title,
  attackStrength,
  attackMemberCount,
  attackMemberLabels = [],
  defenseStrength,
  modifiers = [],
  confirmLabel,
  onConfirm,
  isConfirmReady = true,
  isDisabled = false,
  dataTestId,
}: CombatConfirmationViewProps) {
  const odds = calculateCombatOdds(attackStrength, defenseStrength)
  const hasTarget = defenseStrength !== undefined

  return (
    <article className="combat-confirmation-view" data-testid={dataTestId}>
      <div className="card-head combat-confirmation-head">
        <div>
          <h3>{title}</h3>
        </div>
      </div>

      <div className="combat-confirmation-stats">
        <div className="combat-confirmation-stat">
          <span className="stat-label-small">Attack</span>
          <strong>{attackStrength}</strong>
        </div>
        <div className="combat-confirmation-stat">
          <span className="stat-label-small">Attackers</span>
          <strong>{attackMemberCount ?? 0}</strong>
        </div>
        {hasTarget ? (
          <div className="combat-confirmation-stat">
            <span className="stat-label-small">Defense</span>
            <strong>{defenseStrength}</strong>
          </div>
        ) : null}
        {hasTarget ? (
          <div className="combat-confirmation-stat">
            <span className="stat-label-small">Odds</span>
            <strong>{odds}</strong>
          </div>
        ) : null}
      </div>

      {attackMemberLabels.length > 0 ? (
        <div className="combat-confirmation-section">
          <span className="stat-label-small">Attack composition</span>
          <ul className="combat-confirmation-modifier-list">
            {attackMemberLabels.map((label) => (
              <li key={label}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {onConfirm ? (
        <div className="combat-confirmation-actions">
          <button
            className="combat-confirm-button"
            type="button"
            disabled={isDisabled || !isConfirmReady}
            onClick={(event) => {
              event.stopPropagation()

              try {
                onConfirm()
              } catch (error) {
                logger.error({ error, title }, '[combat-confirmation] confirm handler failed')
              }
            }}
          >
            {confirmLabel ?? 'Confirm attack'}
          </button>
        </div>
      ) : null}
    </article>
  )
}