import type { Dispatch, SetStateAction } from 'react'

import type { TurnPhase } from '../../../shared/types/index'
import type { GameAction, ServerGameSnapshot } from '../gameClient'
import type { GameSessionController } from '../gameSessionTypes'
import type { Mode } from '../battlefieldView'
import type { SessionCatalog } from '../sessionCatalog'

/** Inputs used by the battlefield interaction hook. */
export type UseBattlefieldInteractionStateOptions = {
	activeSessionController: GameSessionController | null
	isLifecycleActive?: boolean
	activeTurnActive: boolean
	clientSnapshot: ServerGameSnapshot | null
	clientSnapshotPhase: TurnPhase | null
	catalog: SessionCatalog | null
	isControlledSession: boolean
	isInteractionLocked: boolean
	isSelectionLocked: boolean
}

/** Prompt shown before committing a move that would ram an occupied hex. */
export type RamPrompt = {
	unitId: string
	to: { q: number; r: number }
	targetLabel: string
}

/** Client-local selection, targeting, prompt, and action feedback state. */
export type BattlefieldInteractionState = {
	selectedUnitIds: string[] | null
	hasExplicitSelection: boolean
	selectedCombatTargetId: string | null
	activeMode: Mode
	actionError: string | null
	combatBaseSnapshot: ServerGameSnapshot | null
	pendingCombatResolution: ServerGameSnapshot['combatResolution'] | null
	pendingRamResolution: ServerGameSnapshot['ramResolution'] | null
	pendingRamPrompt: RamPrompt | null
	lastRefreshAt: Date | null
	isRefreshing: boolean
}

/** Public controller returned by the battlefield interaction hook. */
export type BattlefieldInteractionController = {
	interactionState: BattlefieldInteractionState
	actionError: string | null
	combatBaseSnapshot: ServerGameSnapshot | null
	commitClientAction: (action: GameAction) => Promise<void>
	handleDeselectUnit: () => void
	handleDismissCombatResolution: () => void
	handleDismissRamResolution: (resolutionIndex: number) => void
	handleMoveUnit: (unitId: string, to: { q: number; r: number }) => Promise<void>
	handleResolveRamPrompt: (attemptRam: boolean) => void
	handleRefresh: () => Promise<void>
	handleSelectUnit: (unitId: string, additive?: boolean) => void
	handleSelectStackMember: (unitId: string, stackMemberIds: readonly string[]) => void
	handleSelectAllStackMembers: (stackMemberIds: readonly string[]) => void
	handleClearStackSelection: () => void
	isRefreshing: boolean
	lastRefreshAt: Date | null
	pendingRamPrompt: RamPrompt | null
	pendingCombatResolution: ServerGameSnapshot['combatResolution'] | null
	pendingRamResolution: ServerGameSnapshot['ramResolution'] | null
	hasExplicitSelection: boolean
	activeMode: Mode
	selectedCombatTargetId: string | null
	selectedUnitIds: string[] | null
	setActiveMode: Dispatch<SetStateAction<Mode>>
	setActionError: Dispatch<SetStateAction<string | null>>
	setSelectedCombatTargetId: Dispatch<SetStateAction<string | null>>
	setSelectedUnitIds: Dispatch<SetStateAction<string[] | null>>
}
