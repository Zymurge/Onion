// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
	AUTH_SESSION_STORAGE_KEY,
	clearAuthSession,
	getAuthSession,
	isAuthSessionExpired,
	saveAuthSession,
	type AuthSession,
} from '#web/lib/authSession'

const session: AuthSession = {
	apiBaseUrl: 'http://localhost:3000',
	username: 'player-1',
	userId: 'user-1',
	token: 'token-1',
}

describe('authSession', () => {
	beforeEach(() => {
		window.localStorage.clear()
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
		window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, '{bad json')

		expect(getAuthSession()).toBeNull()
		expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
	})

	it('ignores stored sessions with missing required fields', () => {
		window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ token: 'token-1' }))

		expect(getAuthSession()).toBeNull()
	})

	it('removes stored non-object values', () => {
		window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, 'null')

		expect(getAuthSession()).toBeNull()
		expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
	})

	it('recognizes an expired JWT session', () => {
		const expiredSession = {
			...session,
			token: `header.${btoa(JSON.stringify({ exp: 1 }))}.signature`,
		}

		expect(isAuthSessionExpired(expiredSession, 2_000)).toBe(true)
		saveAuthSession(expiredSession)

		expect(getAuthSession(2_000)).toBeNull()
		expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
	})

	it('keeps a JWT session until its expiry timestamp', () => {
		const activeSession = {
			...session,
			token: `header.${btoa(JSON.stringify({ exp: 2 }))}.signature`,
		}
		saveAuthSession(activeSession)

		expect(isAuthSessionExpired(activeSession, 1_999)).toBe(false)
		expect(getAuthSession(1_999)).toEqual(activeSession)
	})

	it('accepts legacy tokens without an expiry claim', () => {
		saveAuthSession(session)

		expect(isAuthSessionExpired(session, Number.MAX_SAFE_INTEGER)).toBe(false)
		expect(getAuthSession(Number.MAX_SAFE_INTEGER)).toEqual(session)
	})
})