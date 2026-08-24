export type AuthSession = {
  apiBaseUrl: string
  username: string
  userId: string
  token: string
}

export const AUTH_SESSION_STORAGE_KEY = 'onion.auth.session'

function storage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function decodeTokenExpiry(token: string): number | null {
  const encodedPayload = token.split('.')[1]
  if (!encodedPayload) {
    return null
  }

  try {
    const base64Payload = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const paddedPayload = base64Payload.padEnd(Math.ceil(base64Payload.length / 4) * 4, '=')
    const payload = JSON.parse(atob(paddedPayload)) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null
  } catch {
    return null
  }
}

export function getAuthSessionExpiresAt(session: AuthSession): number | null {
  const expirySeconds = decodeTokenExpiry(session.token)
  return expirySeconds === null ? null : expirySeconds * 1000
}

export function isAuthSessionExpired(session: AuthSession, nowMs = Date.now()): boolean {
  const expiresAt = getAuthSessionExpiresAt(session)
  return expiresAt !== null && expiresAt <= nowMs
}

export function getAuthSession(nowMs = Date.now()): AuthSession | null {
  const store = storage()
  if (store === null) {
    return null
  }

  let raw: string | null
  try {
    raw = store.getItem(AUTH_SESSION_STORAGE_KEY)
  } catch {
    return null
  }

  if (raw === null) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      clearAuthSession()
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
      clearAuthSession()
      return null
    }

    const session: AuthSession = {
      apiBaseUrl: value.apiBaseUrl,
      username: value.username,
      userId: value.userId,
      token: value.token,
    }

    if (isAuthSessionExpired(session, nowMs)) {
      clearAuthSession()
      return null
    }

    return session
  } catch {
    clearAuthSession()
    return null
  }
}

export function saveAuthSession(session: AuthSession): void {
  const store = storage()
  if (store === null) {
    return
  }

  try {
    store.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session))
  } catch {
    return
  }
}

export function clearAuthSession(): void {
  const store = storage()
  if (store === null) {
    return
  }

  try {
    store.removeItem(AUTH_SESSION_STORAGE_KEY)
  } catch {
    return
  }
}
