import { useEffect, useRef, useSyncExternalStore } from 'react'

import type { GameSessionController, UseGameSessionOptions } from './gameSessionTypes'

export function useGameSession(controller: GameSessionController, options: UseGameSessionOptions = {}) {
	const { autoLoad = true, disposeOnUnmount = true } = options
	const activeControllerRef = useRef(controller)
	const mountedRef = useRef(false)

	useEffect(() => {
		activeControllerRef.current = controller
	}, [controller])

	useEffect(() => {
		mountedRef.current = true

		return () => {
			mountedRef.current = false
		}
	}, [])

	useEffect(() => {
		if (autoLoad) {
			void controller.load()
		}

		return () => {
			if (disposeOnUnmount) {
				queueMicrotask(() => {
					if (!mountedRef.current || activeControllerRef.current !== controller) {
						controller.dispose()
					}
				})
			}
		}
	}, [autoLoad, controller, disposeOnUnmount])

	return useSyncExternalStore(
		controller.subscribe,
		controller.getSnapshot,
		controller.getSnapshot,
	)
}