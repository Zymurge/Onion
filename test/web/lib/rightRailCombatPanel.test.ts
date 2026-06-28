import { describe, expect, it } from 'vitest'

import { buildRightRailCombatPanelViewModel } from '#web/lib/rightRailCombatPanel'

describe('rightRailCombatPanel', () => {
  it('shows the combat panel only during the active combat phase when no inspector target is selected', () => {
    expect(buildRightRailCombatPanelViewModel({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      selectedInspectorDefender: null,
      selectedCombatTarget: null,
      combatTargetOptions: [],
      rightRailStackPanel: {
        isVisible: true,
        selectedStackMembers: [],
        selectedStackSelectionCount: 0,
        selectedStackSelectionIds: [],
      },
    })).toMatchObject({
      shouldShowCombatPanel: true,
      combatTargetCount: 0,
      combatTargetCountLabel: '0 in range',
      hasCombatTargets: false,
      hasSelectedTarget: false,
      stackSelectionPanelVisible: true,
      stackSelectionCountLabel: '0/0',
    })

    expect(buildRightRailCombatPanelViewModel({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      selectedInspectorDefender: { id: 'pigs-1', type: 'LittlePigs', status: 'operational', q: 4, r: 4, move: 3, weapons: 'main: ready', attack: '1 / rng 1', friendlyName: 'Little Pigs 1' },
      selectedCombatTarget: null,
      combatTargetOptions: [],
      rightRailStackPanel: {
        isVisible: true,
        selectedStackMembers: [],
        selectedStackSelectionCount: 0,
        selectedStackSelectionIds: [],
      },
    })).toMatchObject({
      shouldShowCombatPanel: false,
    })
  })

  it('derives the combat target label from the selected target', () => {
    expect(buildRightRailCombatPanelViewModel({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      selectedInspectorDefender: null,
      selectedCombatTarget: { id: 'onion-1', label: 'Onion', defense: 3, modifiers: [] },
      combatTargetOptions: [{ id: 'onion-1', label: 'Onion', defense: 3, modifiers: [] }],
      rightRailStackPanel: {
        isVisible: true,
        selectedStackMembers: [],
        selectedStackSelectionCount: 0,
        selectedStackSelectionIds: [],
      },
    })).toMatchObject({
      selectedCombatTargetTitle: 'Confirm attack on Onion',
      hasCombatTargets: true,
      hasSelectedTarget: true,
      combatTargetCountLabel: '1 in range',
    })
  })
})