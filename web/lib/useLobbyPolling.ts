import { useCallback, useEffect, useRef, useState } from 'react'
import { requestJson } from '../../shared/apiProtocol'

const DEFAULT_LOBBY_POLL_INTERVAL_MS = 3000

type RuntimeConfigResponse = {
  lobbyPollIntervalMs: number
}

type LobbyListResponse<T> = {
  games: T[]
}

type UseLobbyPollingOptions = {
  apiBaseUrl?: string
  token?: string
  path: string
  errorMessage: string
}

export function useLobbyPolling<T>({ apiBaseUrl, token, path, errorMessage }: UseLobbyPollingOptions) {
  const [games, setGames] = useState<T[]>([])
  const [loading, setLoading] = useState(apiBaseUrl !== undefined && token !== undefined)
  const [error, setError] = useState<string | null>(null)
  const [pollIntervalMs, setPollIntervalMs] = useState(DEFAULT_LOBBY_POLL_INTERVAL_MS)
  const [isVisible, setIsVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden')
  const requestInFlightRef = useRef(false)
  const refreshQueuedRef = useRef(false)
  const refreshRef = useRef<() => Promise<void>>(() => Promise.resolve())
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    if (apiBaseUrl === undefined || token === undefined) {
      return
    }
    if (requestInFlightRef.current) {
      refreshQueuedRef.current = true
      return
    }

    requestInFlightRef.current = true
    try {
      const result = await requestJson<LobbyListResponse<T>>({
        baseUrl: apiBaseUrl,
        path,
        method: 'GET',
        token,
      })
      if (!mountedRef.current) {
        return
      }
      if (!result.ok) {
        setError(result.message)
        return
      }
      setGames(result.data.games)
      setError(null)
    } catch {
      if (mountedRef.current) {
        setError(errorMessage)
      }
    } finally {
      requestInFlightRef.current = false
      if (mountedRef.current) {
        setLoading(false)
      }
      if (mountedRef.current && refreshQueuedRef.current) {
        refreshQueuedRef.current = false
        queueMicrotask(() => {
          if (mountedRef.current) {
            void refreshRef.current()
          }
        })
      }
    }
  }, [apiBaseUrl, errorMessage, path, token])

  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (apiBaseUrl === undefined || token === undefined) {
      return
    }

    void requestJson<RuntimeConfigResponse>({
      baseUrl: apiBaseUrl,
      path: 'config',
      method: 'GET',
      token,
    }).then((result) => {
      if (!mountedRef.current || !result.ok) {
        return
      }

      const configuredInterval = result.data.lobbyPollIntervalMs
      if (Number.isSafeInteger(configuredInterval) && configuredInterval > 0) {
        setPollIntervalMs(configuredInterval)
      }
    }).catch(() => {
      // The default keeps lobby polling available if runtime config is unavailable.
    })
  }, [apiBaseUrl, token])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    if (apiBaseUrl === undefined || token === undefined || !isVisible) {
      return
    }

    const interval = window.setInterval(() => {
      void refresh()
    }, pollIntervalMs)

    return () => window.clearInterval(interval)
  }, [apiBaseUrl, isVisible, pollIntervalMs, refresh, token])

  useEffect(() => {
    function handleFocus() {
      void refresh()
    }

    function handleVisibilityChange() {
      const visible = document.visibilityState !== 'hidden'
      setIsVisible(visible)
      if (visible) {
        void refresh()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refresh])

  return {
    games,
    loading,
    error,
    refresh,
    setError,
  }
}
