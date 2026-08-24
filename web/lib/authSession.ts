export type AuthSession = {
  apiBaseUrl: string
  username: string
  userId: string
  token: string
}

const AUTH_SESSION_KEY = 'onion.auth.session'

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.sessionStorage
}

export function getAuthSession(): AuthSession | null {
  const store = storage()
  if (store === null) {
    return null
  }

  const raw = store.getItem(AUTH_SESSION_KEY)
  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return null
    }

    const value = parsed as Record<string, unknown>
    if (
      typeof value.apiBaseUrl !== 'string' ||
      typeof value.username !== 'string' ||
      typeof value.userId !== 'string' ||
      typeof value.token !== 'string' ||
      !value.apiBaseUrl ||
      !value.username ||
      !value.userId ||
      !value.token
    ) {
      return null
    }

    return {
      apiBaseUrl: value.apiBaseUrl,
      username: value.username,
      userId: value.userId,
      token: value.token,
    }
  } catch {
    return null
  }
}

export function saveAuthSession(session: AuthSession): void {
  storage()?.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
}

export function clearAuthSession(): void {
  storage()?.removeItem(AUTH_SESSION_KEY)
}
