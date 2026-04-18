import { statusTone } from '../lib/battlefieldView'
import type { CombatTargetOption } from '../lib/combatPreview'

type CombatTargetListProps = {
  targets: ReadonlyArray<CombatTargetOption>
  selectedTargetId: string | null
  selectedCombatAttackCount: number
  isDisabled?: boolean
  onSelectTarget: (targetId: string) => void
}

export function CombatTargetList({
  targets,
  selectedTargetId,
  selectedCombatAttackCount,
  isDisabled = false,
  onSelectTarget,
}: CombatTargetListProps) {
  return (
    <div className="attacker-selection-list" data-testid="combat-target-list">
      {targets.map((target) => {
        const isSelected = selectedTargetId === target.id
        const isTreadsTarget = target.id.endsWith(':treads')
        const isGroupAttackOnTreads = isTreadsTarget && selectedCombatAttackCount > 1

        return (
          <button
            key={target.id}
            type="button"
            className={[
              'attacker-card-button',
              'slim-weapon-card',
              isSelected ? 'is-selected' : '',
              isGroupAttackOnTreads || isDisabled ? 'is-disabled' : '',
              `tone-${statusTone(target.status)}`,
            ].join(' ')}
            disabled={isGroupAttackOnTreads || isDisabled}
            title={isDisabled ? 'Controls are unavailable until the inactive event window is dismissed.' : isGroupAttackOnTreads ? 'Treads must be singly targeted.' : undefined}
            aria-pressed={isSelected}
            aria-disabled={isGroupAttackOnTreads || isDisabled}
            data-selected={isSelected}
            data-testid={`combat-target-${target.id}`}
            onClick={(event) => {
              if (isDisabled) {
                event.preventDefault()
                event.stopPropagation()
                return
              }

              if (isGroupAttackOnTreads) {
                event.preventDefault()
                event.stopPropagation()
                return
              }

              event.stopPropagation()
              onSelectTarget(target.id)
            }}
            onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()

              if (isGroupAttackOnTreads) {
                return
              }

              onSelectTarget(target.id)
            }}
          >
            <div className="weapon-card-name">{target.label}</div>
            <div className="weapon-card-stats">{target.detail}</div>
          </button>
        )
      })}
    </div>
  )
}