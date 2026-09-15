import { useCallback, useEffect, useState } from 'react'

import { requestJson } from '../../shared/apiProtocol'
import type { AuthSession } from './authSession'
import type { ServerGameSnapshot } from './gameClient'
import {
  buildScenarioInfoData,
  type ScenarioDetailResponse,
  type ScenarioInfoData,
} from './scenarioInfo'
import type { SessionCatalog } from './sessionCatalog'

type UseScenarioInfoOptions = {
  snapshot: ServerGameSnapshot | null
  authSession: AuthSession | null
  catalog: SessionCatalog | null
}

type ScenarioInfoError = {
  scenarioId: string
  message: string
}

export function useScenarioInfo({ snapshot, authSession, catalog }: UseScenarioInfoOptions) {
  const [isOpen, setIsOpen] = useState(false)
  const [detailState, setDetailState] = useState<{ scenarioId: string; detail: ScenarioDetailResponse } | null>(null)
  const [errorState, setErrorState] = useState<ScenarioInfoError | null>(null)
  const scenarioId = snapshot?.scenarioId ?? null
  const activeDetail = detailState?.scenarioId === scenarioId ? detailState.detail : null
  const activeError = errorState?.scenarioId === scenarioId ? errorState.message : null

  useEffect(() => {
    if (!isOpen || scenarioId === null || authSession === null || activeDetail !== null) {
      return
    }

    let cancelled = false
    void requestJson<ScenarioDetailResponse>({
      baseUrl: authSession.apiBaseUrl,
      path: `scenarios/${scenarioId}`,
      method: 'GET',
      token: authSession.token,
    }).then((result) => {
      if (cancelled) {
        return
      }
      if (!result.ok) {
        setErrorState({ scenarioId, message: result.message })
        return
      }
      setDetailState({ scenarioId, detail: result.data })
    }).catch(() => {
      if (!cancelled) {
        setErrorState({ scenarioId, message: 'Unable to load the scenario briefing.' })
      }
    })

    return () => {
      cancelled = true
    }
  }, [activeDetail, authSession, isOpen, scenarioId])

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const loading = isOpen && scenarioId !== null && authSession !== null && activeDetail === null && activeError === null

  return {
    activeError,
    close,
    data: buildScenarioInfoData(snapshot, activeDetail, catalog),
    isOpen,
    loading,
    open,
  } satisfies {
    activeError: string | null
    close: () => void
    data: ScenarioInfoData
    isOpen: boolean
    loading: boolean
    open: () => void
  }
}