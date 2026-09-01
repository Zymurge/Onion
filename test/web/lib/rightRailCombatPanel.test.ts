import { describe, expect, it } from 'vitest'

import { buildRightRailCombatPanelViewModel } from '#web/lib/rightRailCombatPanel'
import { makeBattlefieldDefender } from '#test/utils/gameStateUtils'

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
      selectedInspectorDefender: makeBattlefieldDefender({
        unitId: 'pigs-1',
        typeId: 'LittlePigs',
        position: { q: 4, r: 4 },
        friendlyName: 'Little Pigs 1',
      }),
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
      selectedCombatTarget: {
        id: 'onion-1',
        kind: 'onion',
        q: 0,
        r: 0,
        status: 'operational',
        label: 'Onion',
        detail: 'Defense: 3',
        defense: 3,
        modifiers: [],
      },
      combatTargetOptions: [{
        id: 'onion-1',
        kind: 'onion',
        q: 0,
        r: 0,
        status: 'operational',
        label: 'Onion',
        detail: 'Defense: 3',
        defense: 3,
        modifiers: [],
      }],
      rightRailStackPanel: {
        isVisible: true,
        selectedStackMembers: [],
        selectedStackSelectionCount: 0,
        selectedStackSelectionIds: [],
      },
    })).toMatchObject({
      selectedCombatTargetTitle: 'Target: Onion',
      hasCombatTargets: true,
      hasSelectedTarget: true,
      combatTargetCountLabel: '1 in range',
    })
  })
})