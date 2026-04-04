import { useEffect, useSyncExternalStore } from 'react'

import type { GameSessionController, UseGameSessionOptions } from './gameSessionTypes'

export function useGameSession(controller: GameSessionController, options: UseGameSessionOptions = {}) {
	const { autoLoad = true, disposeOnUnmount = true } = options

	useEffect(() => {
		if (autoLoad) {
			void controller.load()
		}

		return () => {
			if (disposeOnUnmount) {
				controller.dispose()
			}
		}
	}, [autoLoad, controller, disposeOnUnmount])

	return useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	)
}