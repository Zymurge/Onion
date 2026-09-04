// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { openGameWindow } from '#web/lib/gameNavigation'

describe('openGameWindow', () => {
	it('opens the game in a new window and focuses it', () => {
		const gameWindow = { focus: vi.fn() } as unknown as Window
		const windowOpen = vi.fn().mockReturnValue(gameWindow)
		const navigate = vi.fn()

		openGameWindow('/game/12', { navigate, windowOpen })

		expect(windowOpen).toHaveBeenCalledWith('/game/12', '_blank', 'noopener,noreferrer')
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