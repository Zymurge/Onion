// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { openGameWindow, prepareGameWindow } from '#web/lib/gameNavigation'

describe('openGameWindow', () => {
	it('opens the game in a new window and focuses it', () => {
		const gameWindow = { focus: vi.fn() } as unknown as Window
		const windowOpen = vi.fn().mockReturnValue(gameWindow)
		const navigate = vi.fn()

		openGameWindow('/game/12', { navigate, windowOpen })

		expect(windowOpen).toHaveBeenCalledWith('/game/12', '_blank')
		expect(gameWindow.focus).toHaveBeenCalledTimes(1)
		expect(navigate).not.toHaveBeenCalled()
	})

	it('falls back to same-window navigation when the popup is blocked', () => {
		const navigate = vi.fn()

		openGameWindow('/game/12', { navigate, windowOpen: vi.fn().mockReturnValue(null) })

		expect(navigate).toHaveBeenCalledWith('/game/12')
	})

	it('falls back when opening a window throws', () => {
		const navigate = vi.fn()

		openGameWindow('/game/12', { navigate, windowOpen: vi.fn().mockImplementation(() => { throw new Error('blocked') }) })

		expect(navigate).toHaveBeenCalledWith('/game/12')
	})
})

describe('prepareGameWindow', () => {
	it('reserves a child window before completing its navigation', () => {
		const gameWindow = {
			close: vi.fn(),
			focus: vi.fn(),
			location: { href: '' },
		} as unknown as Window
		const windowOpen = vi.fn().mockReturnValue(gameWindow)

		const preparedWindow = prepareGameWindow({ windowOpen })
		preparedWindow?.complete('/game/12')

		expect(windowOpen).toHaveBeenCalledWith('', '_blank')
		expect(gameWindow.location.href).toBe('/game/12')
		expect(gameWindow.focus).toHaveBeenCalledTimes(1)
	})

	it('returns no reservation when the popup is blocked', () => {
		const preparedWindow = prepareGameWindow({ windowOpen: vi.fn().mockReturnValue(null) })

		expect(preparedWindow).toBeNull()
	})
})