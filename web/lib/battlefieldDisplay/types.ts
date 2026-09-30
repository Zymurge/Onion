import type { buildBattlefieldDisplayModel } from './projection'

import type { ServerGameSnapshot } from '../gameClient'
import type { GameSessionViewState } from '../gameSessionTypes'
import type { SessionBinding } from '../sessionBinding'
import type { BattlefieldInteractionState } from '../battlefieldInteraction/types'
import type { buildRightRailStackSelectionViewModel } from '../rightRailSelection'

/** Inputs used to derive the battlefield display state. */
export type UseBattlefieldDisplayStateOptions = {
	combatBaseSnapshot: ServerGameSnapshot | null
	interactionState: BattlefieldInteractionState
	sessionState: GameSessionViewState
	activeSessionBinding: SessionBinding | null
	screenLocked?: boolean
}

/** View model for the right-rail stack panel. */
export type RightRailStackPanelViewModel = {
	isVisible: boolean
	selectedStackMembers: ReturnType<typeof buildRightRailStackSelectionViewModel>['selectedStackMembers']
	selectedStackMemberIds: ReturnType<typeof buildRightRailStackSelectionViewModel>['memberUnitIds']
	selectedStackSelectionCount: number
	selectedStackSelectionIds: string[]
}

/** Complete display projection returned by the battlefield display hook. */
export type BattlefieldDisplayState = ReturnType<typeof buildBattlefieldDisplayModel>
