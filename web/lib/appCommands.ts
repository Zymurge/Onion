import type { Dispatch, SetStateAction } from 'react'

import type { GameAction, ServerGameSnapshot } from './gameClient'
import { buildCombatCommitAction, buildEndPhaseCommitAction } from './commitActionBuilders'
import type { SessionCatalog } from './sessionCatalog'
import { routeShellControl, type ShellControl } from './shellControlRouting'
import logger from './logger'

type CommandDisplayState = {
	activeCombatRole: 'onion' | 'defender' | null
	clientSnapshot: ServerGameSnapshot | null
	displayedOnion: { unitId: string } | null
	selectedCombatAttackerIds: readonly string[]
	selectedCombatAttackCount: number
	selectedCombatTarget: {
		id: string
		isDisabled?: boolean
		label: string
		modifiers: ReadonlyArray<string>
	} | null
	selectedInspectorUnitId: string | null
}

type CommandInteraction = {
	commitClientAction: (action: GameAction) => Promise<unknown> | void
	handleDismissCombatResolution: () => void
	handleDismissRamResolution: (index: number) => void
	handleRefresh: () => Promise<unknown> | void
	handleResolveRamPrompt: (attemptRam: boolean) => void
	setActionError: (message: string | null) => void
}

type CommandNotifications = {
	dismissGameOverToast: () => void
	dismissSessionError: () => void
}

export type AppCommandsOptions = {
	acknowledgeTurn: () => void
	catalog: SessionCatalog | null
	controlsLocked: boolean
	display: CommandDisplayState
	inactiveEventStream: { clearEntries: () => void }
	interaction: CommandInteraction
	notifications: CommandNotifications
	setDebugOpen: Dispatch<SetStateAction<boolean>>
}

export type AppCommands = {
	runShellControl: (control: ShellControl, enabled: boolean, execute: () => void) => void
	advancePhase: () => void
	acknowledgeTurn: () => void
	refresh: () => Promise<unknown> | void
	toggleDebugDiagnostics: () => void
	confirmCombat: () => void
	attemptRam: () => void
	declineRam: () => void
	dismissActionError: () => void
	dismissSessionError: () => void
	dismissGameOverToast: () => void
	dismissCombatResolution: () => void
	dismissRamResolution: (index: number) => void
}

export function useAppCommands({
	acknowledgeTurn,
	catalog,
	controlsLocked,
	display,
	interaction,
	notifications,
	setDebugOpen,
}: AppCommandsOptions): AppCommands {
	function runShellControl(control: ShellControl, enabled: boolean, execute: () => void) {
		const decision = routeShellControl(
			{
				surface: 'header/control',
				control,
				enabled,
			},
			(trace) => {
				logger.debug('[app-debug] shell control routed', {
					ts: Date.now(),
					...trace,
				})
			},
		)

		if (decision.intent !== 'noop') {
			execute()
		}
	}

	function advancePhase() {
		void interaction.commitClientAction(buildEndPhaseCommitAction().action)
	}

	function toggleDebugDiagnostics() {
		setDebugOpen((value) => !value)
	}

	function confirmCombat() {
		if (controlsLocked) {
			return
		}

		const { selectedCombatTarget, selectedCombatAttackCount, displayedOnion } = display
		if (selectedCombatTarget === null || selectedCombatTarget.isDisabled === true || selectedCombatAttackCount === 0 || displayedOnion === null) {
			return
		}

		const combatAction = buildCombatCommitAction({
			state: {
				...display.clientSnapshot?.authoritativeState,
				catalog: catalog ?? undefined,
			} as Parameters<typeof buildCombatCommitAction>[0]['state'],
			anchorUnitId: display.activeCombatRole === 'defender' ? display.selectedInspectorUnitId : null,
			selectedUnitIds: display.selectedCombatAttackerIds,
			targetId: selectedCombatTarget.id,
			onionId: displayedOnion.unitId,
		})

		if (!combatAction.ok) {
			interaction.setActionError(
				combatAction.reason === 'empty-stack-selection'
					? 'Select at least one stack member before resolving combat.'
					: combatAction.reason === 'missing-onion'
						? 'Loaded game snapshot is missing the canonical Onion unit ID.'
						: combatAction.reason === 'snapshot-missing-stack-selection'
							? 'Loaded game snapshot is missing canonical stackRoster data for the selected unit.'
							: 'Unable to resolve combat from the current selection.',
			)
			return
		}

		void interaction.commitClientAction(combatAction.action)
	}

	function dismissActionError() {
		notifications.dismissSessionError()
		interaction.setActionError(null)
	}

	return {
		runShellControl,
		advancePhase,
		acknowledgeTurn,
		refresh: interaction.handleRefresh,
		toggleDebugDiagnostics,
		confirmCombat,
		attemptRam: () => interaction.handleResolveRamPrompt(true),
		declineRam: () => interaction.handleResolveRamPrompt(false),
		dismissActionError,
		dismissSessionError: notifications.dismissSessionError,
		dismissGameOverToast: notifications.dismissGameOverToast,
		dismissCombatResolution: interaction.handleDismissCombatResolution,
		dismissRamResolution: interaction.handleDismissRamResolution,
	}
}