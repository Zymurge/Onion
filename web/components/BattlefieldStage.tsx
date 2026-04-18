import { HexMapBoard } from './HexMapBoard'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'

type BattlefieldStageProps = {
  activePhase: string | null
  activeTurnActive: boolean
  defenders: BattlefieldUnit[]
  onion: BattlefieldOnionView
  scenarioMap: {
    width: number
    height: number
    cells: Array<{ q: number; r: number }>
    hexes: Array<{ q: number; r: number; t: number }>
  }
  selectedCombatTargetId: string | null
  selectedUnitIds: string[]
  combatRangeHexKeys: ReadonlySet<string>
  combatTargetIds: ReadonlySet<string>
  canSubmitMove: boolean
  isSelectionLocked: boolean
  isInteractionLocked: boolean
  viewerRole: 'onion' | 'defender' | null
  onDeselect: () => void
  onMoveUnit: (unitId: string, to: { q: number; r: number }) => void
  onSelectCombatTarget: (targetId: string) => void
  onSelectUnit: (unitId: string, additive?: boolean) => void
}

export function BattlefieldStage({
  activePhase,
  activeTurnActive,
  defenders,
  onion,
  scenarioMap,
  selectedCombatTargetId,
  selectedUnitIds,
  combatRangeHexKeys,
  combatTargetIds,
  canSubmitMove,
  isSelectionLocked,
  isInteractionLocked,
  viewerRole,
  onDeselect,
  onMoveUnit,
  onSelectCombatTarget,
  onSelectUnit,
}: BattlefieldStageProps) {
  return (
    <section className="panel map-stage">
      <div className="map-frame">
        <HexMapBoard
          scenarioMap={scenarioMap}
          defenders={defenders}
          onion={onion}
          phase={activePhase}
          viewerRole={viewerRole}
          selectedUnitIds={selectedUnitIds}
          selectedCombatTargetId={selectedCombatTargetId}
          combatRangeHexKeys={combatRangeHexKeys}
          combatTargetIds={combatTargetIds}
          canSubmitMove={canSubmitMove && activeTurnActive && !isInteractionLocked}
          isSelectionLocked={isSelectionLocked}
          onSelectUnit={onSelectUnit}
          onSelectCombatTarget={onSelectCombatTarget}
          onDeselect={onDeselect}
          onMoveUnit={onMoveUnit}
        />
      </div>
    </section>
  )
}
