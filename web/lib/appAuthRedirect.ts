import { useCallback, useEffect, useRef } from 'react'

import type { GameClientSeamError } from './gameClient'
import { clearAuthSession, getAuthSessionExpiresAt, type AuthSession } from './authSession'
import { buildLoginRedirect } from './authRouting'

/** Inputs for the app-wide redirect guard used around session requests. */
export type UseAuthExpiryRedirectOptions = {
	authSession: AuthSession | null
	error: GameClientSeamError | null
	navigate?: (path: string) => void
}

/**
 * Redirects an expired or unauthorized session to login once per mount.
 *
 * The hook clears the local auth session before navigating and accepts an
 * injected navigator so the redirect behavior remains testable.
 */
export function useAuthExpiryRedirect({ authSession, error, navigate }: UseAuthExpiryRedirectOptions): void {
	const authRedirectedRef = useRef(false)

	const redirectToLogin = useCallback(() => {
		if (authRedirectedRef.current || typeof window === 'undefined') {
			return
		}

		authRedirectedRef.current = true
		clearAuthSession()
		;(navigate ?? ((path: string) => window.location.replace(path)))(buildLoginRedirect())
	}, [navigate])

	useEffect(() => {
		if (authSession === null) {
			return
		}

		const expiresAt = getAuthSessionExpiresAt(authSession)
		if (expiresAt === null) {
			return
		}

		const delayMs = expiresAt - Date.now()
		if (delayMs <= 0) {
			redirectToLogin()
			return
		}

		const timeout = window.setTimeout(() => {
			redirectToLogin()
		}, delayMs)

		return () => window.clearTimeout(timeout)
	}, [authSession, redirectToLogin])

	useEffect(() => {
		if (error?.status === 401) {
			redirectToLogin()
		}
	}, [error, redirectToLogin])
}