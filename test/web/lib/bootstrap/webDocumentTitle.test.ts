import { describe, expect, it } from 'vitest'

import { resolveWebDocumentTitle } from '#web/lib/appBootstrap'

describe('resolveWebDocumentTitle', () => {
	it('names game views with their game number', () => {
		expect(resolveWebDocumentTitle({ gameId: 42, userRoute: null })).toBe('Onion - Game 42')
	})

	it('names every lobby route as the lobby', () => {
		for (const userRoute of ['create', 'login', 'game-create', 'dashboard', 'games'] as const) {
			expect(resolveWebDocumentTitle({ gameId: 42, userRoute })).toBe('Onion - Lobby')
		}

		expect(resolveWebDocumentTitle({ gameId: null, userRoute: null })).toBe('Onion - Lobby')
	})
})