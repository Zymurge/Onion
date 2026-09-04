type Navigate = (path: string) => void

type GameWindowOptions = {
	navigate?: Navigate
	windowOpen?: (url?: string, target?: string, features?: string) => Window | null
}

export function openGameWindow(path: string, options: GameWindowOptions = {}): void {
	if (typeof window === 'undefined') {
		options.navigate?.(path)
		return
	}

	const fallback = options.navigate ?? ((destination: string) => window.location.assign(destination))

	try {
		const openedWindow = (options.windowOpen ?? window.open).call(window, path, '_blank', 'noopener,noreferrer')
		if (openedWindow !== null) {
			openedWindow.focus?.()
			return
		}
	} catch (error) {
		void error
	}

	fallback(path)
}