// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'

import { BattlefieldRightRail } from '#web/components/BattlefieldRightRail'
import type { BattlefieldUnit } from '#web/lib/battlefieldView'

type RightRailProps = ComponentProps<typeof BattlefieldRightRail>

function createDefender(overrides: Partial<BattlefieldUnit> = {}): BattlefieldUnit {
  return {
    unitId: 'pigs-1',
    typeId: 'LittlePigs',
    role: 'defender',
    friendlyName: 'Little Pigs 1',
    state: 'operational',
    position: { q: 1, r: 1 },
    weapons: [],
    movesRemaining: 3,
    stackSize: 1,
    actionableModes: ['fire'],
    ...overrides,
  }
}

function renderRightRail(overrides: Partial<RightRailProps> = {}) {
  const props: RightRailProps = {
    activeCombatRole: null,
    activeRole: 'onion',
    activeSelectedUnitCount: 0,
    isCombatPhase: false,
    showInactiveEventStream: false,
    isInteractionLocked: false,
    canDismissInactiveEventStream: false,
    pendingRamPrompt: null,
    selectedCombatAttackStrength: 0,
    selectedCombatAttackerIds: [],
    selectedCombatAttackMemberLabels: [],
    selectedCombatTarget: null,
    selectedCombatTargetId: null,
    selectedInspectorLabel: null,
    selectedInspectorDefender: null,
    selectedInspectorOnion: null,
    readyWeaponDetails: [],
    rightRailStackPanel: {
      isVisible: false,
      selectedStackMembers: [],
      selectedStackSelectionCount: 0,
      selectedStackSelectionIds: [],
    },
    victoryObjectives: [],
    escapeHexes: [],
    inactiveEventStream: {
      entries: [],
      errorMessage: null,
      clearEntries: vi.fn(),
      isLoading: false,
      isDismissed: false,
      clearErrorMessage: vi.fn(),
    },
    combatTargetOptions: [],
    onConfirmCombat: vi.fn(),
    onAttemptRam: vi.fn(),
    onDeclineRam: vi.fn(),
    onSelectCombatTarget: vi.fn(),
    onToggleStackMember: vi.fn(),
    onSelectAllStackMembers: vi.fn(),
    onClearStackSelection: vi.fn(),
    ...overrides,
  }

  return render(<BattlefieldRightRail {...props} />)
}

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

  it('routes both ram confirmation decisions to their callbacks', () => {
    const onAttemptRam = vi.fn()
    const onDeclineRam = vi.fn()

    renderRightRail({
      pendingRamPrompt: { unitId: 'onion-1', targetLabel: 'Little Pigs group 1', to: { q: 2, r: 3 } },
      onAttemptRam,
      onDeclineRam,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Attempt ram' }))
    fireEvent.click(screen.getByRole('button', { name: 'Move without ram' }))

    expect(onAttemptRam).toHaveBeenCalledOnce()
    expect(onDeclineRam).toHaveBeenCalledOnce()
  })

  it('keeps ram decisions disabled while interaction is locked', () => {
    const onAttemptRam = vi.fn()
    const onDeclineRam = vi.fn()

    renderRightRail({
      isInteractionLocked: true,
      pendingRamPrompt: { unitId: 'onion-1', targetLabel: 'Little Pigs group 1', to: { q: 2, r: 3 } },
      onAttemptRam,
      onDeclineRam,
    })

    const attemptButton = screen.getByRole('button', { name: 'Attempt ram' })
    const declineButton = screen.getByRole('button', { name: 'Move without ram' })
    expect(attemptButton).toBeDisabled()
    expect(declineButton).toBeDisabled()
    fireEvent.click(attemptButton)
    fireEvent.click(declineButton)
    expect(onAttemptRam).not.toHaveBeenCalled()
    expect(onDeclineRam).not.toHaveBeenCalled()
  })

  it('confirms a ready combat attack after a target is selected', () => {
    const onConfirmCombat = vi.fn()
    const target = {
      id: 'LittlePigs:1,1',
      kind: 'defender' as const,
      q: 1,
      r: 1,
      status: 'operational' as const,
      label: 'Little Pigs group 1',
      detail: 'Defense: 2',
      defense: 2,
      modifiers: [],
    }

    renderRightRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      selectedCombatAttackStrength: 3,
      selectedCombatAttackerIds: ['weapon:main-1'],
      selectedCombatTarget: target,
      selectedCombatTargetId: target.id,
      combatTargetOptions: [target],
      onConfirmCombat,
    })

    const confirmButton = screen.getByRole('button', { name: 'Resolve combat' })
    expect(confirmButton).not.toBeDisabled()

    fireEvent.click(confirmButton)

    expect(onConfirmCombat).toHaveBeenCalledOnce()
  })

  it('routes weapon targets as subsystem selections', () => {
    const onSelectCombatTarget = vi.fn()
    const target = {
      id: 'weapon:main-1',
      kind: 'defender' as const,
      q: 0,
      r: 0,
      status: 'operational' as const,
      label: 'Main gun',
      detail: 'Attack: 2',
      defense: 0,
      modifiers: [],
    }

    renderRightRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      selectedCombatAttackStrength: 2,
      combatTargetOptions: [target],
      onSelectCombatTarget,
    })

    fireEvent.click(screen.getByTestId('combat-target-weapon:main-1'))

    expect(onSelectCombatTarget).toHaveBeenCalledWith('weapon:main-1')
  })

  it('routes stack member, select-all, and clear controls', () => {
    const onToggleStackMember = vi.fn()
    const onSelectAllStackMembers = vi.fn()
    const onClearStackSelection = vi.fn()

    renderRightRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      rightRailStackPanel: {
        isVisible: true,
        selectedStackMembers: [
          createDefender({ unitId: 'pigs-1', friendlyName: 'Little Pigs 1' }),
          createDefender({ unitId: 'pigs-2', friendlyName: 'Little Pigs 2' }),
        ],
        selectedStackSelectionCount: 1,
        selectedStackSelectionIds: ['pigs-1'],
      },
      onToggleStackMember,
      onSelectAllStackMembers,
      onClearStackSelection,
    })

    expect(screen.getByText('1/2')).not.toBeNull()
    expect(screen.getByTestId('stack-member-pigs-1')).toHaveAttribute('data-selected', 'true')
    expect(screen.getByTestId('stack-member-pigs-2')).toHaveAttribute('data-selected', 'false')

    fireEvent.click(screen.getByTestId('stack-member-pigs-2'))
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onToggleStackMember).toHaveBeenCalledWith('pigs-2')
    expect(onSelectAllStackMembers).toHaveBeenCalledOnce()
    expect(onClearStackSelection).toHaveBeenCalledOnce()
  })

  it('disables stack controls and non-ready defenders while interaction is locked', () => {
    const onToggleStackMember = vi.fn()
    const onSelectAllStackMembers = vi.fn()
    const onClearStackSelection = vi.fn()

    renderRightRail({
      activeCombatRole: 'defender',
      activeRole: 'defender',
      isCombatPhase: true,
      isInteractionLocked: true,
      rightRailStackPanel: {
        isVisible: true,
        selectedStackMembers: [createDefender({ actionableModes: [] })],
        selectedStackSelectionCount: 0,
        selectedStackSelectionIds: [],
      },
      onToggleStackMember,
      onSelectAllStackMembers,
      onClearStackSelection,
    })

    const memberButton = screen.getByTestId('stack-member-pigs-1')
    expect(memberButton).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Select all' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()

    fireEvent.click(memberButton)
    fireEvent.click(screen.getByRole('button', { name: 'Select all' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onToggleStackMember).not.toHaveBeenCalled()
    expect(onSelectAllStackMembers).not.toHaveBeenCalled()
    expect(onClearStackSelection).not.toHaveBeenCalled()
  })

  it('shows the no-valid-targets fallback when combat has no targets in range', () => {
    renderRightRail({
      activeCombatRole: 'onion',
      activeRole: 'onion',
      isCombatPhase: true,
      selectedCombatAttackStrength: 2,
      selectedCombatAttackerIds: ['weapon:main-1'],
    })

    expect(screen.getByText('No valid targets are currently in range.')).not.toBeNull()
    expect(screen.queryByTestId('combat-target-list')).toBeNull()
  })

  it('passes inactive event loading, error, and dismissal controls through', () => {
    const clearEntries = vi.fn()
    const clearErrorMessage = vi.fn()

    renderRightRail({
      showInactiveEventStream: true,
      canDismissInactiveEventStream: false,
      inactiveEventStream: {
        entries: [],
        errorMessage: 'Unable to refresh remote results.',
        clearEntries,
        isLoading: true,
        isDismissed: false,
        clearErrorMessage,
      },
    })

    expect(screen.getByTestId('inactive-event-stream')).not.toBeNull()
    expect(screen.getByText('Unable to refresh remote results.')).not.toBeNull()
    expect(screen.getByText('Refreshing remote results.')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Dismiss inactive event stream' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }))

    expect(clearEntries).not.toHaveBeenCalled()
    expect(clearErrorMessage).toHaveBeenCalledOnce()
  })
})