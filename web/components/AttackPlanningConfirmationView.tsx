import { calculateCombatOdds } from '../lib/combatOdds'
import logger from '../lib/logger'

type BaseAttackPlanningConfirmationViewProps = {
  title: string
  attackStrength: number
  attackMemberCount?: number
  attackMemberLabels?: string[]
  confirmLabel?: string
  onConfirm?: () => void
  isConfirmReady?: boolean
  isDisabled?: boolean
  dataTestId?: string
}

type AttackPlanningViewProps = BaseAttackPlanningConfirmationViewProps & {
  mode: 'build'
}

type AttackConfirmationViewProps = BaseAttackPlanningConfirmationViewProps & {
  mode: 'confirm'
  defenseStrength: number
  modifiers?: string[]
}

export type AttackPlanningConfirmationViewProps = AttackPlanningViewProps | AttackConfirmationViewProps

export function AttackPlanningConfirmationView({
  title,
  attackStrength,
  attackMemberCount,
  attackMemberLabels = [],
  confirmLabel,
  onConfirm,
  isConfirmReady = true,
  isDisabled = false,
  dataTestId,
  ...modeProps
}: AttackPlanningConfirmationViewProps) {
  if (modeProps.mode === 'confirm' && modeProps.defenseStrength === undefined) {
    throw new Error('AttackPlanningConfirmationView requires defenseStrength in confirm mode')
  }

  const hasTarget = modeProps.mode === 'confirm'
  const odds = hasTarget ? calculateCombatOdds(attackStrength, modeProps.defenseStrength) : null

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
            <strong>{modeProps.defenseStrength}</strong>
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