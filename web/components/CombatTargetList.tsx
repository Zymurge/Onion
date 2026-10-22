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
    <div className="attacker-selection-list combat-target-list" data-testid="combat-target-list">
      {targets.map((target) => {
        const isSelected = selectedTargetId === target.id
        const targetIsUnavailable = isDisabled || target.isUnavailable === true

        return (
          <button
            key={target.id}
            type="button"
            className={[
              'attacker-card-button',
              'slim-weapon-card',
              isSelected ? 'is-selected' : '',
              targetIsUnavailable ? 'is-disabled' : '',
              `tone-${statusTone(target.status)}`,
            ].join(' ')}
            disabled={targetIsUnavailable}
            title={targetIsUnavailable ? target.unavailableTitle ?? 'Controls are unavailable until the inactive event window is dismissed.' : undefined}
            aria-pressed={isSelected}
            aria-disabled={targetIsUnavailable}
            data-selected={isSelected}
            data-testid={`combat-target-${target.id}`}
            onClick={(event) => {
              if (targetIsUnavailable) {
                event.preventDefault()
                event.stopPropagation()
                return
              }

              event.stopPropagation()
              onSelectTarget(target.id)
            }}
            onContextMenu={(event) => {
              if (targetIsUnavailable) {
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