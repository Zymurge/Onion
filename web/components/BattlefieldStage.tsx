import { HexMapBoard } from './HexMapBoard'
import type { BattlefieldActionEligibility } from '../lib/actionEligibility/projection'
import type { BattlefieldDefenderView, BattlefieldOnionView } from '../lib/battlefieldView'
import type { StackRosterState } from '../../shared/types/index'
import type { SessionCatalog } from '../lib/sessionCatalog'

type BattlefieldStageProps = {
  activePhase: string | null
  activeTurnActive: boolean
  actionEligibility: BattlefieldActionEligibility
  eventFocusedUnitIds?: ReadonlyArray<string>
  defenders: ReadonlyArray<BattlefieldDefenderView>
  onions: ReadonlyArray<BattlefieldOnionView>
  stackNaming?: import('../../shared/stackNaming').StackNamingSnapshot
  stackRoster?: StackRosterState
  catalog?: SessionCatalog
  scenarioMap: {
    width: number
    height: number
    cells: ReadonlyArray<{ q: number; r: number }>
    hexes: ReadonlyArray<{ q: number; r: number; t: number }>
  } | null
  selectedCombatTargetId: string | null
  selectedUnitIds: ReadonlyArray<string>
  combatRangeHexKeys: ReadonlySet<string>
  combatTargetIds: ReadonlySet<string>
  escapeHexes: ReadonlyArray<{ q: number; r: number }>
  canSubmitMove: boolean
  isSelectionLocked: boolean
  isInspectionOnly?: boolean
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
  actionEligibility,
  eventFocusedUnitIds = [],
  defenders,
  onions,
  stackNaming,
  stackRoster,
  catalog,
  scenarioMap,
  selectedCombatTargetId,
  selectedUnitIds,
  combatRangeHexKeys,
  combatTargetIds,
  escapeHexes,
  canSubmitMove,
  isSelectionLocked,
  isInspectionOnly = false,
  isInteractionLocked,
  viewerRole,
  onDeselect,
  onMoveUnit,
  onSelectCombatTarget,
  onSelectUnit,
}: BattlefieldStageProps) {
  return (
    <section className="panel map-stage" data-testid="app-battlefield-stage">
      <div className="map-frame">
        {scenarioMap === null ? <p className="summary-line">Waiting for battlefield data.</p> : (
          <HexMapBoard
            scenarioMap={scenarioMap}
            defenders={defenders}
            onions={onions}
            stackNaming={stackNaming}
            stackRoster={stackRoster}
            catalog={catalog}
            phase={activePhase}
            actionEligibility={actionEligibility}
            eventFocusedUnitIds={eventFocusedUnitIds}
            viewerRole={viewerRole}
            selectedUnitIds={selectedUnitIds}
            selectedCombatTargetId={selectedCombatTargetId}
            combatRangeHexKeys={combatRangeHexKeys}
            combatTargetIds={combatTargetIds}
            escapeHexes={escapeHexes}
            canSubmitMove={canSubmitMove && activeTurnActive && !isInteractionLocked}
            isInteractionLocked={isInteractionLocked}
            isSelectionLocked={isSelectionLocked}
            isInspectionOnly={isInspectionOnly}
            onSelectUnit={onSelectUnit}
            onSelectCombatTarget={onSelectCombatTarget}
            onDeselect={onDeselect}
            onMoveUnit={onMoveUnit}
          />
        )}
      </div>
    </section>
  )
}
