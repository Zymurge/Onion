export const DEFAULT_AUTH_RETURN_TO = '/game/create'

export function getSafeReturnTo(value: string | null | undefined, fallback = DEFAULT_AUTH_RETURN_TO): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || value.includes('://')) {
    return fallback
  }

  return value
}

export function getCurrentReturnTo(): string {
  if (typeof window === 'undefined') {
    return DEFAULT_AUTH_RETURN_TO
  }

  return getSafeReturnTo(`${window.location.pathname}${window.location.search}${window.location.hash}`)
}

export function buildLoginRedirect(returnTo = getCurrentReturnTo()): string {
  return `/user/login?returnTo=${encodeURIComponent(getSafeReturnTo(returnTo))}`
}
