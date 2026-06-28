// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BattlefieldRightRail } from '#web/components/BattlefieldRightRail'

describe('BattlefieldRightRail', () => {
  it('shows the attack summary above targets and hides the inspector during combat', () => {
    render(
      <BattlefieldRightRail
        activeCombatRole="defender"
        activeRole="defender"
        activeSelectedUnitCount={2}
        isCombatPhase
        showInactiveEventStream={false}
        isInteractionLocked={false}
        canDismissInactiveEventStream={false}
        pendingRamPrompt={null}
        selectedCombatAttackStrength={2}
        selectedCombatAttackerIds={['pigs-1', 'pigs-2']}
        selectedCombatAttackMemberLabels={['Little Pigs 1', 'Little Pigs 2']}
        selectedCombatTarget={null}
        selectedCombatTargetId={null}
        selectedInspectorLabel={null}
        selectedInspectorDefender={null}
        selectedInspectorOnion={null}
        readyWeaponDetails={[]}
        rightRailStackPanel={{
          isVisible: false,
          selectedStackMembers: [],
          selectedStackSelectionCount: 0,
          selectedStackSelectionIds: [],
        }}
        victoryObjectives={[]}
        escapeHexes={[]}
        inactiveEventStream={{
          entries: [],
          errorMessage: null,
          clearEntries: vi.fn(),
          isLoading: false,
          isDismissed: false,
          clearErrorMessage: vi.fn(),
        }}
        combatTargetOptions={[{ id: 'onion-1', kind: 'defender', q: 0, r: 0, status: 'operational', label: 'The Onion', detail: 'Defense: 4', defense: 4, modifiers: [] }]}
        onConfirmCombat={vi.fn()}
        onAttemptRam={vi.fn()}
        onDeclineRam={vi.fn()}
        onSelectCombatTarget={vi.fn()}
        onToggleStackMember={vi.fn()}
        onSelectAllStackMembers={vi.fn()}
        onClearStackSelection={vi.fn()}
      />,
    )

    expect(screen.getByText('Attack Planning')).not.toBeNull()
    expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Attack composition')
    expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Little Pigs 1')
    expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Little Pigs 2')
    expect(screen.getByTestId('combat-target-list')).not.toBeNull()
    expect(screen.queryByTestId('battlefield-inspector')).toBeNull()
    expect(screen.getByRole('button', { name: /resolve combat/i }).getAttribute('disabled')).not.toBeNull()
  })
})