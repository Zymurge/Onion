// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useAppCommands } from '#web/lib/appCommands'
import type { GameAction } from '#web/lib/gameClient'

function createInteraction(overrides: Record<string, unknown> = {}) {
	return {
		commitClientAction: vi.fn().mockResolvedValue(undefined),
		handleDismissCombatResolution: vi.fn(),
		handleDismissRamResolution: vi.fn(),
		handleRefresh: vi.fn().mockResolvedValue(undefined),
		handleResolveRamPrompt: vi.fn(),
		setActionError: vi.fn(),
		...overrides,
	}
}

function createDisplay(overrides: Record<string, unknown> = {}) {
	return {
		activeCombatRole: 'onion',
		clientSnapshot: {
			gameId: 123,
			authoritativeState: {
				onions: { 'onion-1': { unitId: 'onion-1', typeId: 'TheOnion' } },
				defenders: {},
			},
		},
		displayedOnion: { unitId: 'onion-1' },
		selectedCombatAttackerIds: ['weapon:main'],
		selectedCombatTarget: {
			id: 'defender-1:treads',
			isDisabled: false,
			label: 'Defender 1 treads',
			modifiers: [],
		},
		selectedCombatAttackCount: 1,
		selectedInspectorUnitId: null,
		...overrides,
	}
}

function createNotifications() {
	return {
		dismissGameOverToast: vi.fn(),
		dismissSessionError: vi.fn(),
	}
}

function renderCommands(overrides: Record<string, unknown> = {}) {
	const interaction = createInteraction()
	const acknowledgeTurn = vi.fn()
	const setDebugOpen = vi.fn()
	const notifications = createNotifications()
	const { result } = renderHook(() => useAppCommands({
		acknowledgeTurn,
		catalog: null,
		controlsLocked: false,
		display: createDisplay(),
		inactiveEventStream: { clearEntries: vi.fn() },
		interaction,
		notifications,
		setDebugOpen,
		...overrides,
	}))

	return { result, interaction, acknowledgeTurn, notifications, setDebugOpen }
}

describe('useAppCommands', () => {
	it('routes enabled shell controls and ignores disabled controls', () => {
		const { result } = renderCommands()
		const execute = vi.fn()

		result.current.runShellControl('advance-phase', true, execute)
		result.current.runShellControl('advance-phase', false, execute)

		expect(execute).toHaveBeenCalledTimes(1)
	})

	it('submits end-phase, delegates refresh, acknowledgement, debug, and dismissal commands', async () => {
		const { result, interaction, acknowledgeTurn, notifications, setDebugOpen } = renderCommands()

		result.current.advancePhase()
		await result.current.refresh()
		result.current.acknowledgeTurn()
		result.current.toggleDebugDiagnostics()
		result.current.dismissSessionError()
		result.current.dismissActionError()
		result.current.dismissGameOverToast()
		result.current.dismissCombatResolution()
		result.current.dismissRamResolution(2)
		result.current.attemptRam()
		result.current.declineRam()

		expect(interaction.commitClientAction).toHaveBeenCalledWith({ type: 'end-phase' })
		expect(interaction.handleRefresh).toHaveBeenCalledTimes(1)
		expect(acknowledgeTurn).toHaveBeenCalledTimes(1)
		expect(setDebugOpen).toHaveBeenCalledTimes(1)
		expect(notifications.dismissSessionError).toHaveBeenCalledTimes(2)
		expect(interaction.setActionError).toHaveBeenCalledWith(null)
		expect(notifications.dismissGameOverToast).toHaveBeenCalledTimes(1)
		expect(interaction.handleDismissCombatResolution).toHaveBeenCalledTimes(1)
		expect(interaction.handleDismissRamResolution).toHaveBeenCalledWith(2)
		expect(interaction.handleResolveRamPrompt).toHaveBeenNthCalledWith(1, true)
		expect(interaction.handleResolveRamPrompt).toHaveBeenNthCalledWith(2, false)
	})

	it('submits a translated combat action when the target and attackers are valid', () => {
		const { result, interaction } = renderCommands()

		result.current.confirmCombat()

		expect(interaction.commitClientAction).toHaveBeenCalledWith({
			type: 'FIRE',
			attackers: ['weapon:main'],
			targetId: 'defender-1:treads',
			onionId: 'onion-1',
		} satisfies GameAction)
	})

	it('sets an action error instead of submitting an invalid combat command', () => {
		const interaction = createInteraction()
		const { result } = renderCommands({
			interaction,
			display: createDisplay({ selectedCombatTarget: null }),
		})

		result.current.confirmCombat()

		expect(interaction.commitClientAction).not.toHaveBeenCalled()
		expect(interaction.setActionError).not.toHaveBeenCalled()
	})

	it('does not submit combat while controls are locked', () => {
		const interaction = createInteraction()
		const { result } = renderCommands({ controlsLocked: true, interaction })

		result.current.confirmCombat()

		expect(interaction.commitClientAction).not.toHaveBeenCalled()
	})
})