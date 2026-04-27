import type { CombatTargetOption } from './combatPreview'
import type { BattlefieldOnionView, BattlefieldUnit } from './battlefieldView'

type RightRailStackPanelState = {
  isVisible: boolean
  selectedStackMembers: ReadonlyArray<BattlefieldUnit | BattlefieldOnionView>
  selectedStackSelectionCount: number
  selectedStackSelectionIds: ReadonlyArray<string>
}

export type RightRailCombatPanelViewModel = {
  shouldShowCombatPanel: boolean
  combatTargetCount: number
  combatTargetCountLabel: string
  selectedCombatTargetTitle: string | null
  hasCombatTargets: boolean
  hasSelectedTarget: boolean
  stackSelectionPanelVisible: boolean
  stackSelectionCountLabel: string
}

export function buildRightRailCombatPanelViewModel({
  activeCombatRole,
  activeRole,
  isCombatPhase,
  selectedInspectorDefender,
  selectedCombatTarget,
  combatTargetOptions,
  rightRailStackPanel,
}: {
  activeCombatRole: 'onion' | 'defender' | null
  activeRole: 'onion' | 'defender' | null
  isCombatPhase: boolean
  selectedInspectorDefender: BattlefieldUnit | null
  selectedCombatTarget: CombatTargetOption | null
  combatTargetOptions: ReadonlyArray<CombatTargetOption>
  rightRailStackPanel: RightRailStackPanelState
}): RightRailCombatPanelViewModel {
  const shouldShowCombatPanel = isCombatPhase && activeRole === activeCombatRole && selectedInspectorDefender === null
  const combatTargetCount = combatTargetOptions.length

  return {
    shouldShowCombatPanel,
    combatTargetCount,
    combatTargetCountLabel: `${combatTargetCount} in range`,
    selectedCombatTargetTitle: selectedCombatTarget === null ? null : `Confirm attack on ${selectedCombatTarget.label}`,
    hasCombatTargets: combatTargetCount > 0,
    hasSelectedTarget: selectedCombatTarget !== null,
    stackSelectionPanelVisible: rightRailStackPanel.isVisible,
    stackSelectionCountLabel: `${rightRailStackPanel.selectedStackSelectionCount}/${rightRailStackPanel.selectedStackMembers.length}`,
  }
}