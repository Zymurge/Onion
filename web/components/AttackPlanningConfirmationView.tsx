import { calculateCombatOdds } from '../lib/combatOdds'
import logger from '../lib/logger'
import { ConfirmationSurface } from './ConfirmationSurface'

type BaseAttackPlanningConfirmationViewProps = {
  title: string
  attackStrength: number
  attackRange?: number
  attackMemberCount?: number
  attackMemberLabels?: ReadonlyArray<string>
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
  modifiers?: ReadonlyArray<string>
}

export type AttackPlanningConfirmationViewProps = AttackPlanningViewProps | AttackConfirmationViewProps

export function AttackPlanningConfirmationView({
  title,
  attackStrength,
  attackRange = 0,
  attackMemberCount,
  attackMemberLabels = [],
  confirmLabel,
  onConfirm,
  isConfirmReady,
  isDisabled = false,
  dataTestId,
  ...modeProps
}: AttackPlanningConfirmationViewProps) {
  if (modeProps.mode === 'confirm' && modeProps.defenseStrength === undefined) {
    throw new Error('AttackPlanningConfirmationView requires defenseStrength in confirm mode')
  }

  const hasTarget = modeProps.mode === 'confirm'
  const isConfirmActionReady = isConfirmReady ?? hasTarget
  const odds = hasTarget ? calculateCombatOdds(attackStrength, modeProps.defenseStrength) : null

  return (
    <ConfirmationSurface dataTestId={dataTestId} title={title}>
      <div className="combat-confirmation-stats">
        <div className="combat-confirmation-stat-row">
          <div className="combat-confirmation-stat">
            <span className="stat-label-small">Attack</span>
            <strong>{attackStrength}</strong>
          </div>
          <div className="combat-confirmation-stat">
            <span className="stat-label-small">Range</span>
            <strong>{attackRange}</strong>
          </div>
        </div>
        {hasTarget ? (
          <div className="combat-confirmation-stat-row">
            <div className="combat-confirmation-stat">
              <span className="stat-label-small">Defense</span>
              <strong>{modeProps.defenseStrength}</strong>
            </div>
            <div className="combat-confirmation-stat">
              <span className="stat-label-small">Odds</span>
              <strong>{odds}</strong>
            </div>
          </div>
        ) : null}
      </div>

      {attackMemberLabels.length > 0 ? (
        <div className="combat-confirmation-section">
          <span className="stat-label-small">Attackers ({attackMemberCount ?? attackMemberLabels.length}):</span>
          <ul className="combat-confirmation-modifier-list">
            {attackMemberLabels.map((label, idx) => (
              <li key={`${label}-${idx}`}>{label}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {onConfirm ? (
        <div className="combat-confirmation-actions">
          <button
            className="combat-confirm-button"
            type="button"
            disabled={isDisabled || !isConfirmActionReady}
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
    </ConfirmationSurface>
  )
}