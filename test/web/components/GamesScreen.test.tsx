// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { GamesScreen } from '#web/components/GamesScreen'
import { saveAuthSession } from '#web/lib/authSession'

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 500 ? 'Internal Server Error' : 'OK',
    text: async () => JSON.stringify(body),
  } as Response
}

describe('GamesScreen', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.clear()
    vi.restoreAllMocks()
  })

  it('loads open games and shows an empty state when none are available', async () => {
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ games: [] }))

    render(<GamesScreen />)

    await screen.findByText('No open games are waiting right now.')
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games/open', expect.objectContaining({
      headers: { 'content-type': 'application/json', authorization: 'Bearer token-1' },
    }))
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/user/dashboard')
  })

  it('joins an open game and navigates to the match', async () => {
    const user = userEvent.setup()
    const navigate = vi.fn()
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/config')) {
        return response({ lobbyPollIntervalMs: 3000 })
      }
      if (url.endsWith('/games/12/join')) {
        return response({ gameId: 12, role: 'defender' })
      }
      return response({
        games: [{
          gameId: 12,
          scenarioId: 'swamp-siege-01',
          scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
          creatorRole: 'onion',
          openRole: 'defender',
        }],
      })
    })

    render(<GamesScreen navigate={navigate} />)

    await user.click(await screen.findByRole('button', { name: 'Join Game' }))

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games/12/join', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token-1' },
      body: '{}',
    }))
    expect(navigate).toHaveBeenCalledWith('/game/12')
  })

  it('opens a joined game in a dedicated window', async () => {
    const user = userEvent.setup()
    const gameWindow = { focus: vi.fn() } as unknown as Window
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(gameWindow)
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/config')) {
        return response({ lobbyPollIntervalMs: 3000 })
      }
      if (url.endsWith('/games/12/join')) {
        return response({ gameId: 12, role: 'defender' })
      }
      return response({
        games: [{
          gameId: 12,
          scenarioId: 'swamp-siege-01',
          scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
          creatorRole: 'onion',
          openRole: 'defender',
        }],
      })
    })

    render(<GamesScreen />)
    await user.click(await screen.findByRole('button', { name: 'Join Game' }))

    expect(windowOpen).toHaveBeenCalledWith('/game/12', '_blank', 'noopener,noreferrer')
    expect(gameWindow.focus).toHaveBeenCalledTimes(1)
  })

  it('refreshes the open game list using the configured interval', async () => {
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })
    let listRequestCount = 0
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/config')) {
        return response({ lobbyPollIntervalMs: 10 })
      }
      listRequestCount += 1
      return listRequestCount === 1
        ? response({
            games: [{
              gameId: 12,
              scenarioId: 'swamp-siege-01',
              scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
              creatorRole: 'onion',
              openRole: 'defender',
            }],
          })
        : response({ games: [] })
    })

    render(<GamesScreen />)
    await screen.findByText('Game 12 · Open Defenders')

    await waitFor(() => expect(listRequestCount).toBeGreaterThan(1), { timeout: 1000 })
    await screen.findByText('No open games are waiting right now.')
  })

  it('refreshes open games after a join conflict', async () => {
    const user = userEvent.setup()
    saveAuthSession({
      apiBaseUrl: 'http://localhost:3000',
      username: 'player-1',
      userId: 'user-1',
      token: 'token-1',
    })
    let listRequestCount = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url.endsWith('/config')) {
        return response({ lobbyPollIntervalMs: 3000 })
      }
      if (url.endsWith('/games/12/join')) {
        return response({ ok: false, error: 'Game is full', code: 'GAME_FULL' }, 409)
      }
      listRequestCount += 1
      return listRequestCount === 1
        ? response({
            games: [{
              gameId: 12,
              scenarioId: 'swamp-siege-01',
              scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
              creatorRole: 'onion',
              openRole: 'defender',
            }],
          })
        : response({ games: [] })
    })

    render(<GamesScreen />)
    await user.click(await screen.findByRole('button', { name: 'Join Game' }))

    await waitFor(() => expect(listRequestCount).toBeGreaterThan(1))
    expect(screen.queryByRole('button', { name: 'Join Game' })).toBeNull()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:3000/games/12/join', expect.objectContaining({
      method: 'POST',
    }))
  })
})
