// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import { clearAuthSession, getAuthSession, saveAuthSession, type AuthSession } from '#web/lib/authSession'

const session: AuthSession = {
	apiBaseUrl: 'http://localhost:3000',
	username: 'player-1',
	userId: 'user-1',
	token: 'token-1',
}

describe('authSession', () => {
	beforeEach(() => {
		window.sessionStorage.clear()
	})

	it('round trips an authenticated browser session', () => {
		saveAuthSession(session)

		expect(getAuthSession()).toEqual(session)
	})

	it('clears an authenticated browser session', () => {
		saveAuthSession(session)
		clearAuthSession()

		expect(getAuthSession()).toBeNull()
	})

	it('ignores malformed stored data', () => {
		window.sessionStorage.setItem('onion.auth.session', '{bad json')

		expect(getAuthSession()).toBeNull()
	})
})