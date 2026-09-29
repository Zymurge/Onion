import { useMemo } from 'react'

import { buildBattlefieldDisplayModel } from './projection'
import type { BattlefieldDisplayState, UseBattlefieldDisplayStateOptions } from './types'

/** Derives display-ready battlefield state from session and interaction inputs. */
export function useBattlefieldDisplayState({
	combatBaseSnapshot,
	interactionState,
	sessionState,
	activeSessionBinding,
	screenLocked = false,
}: UseBattlefieldDisplayStateOptions): BattlefieldDisplayState {
	return useMemo(
		() => buildBattlefieldDisplayModel({
			combatBaseSnapshot,
			interactionState,
			sessionState,
			activeSessionBinding,
			screenLocked,
		}),
		[
			activeSessionBinding,
			combatBaseSnapshot,
			interactionState,
			sessionState,
			screenLocked,
		],
	)
}
