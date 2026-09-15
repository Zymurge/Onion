// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthSession } from '#web/lib/authSession'
import type { ServerGameSnapshot } from '#web/lib/gameClient'
import { useScenarioInfo } from '#web/lib/useScenarioInfo'

const requestJson = vi.hoisted(() => vi.fn())

vi.mock('#shared/apiProtocol', () => ({
  requestJson,
}))

const authSession = {
  apiBaseUrl: 'http://localhost:3000',
  token: 'test-token',
} as AuthSession

const snapshot = {
  scenarioId: 'swamp-siege-01',
  scenarioName: "The Siege of Shrek's Swamp",
  victoryObjectives: [],
  escapeHexes: [],
} as unknown as ServerGameSnapshot

const options = {
  snapshot,
  authSession,
  catalog: null,
}

describe('useScenarioInfo', () => {
  beforeEach(() => {
    requestJson.mockReset()
  })

  it('loads scenario details only when opened and caches them across close and reopen', async () => {
    requestJson.mockResolvedValue({
      ok: true,
      status: 200,
      data: {
        id: 'swamp-siege-01',
        description: 'Destroy The Swamp and escape.',
        initialState: {
          deployments: {
            'onion-1': { type: 'TheOnion', side: 'onion' },
            'pigs-stack-1': { unitType: 'LittlePigs', side: 'defender', count: 3 },
          },
        },
      },
    })

    const { result } = renderHook(() => useScenarioInfo(options))

    expect(requestJson).not.toHaveBeenCalled()
    act(() => result.current.open())

    await waitFor(() => {
      expect(result.current.data.description).toBe('Destroy The Swamp and escape.')
    })

    expect(requestJson).toHaveBeenCalledTimes(1)
    expect(requestJson).toHaveBeenCalledWith({
      baseUrl: 'http://localhost:3000',
      path: 'scenarios/swamp-siege-01',
      method: 'GET',
      token: 'test-token',
    })
    expect(result.current.data.manifest.defender).toEqual(['3 x Little Pigs'])

    act(() => result.current.close())
    act(() => result.current.open())
    expect(requestJson).toHaveBeenCalledTimes(1)
  })

  it('exposes a request failure for the dialog', async () => {
    requestJson.mockResolvedValue({
      ok: false,
      status: 503,
      message: 'Scenario service unavailable.',
    })

    const { result } = renderHook(() => useScenarioInfo(options))
    act(() => result.current.open())

    await waitFor(() => {
      expect(result.current.activeError).toBe('Scenario service unavailable.')
    })

    expect(result.current.loading).toBe(false)
  })
})
