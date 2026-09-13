type Navigate = (path: string) => void

type GameWindowOptions = {
	navigate?: Navigate
	windowOpen?: (url?: string, target?: string, features?: string) => Window | null
}

export type PreparedGameWindow = {
	complete: (path: string) => void
	cancel: () => void
}

export function prepareGameWindow(options: GameWindowOptions = {}): PreparedGameWindow | null {
	if (options.navigate) {
		return {
			complete: options.navigate,
			cancel: () => undefined,
		}
	}

	if (typeof window === 'undefined') {
		return null
	}

	try {
		const openedWindow = (options.windowOpen ?? window.open).call(window, '', '_blank')
		if (openedWindow === null) {
			return null
		}

		openedWindow.opener = null
		return {
			complete: (path: string) => {
				openedWindow.location.href = path
				openedWindow.focus?.()
			},
			cancel: () => openedWindow.close?.(),
		}
	} catch (error) {
		void error
		return null
	}
}

export function openGameWindow(path: string, options: GameWindowOptions = {}): void {
	if (typeof window === 'undefined') {
		options.navigate?.(path)
		return
	}

	const fallback = options.navigate ?? ((destination: string) => window.location.assign(destination))

	try {
		const openedWindow = (options.windowOpen ?? window.open).call(window, path, '_blank')
		if (openedWindow !== null) {
			openedWindow.opener = null
			openedWindow.focus?.()
			return
		}
	} catch (error) {
		void error
	}

	fallback(path)
}