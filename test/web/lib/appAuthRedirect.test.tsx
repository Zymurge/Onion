// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { GameClientSeamError } from '#web/lib/gameClient'
import { AUTH_SESSION_STORAGE_KEY, clearAuthSession, saveAuthSession, type AuthSession } from '#web/lib/authSession'
import { useAuthExpiryRedirect } from '#web/lib/appAuthRedirect'

const session: AuthSession = {
	apiBaseUrl: 'http://localhost:3000',
	username: 'player-1',
	userId: 'user-1',
	token: 'header.eyJleHAiOjIwMDB9.signature',
}

function sessionWithExpiry(expirySeconds: number): AuthSession {
	return {
		...session,
		token: `header.${btoa(JSON.stringify({ exp: expirySeconds }))}.signature`,
	}
}

function renderRedirectHook(options: {
	authSession: AuthSession | null
	error: GameClientSeamError | null
	navigate?: (path: string) => void
}) {
	return renderHook(() => useAuthExpiryRedirect(options))
}

beforeEach(() => {
	vi.useFakeTimers()
	vi.setSystemTime(new Date(1_000_000))
	clearAuthSession()
})

afterEach(() => {
	vi.useRealTimers()
	clearAuthSession()
})

describe('useAuthExpiryRedirect', () => {
	it('does nothing without an auth session or auth failure', () => {
		const navigate = vi.fn()

		renderRedirectHook({ authSession: null, error: null, navigate })

		expect(navigate).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('redirects immediately and clears storage for an expired session', () => {
		const navigate = vi.fn()
		const expiredSession = sessionWithExpiry(999)
		saveAuthSession(expiredSession)

		renderRedirectHook({ authSession: expiredSession, error: null, navigate })

		expect(navigate).toHaveBeenCalledWith('/user/login?returnTo=%2F')
		expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
	})

	it('schedules a redirect at the JWT expiry and cleans up on unmount', () => {
		const navigate = vi.fn()
		const view = renderRedirectHook({ authSession: sessionWithExpiry(1002), error: null, navigate })

		expect(navigate).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(1)

		view.unmount()
		act(() => {
			vi.advanceTimersByTime(2_001)
		})
		expect(navigate).not.toHaveBeenCalled()
	})

	it('redirects when the scheduled expiry timer fires', () => {
		const navigate = vi.fn()

		renderRedirectHook({ authSession: sessionWithExpiry(1002), error: null, navigate })

		act(() => {
			vi.advanceTimersByTime(2_000)
		})

		expect(navigate).toHaveBeenCalledWith('/user/login?returnTo=%2F')
		expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
	})

	it('redirects immediately for a 401 session error', () => {
		const navigate = vi.fn()
		saveAuthSession(session)
		const error = new GameClientSeamError('transport', 'Unauthorized', undefined, 401)

		renderRedirectHook({ authSession: session, error, navigate })

		expect(navigate).toHaveBeenCalledWith('/user/login?returnTo=%2F')
		expect(window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull()
	})

	it('does not redirect for non-auth transport errors', () => {
		const navigate = vi.fn()
		const error = new GameClientSeamError('transport', 'Temporary failure', undefined, 503)

		renderRedirectHook({ authSession: session, error, navigate })

		expect(navigate).not.toHaveBeenCalled()
	})

	it('redirects only once when expiry and a 401 overlap', () => {
		const navigate = vi.fn()
		const error = new GameClientSeamError('transport', 'Unauthorized', undefined, 401)
		const initialProps: { error: GameClientSeamError | null } = { error }
		const view = renderHook(
			(props: typeof initialProps) => useAuthExpiryRedirect({ authSession: sessionWithExpiry(1001), error: props.error, navigate }),
			{ initialProps },
		)

		view.rerender({ error: null })
		act(() => {
			vi.advanceTimersByTime(1)
		})

		expect(navigate).toHaveBeenCalledTimes(1)
	})
})