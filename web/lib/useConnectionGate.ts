import { useState, type FormEvent } from 'react'
import { requestJson } from '../../shared/apiProtocol'
import type { WebRuntimeConfig } from './appBootstrap'
import { createHttpGameRequestTransport } from './httpGameClient'
import { createLiveEventSource } from './liveEventSource'
import logger from './logger'
import type { SessionBinding } from './sessionBinding'

type AuthResponse = {
  userId: string
  token: string
}

type ConnectDraft = {
  apiBaseUrl: string
  username: string
  password: string
  gameId: string
}

type UseConnectionGateOptions = {
  runtimeConfig?: WebRuntimeConfig
  onConnectedSession: (binding: SessionBinding) => void
}

export function useConnectionGate({ runtimeConfig, onConnectedSession }: UseConnectionGateOptions) {
  const [connectError, setConnectError] = useState<string | null>(null)
  const [connectDraft, setConnectDraft] = useState<ConnectDraft>({
    apiBaseUrl: runtimeConfig?.apiBaseUrl ?? 'http://localhost:3000',
    username: '',
    password: '',
    gameId: runtimeConfig?.gameId?.toString() ?? '',
  })

  async function submitConnectDraft(draft: ConnectDraft) {
    setConnectError(null)

    if (typeof window !== 'undefined') {
      logger.debug('[connection-gate] submit', {
        apiBaseUrl: draft.apiBaseUrl,
        username: draft.username,
        gameId: draft.gameId,
      })
    }

    if (!draft.apiBaseUrl.trim() || !draft.username.trim() || !draft.password.trim() || !draft.gameId.trim()) {
      setConnectError('API base URL, username, password, and game ID are required.')
      return
    }

    const parsedGameId = Number(draft.gameId.trim())
    if (!Number.isSafeInteger(parsedGameId) || parsedGameId <= 0) {
      setConnectError('Game ID must be a positive integer.')
      return
    }

    try {
      const loginResult = await requestJson<AuthResponse>({
        baseUrl: draft.apiBaseUrl.trim(),
        path: 'auth/login',
        method: 'POST',
        body: {
          username: draft.username.trim(),
          password: draft.password,
        },
      })

      if (!loginResult.ok) {
        setConnectError(loginResult.message)
        return
      }

      const baseUrl = draft.apiBaseUrl.trim()
      if (typeof window !== 'undefined') {
        logger.info('[connection-gate] connected session created', {
          gameId: parsedGameId,
          baseUrl,
          username: loginResult.data.userId,
        })
      }
      onConnectedSession({
        requestTransport: createHttpGameRequestTransport({
          baseUrl,
          token: loginResult.data.token,
        }),
        liveEventSource: createLiveEventSource({
          baseUrl,
          token: loginResult.data.token,
        }),
        gameId: parsedGameId,
      })
    } catch {
      setConnectError('Unable to connect to the backend.')
    }
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitConnectDraft(connectDraft)
  }

  return {
    connectDraft,
    connectError,
    handleConnect,
    setConnectDraft,
    setConnectError,
    submitConnectDraft,
  }
}
