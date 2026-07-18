import { HexMapBoard } from './HexMapBoard'
import type { BattlefieldOnionView, BattlefieldUnit } from '../lib/battlefieldView'
import type { StackRosterState } from '../../shared/types/index'

type BattlefieldStageProps = {
  activePhase: string | null
  activeTurnActive: boolean
  defenders: ReadonlyArray<BattlefieldUnit>
  onion: BattlefieldOnionView
  stackNaming?: import('../../shared/stackNaming').StackNamingSnapshot
  stackRoster?: StackRosterState
  scenarioMap: {
    width: number
    height: number
    cells: ReadonlyArray<{ q: number; r: number }>
    hexes: ReadonlyArray<{ q: number; r: number; t: number }>
  }
  selectedCombatTargetId: string | null
  selectedUnitIds: ReadonlyArray<string>
  combatRangeHexKeys: ReadonlySet<string>
  combatTargetIds: ReadonlySet<string>
  escapeHexes: ReadonlyArray<{ q: number; r: number }>
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
  stackNaming,
  stackRoster,
  scenarioMap,
  selectedCombatTargetId,
  selectedUnitIds,
  combatRangeHexKeys,
  combatTargetIds,
  escapeHexes,
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
          stackNaming={stackNaming}
          stackRoster={stackRoster}
          phase={activePhase}
          viewerRole={viewerRole}
          selectedUnitIds={selectedUnitIds}
          selectedCombatTargetId={selectedCombatTargetId}
          combatRangeHexKeys={combatRangeHexKeys}
          combatTargetIds={combatTargetIds}
          escapeHexes={escapeHexes}
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
