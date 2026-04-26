import { statusTone } from '../lib/battlefieldView'
import type { CombatTargetOption } from '../lib/combatPreview'

type CombatTargetListProps = {
  targets: ReadonlyArray<CombatTargetOption>
  selectedTargetId: string | null
  isDisabled?: boolean
  onSelectTarget: (targetId: string) => void
}

export function CombatTargetList({
  targets,
  selectedTargetId,
  isDisabled = false,
  onSelectTarget,
}: CombatTargetListProps) {
  return (
    <div className="attacker-selection-list" data-testid="combat-target-list">
      {targets.map((target) => {
        const isSelected = selectedTargetId === target.id
        const targetIsDisabled = isDisabled || target.isDisabled === true

        return (
          <button
            key={target.id}
            type="button"
            className={[
              'attacker-card-button',
              'slim-weapon-card',
              isSelected ? 'is-selected' : '',
              targetIsDisabled ? 'is-disabled' : '',
              `tone-${statusTone(target.status)}`,
            ].join(' ')}
            disabled={targetIsDisabled}
            title={targetIsDisabled ? target.disabledTitle ?? 'Controls are unavailable until the inactive event window is dismissed.' : undefined}
            aria-pressed={isSelected}
            aria-disabled={targetIsDisabled}
            data-selected={isSelected}
            data-testid={`combat-target-${target.id}`}
            onClick={(event) => {
              if (targetIsDisabled) {
                event.preventDefault()
                event.stopPropagation()
                return
              }

              event.stopPropagation()
              onSelectTarget(target.id)
            }}
            onContextMenu={(event) => {
              if (targetIsDisabled) {
                event.preventDefault()
                event.stopPropagation()
                return
              }

              event.preventDefault()
              event.stopPropagation()

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