// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
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
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({
        games: [{
          gameId: 12,
          scenarioId: 'swamp-siege-01',
          scenarioDisplayName: 'The Siege of Shrek\'s Swamp',
          creatorRole: 'onion',
          openRole: 'defender',
        }],
      }))
      .mockResolvedValueOnce(response({ gameId: 12, role: 'defender' }))

    render(<GamesScreen navigate={navigate} />)

    await user.click(await screen.findByRole('button', { name: 'Join Game' }))

    expect(fetchMock).toHaveBeenNthCalledWith(2, 'http://localhost:3000/games/12/join', expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer token-1' },
      body: '{}',
    }))
    expect(navigate).toHaveBeenCalledWith('/game/12')
  })
})
