import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'
import { useState } from 'react'
import { ErrorOverlay } from './ErrorOverlay'
import { ConfirmationSurface } from './ConfirmationSurface'
import { UserSideMenu } from './UserSideMenu'
import { useLobbyPolling } from '../lib/useLobbyPolling'
import { openGameWindow, prepareGameWindow } from '../lib/gameNavigation'
import './UserDashboard.css'
import './GameHistoryScreen.css'

type UserDashboardProps = {
  navigate?: (path: string) => void
}

type GameSummary = {
  gameId: number
  scenarioDisplayName: string
  phase: string
  turnNumber: number
  winner: string | null
  status: 'waiting' | 'ready' | 'active' | 'completed'
  hostUserId: string
  canDelete: boolean
  role: 'onion' | 'defender'
}

function formatPhase(phase: string): string {
  return phase
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getGameStatus(game: GameSummary, userId: string | undefined): string {
  if (game.status === 'waiting') {
    return 'Waiting for opponent'
  }

  if (game.status === 'ready') {
    return 'Ready to start'
  }

  if (game.status === 'completed' || game.winner !== null) {
    return game.winner === userId ? 'You won' : 'You lost'
  }

  const yourTurn = game.role === 'onion'
    ? game.phase.startsWith('ONION_')
    : game.phase.startsWith('DEFENDER_') || game.phase === 'GEV_SECOND_MOVE'
  return yourTurn ? 'Your turn' : 'Opponent turn'
}

export function UserDashboard({ navigate }: UserDashboardProps) {
  const session = getAuthSession()
  const [startingGameId, setStartingGameId] = useState<number | null>(null)
  const [deletingGameId, setDeletingGameId] = useState<number | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<GameSummary | null>(null)
  const apiBaseUrl = session?.apiBaseUrl
  const token = session?.token
  const { games, loading, error, refresh, setError } = useLobbyPolling<GameSummary>({
    apiBaseUrl,
    token,
    path: 'games',
    errorMessage: 'Unable to load your games.',
  })

  async function handleStart(gameId: number) {
    if (!session || startingGameId !== null) {
      return
    }

    setError(null)
    const gameWindow = prepareGameWindow({ navigate })
    if (!gameWindow) {
      setError('Unable to open the game window. Allow popups for this site and try again.')
      return
    }

    setStartingGameId(gameId)
    try {
      const result = await requestJson<{ gameId: number; status: 'active' }>({
        baseUrl: session.apiBaseUrl,
        path: `games/${gameId}/start`,
        method: 'POST',
        token: session.token,
        body: {},
      })
      if (!result.ok) {
        gameWindow.cancel()
        setError(result.message)
        void refresh()
        return
      }

      void refresh()
      gameWindow.complete(`/game/${result.data.gameId}`)
    } catch {
      gameWindow.cancel()
      setError('Unable to start the game.')
    } finally {
      setStartingGameId(null)
    }
  }

  async function handleDelete(game: GameSummary) {
    if (!session) return

    setDeletingGameId(game.gameId)
    setError(null)
    try {
      const result = await requestJson<{ gameId: number; deleted: boolean }>({
        baseUrl: session.apiBaseUrl,
        path: `games/${game.gameId}`,
        method: 'DELETE',
        token: session.token,
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setDeleteConfirmation(null)
      await refresh()
    } catch {
      setError('Unable to delete the game.')
    } finally {
      setDeletingGameId(null)
    }
  }

  function handleSignOut() {
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.assign(path)))('/user/login')
  }

  return (
    <div className="shell dashboard-shell">
      {error ? <ErrorOverlay message={error} className="error-overlay-connect" onDismiss={() => setError(null)} /> : null}
      <div className="user-page-layout dashboard-layout">
        <UserSideMenu onSignOut={handleSignOut} />
        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Operations desk</p>
              <h1>Welcome back{session ? `, ${session.username}` : ''}</h1>
              <p className="dashboard-intro">Your matches, lobbies, and next move in one place.</p>
            </div>
          </header>

          <section className="panel dashboard-games-panel">
              <div className="card-head">
                <div>
                  <p className="eyebrow">Match log</p>
                  <h2>Your Games</h2>
                </div>
                <span className="dashboard-count">{games.length} games</span>
              </div>
              <div className="dashboard-game-list">
                {loading ? <p className="dashboard-empty-state">Loading your games...</p> : null}
                {!loading && games.length === 0 ? <p className="dashboard-empty-state">You have no games yet.</p> : null}
                {!loading && games.map((game) => (
                  <article className="dashboard-game-row" key={game.gameId}>
                    <div>
                      <p className="dashboard-game-kicker">Game {game.gameId} · {getGameStatus(game, session?.userId)}</p>
                      <h3>{game.scenarioDisplayName}</h3>
                      <p>Turn {game.turnNumber} · {formatPhase(game.phase)} · {game.role === 'onion' ? 'The Onion' : 'Defenders'}</p>
                    </div>
                    <div className="dashboard-game-actions">
                      {game.status === 'active' || game.status === 'completed' ? (
                        <a
                          className="dashboard-game-link"
                          href={`/game/${game.gameId}`}
                          onClick={(event) => {
                            event.preventDefault()
                            openGameWindow(`/game/${game.gameId}`, { navigate })
                          }}
                        >
                          Open Game
                        </a>
                      ) : game.status === 'ready' ? (
                        game.hostUserId === session?.userId ? (
                          <button
                            type="button"
                            className="dashboard-game-link games-start-button"
                            onClick={() => void handleStart(game.gameId)}
                            disabled={startingGameId !== null}
                          >
                            {startingGameId === game.gameId ? 'Starting...' : 'Start Game'}
                          </button>
                        ) : (
                          <a
                            className="dashboard-game-link"
                            href={`/game/${game.gameId}`}
                            onClick={(event) => {
                              event.preventDefault()
                              openGameWindow(`/game/${game.gameId}`, { navigate })
                            }}
                          >
                            Open Game
                          </a>
                        )
                      ) : (
                        <span className="dashboard-game-link dashboard-game-link-disabled">Waiting</span>
                      )}
                      {game.canDelete ? (
                        <button type="button" className="dashboard-game-link dashboard-delete-button" onClick={() => setDeleteConfirmation(game)}>Delete game</button>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
          </section>
        </main>
      </div>
      {deleteConfirmation ? (
        <div className="history-confirmation-backdrop" role="presentation">
          <ConfirmationSurface
            dataTestId="dashboard-delete-confirmation"
            eyebrow="Confirm maintenance"
            title={`Delete game ${deleteConfirmation.gameId}`}
            badge={deleteConfirmation.status}
            summary={<p>The snapshot and event history will be removed permanently.</p>}
            actions={(
              <>
                <button type="button" className="history-cancel-button" onClick={() => setDeleteConfirmation(null)}>Cancel</button>
                <button type="button" className="history-confirm-delete" onClick={() => void handleDelete(deleteConfirmation)} disabled={deletingGameId !== null}>
                  {deletingGameId === deleteConfirmation.gameId ? 'Deleting...' : 'Confirm delete'}
                </button>
              </>
            )}
          >
            <p>{deleteConfirmation.scenarioDisplayName} · Current status: {deleteConfirmation.status}</p>
          </ConfirmationSurface>
        </div>
      ) : null}
    </div>
  )
}