// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BattlefieldRightRail } from '#web/components/BattlefieldRightRail'

describe('BattlefieldRightRail', () => {
  it('uses the shared confirmation header for ram prompts', () => {
    render(
      <BattlefieldRightRail
        activeCombatRole={null}
        activeRole="onion"
        activeSelectedUnitCount={0}
        isCombatPhase={false}
        showInactiveEventStream={false}
        isInteractionLocked={false}
        canDismissInactiveEventStream={false}
        pendingRamPrompt={{ unitId: 'onion-1', targetLabel: 'Little Pigs group 1', to: { q: 2, r: 3 } }}
        selectedCombatAttackStrength={0}
        selectedCombatAttackerIds={[]}
        selectedCombatAttackMemberLabels={[]}
        selectedCombatTarget={null}
        selectedCombatTargetId={null}
        selectedInspectorLabel={null}
        selectedInspectorDefender={null}
        selectedInspectorOnion={null}
        readyWeaponDetails={[]}
        rightRailStackPanel={{ isVisible: false, selectedStackMembers: [], selectedStackSelectionCount: 0, selectedStackSelectionIds: [] }}
        victoryObjectives={[]}
        escapeHexes={[]}
        inactiveEventStream={{ entries: [], errorMessage: null, clearEntries: vi.fn(), isLoading: false, isDismissed: false, clearErrorMessage: vi.fn() }}
        combatTargetOptions={[]}
        onConfirmCombat={vi.fn()}
        onAttemptRam={vi.fn()}
        onDeclineRam={vi.fn()}
        onSelectCombatTarget={vi.fn()}
        onToggleStackMember={vi.fn()}
        onSelectAllStackMembers={vi.fn()}
        onClearStackSelection={vi.fn()}
      />,
    )

    const confirmation = screen.getByTestId('ram-confirmation-view')
    expect(confirmation.querySelector('.combat-confirmation-head h3')?.textContent).toBe('Attempt ram on Little Pigs group 1')
    expect(confirmation.querySelector('.eyebrow')?.textContent).toBe('Movement')
    expect(confirmation.querySelector('.mini-tag-live')?.textContent).toBe('confirmation')
  })

  it('shows the attack summary above targets and hides the inspector during combat', () => {
    const onSelectCombatTarget = vi.fn()
    render(
      <BattlefieldRightRail
		activeCombatRole="onion"
		activeRole="onion"
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
        combatTargetOptions={[{ id: 'LittlePigs:1,1', kind: 'defender', q: 1, r: 1, status: 'operational', label: 'Little Pigs group 1', detail: 'Defense: 2', defense: 2, modifiers: [] }]}
        onConfirmCombat={vi.fn()}
        onAttemptRam={vi.fn()}
        onDeclineRam={vi.fn()}
        onSelectCombatTarget={onSelectCombatTarget}
        onToggleStackMember={vi.fn()}
        onSelectAllStackMembers={vi.fn()}
        onClearStackSelection={vi.fn()}
      />,
    )

    expect(screen.getByText('Attack Planning')).not.toBeNull()
    expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Attack composition')
    expect(screen.getByTestId('confirmation-surface')).not.toBeNull()
    expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Little Pigs 1')
    expect(screen.getByTestId('combat-confirmation-view').textContent).toContain('Little Pigs 2')
    expect(screen.getByTestId('combat-target-list')).not.toBeNull()
    expect(screen.queryByTestId('battlefield-inspector')).toBeNull()
    expect(screen.getByRole('button', { name: /resolve combat/i }).getAttribute('disabled')).not.toBeNull()

	fireEvent.click(screen.getByTestId('combat-target-LittlePigs:1,1'))
	expect(onSelectCombatTarget).toHaveBeenCalledWith('LittlePigs:1,1')
  })
})