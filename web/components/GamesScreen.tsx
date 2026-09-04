import { useState } from 'react'
import { ErrorOverlay } from './ErrorOverlay'
import { UserSideMenu } from './UserSideMenu'
import { useLobbyPolling } from '../lib/useLobbyPolling'
import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'
import './UserDashboard.css'
import './GamesScreen.css'

type OpenGameSummary = {
  gameId: number
  scenarioId: string
  scenarioDisplayName: string
  creatorRole: 'onion' | 'defender'
  openRole: 'onion' | 'defender'
}

type GamesScreenProps = {
  navigate?: (path: string) => void
}

function roleLabel(role: OpenGameSummary['openRole']): string {
  return role === 'onion' ? 'The Onion' : 'Defenders'
}

export function GamesScreen({ navigate }: GamesScreenProps) {
  const session = getAuthSession()
  const [joiningGameId, setJoiningGameId] = useState<number | null>(null)
  const apiBaseUrl = session?.apiBaseUrl
  const token = session?.token
  const { games, loading, error, refresh, setError } = useLobbyPolling<OpenGameSummary>({
    apiBaseUrl,
    token,
    path: 'games/open',
    errorMessage: 'Unable to load open games.',
  })

  async function handleJoin(gameId: number) {
    if (!session || joiningGameId !== null) return

    setError(null)
    setJoiningGameId(gameId)
    try {
      const result = await requestJson<{ gameId: number; role: 'onion' | 'defender' }>({
        baseUrl: session.apiBaseUrl,
        path: `games/${gameId}/join`,
        method: 'POST',
        token: session.token,
        body: {},
      })
      if (!result.ok) {
        setError(result.message)
        void refresh()
        return
      }

      void refresh()
      ;(navigate ?? ((path: string) => window.location.assign(path)))(`/game/${result.data.gameId}`)
    } catch {
      setError('Unable to join the game.')
    } finally {
      setJoiningGameId(null)
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
        <UserSideMenu activeItem="games" onSignOut={handleSignOut} />
        <main className="dashboard-main">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Open matches</p>
              <h1>Find a game</h1>
              <p className="dashboard-intro">Join a player waiting for an opponent and take the open side.</p>
            </div>
          </header>

          <section className="panel dashboard-games-panel games-browser-panel">
            <div className="card-head">
              <div>
                <p className="eyebrow">Lobby board</p>
                <h2>Available Games</h2>
              </div>
              <span className="dashboard-count">{games.length} open</span>
            </div>
            <div className="dashboard-game-list">
              {loading ? <p className="dashboard-empty-state">Looking for open games...</p> : null}
              {!loading && games.length === 0 ? <p className="dashboard-empty-state">No open games are waiting right now.</p> : null}
              {!loading && games.map((game) => (
                <article className="dashboard-game-row" key={game.gameId}>
                  <div>
                    <p className="dashboard-game-kicker">Game {game.gameId} · Open {roleLabel(game.openRole)}</p>
                    <h3>{game.scenarioDisplayName}</h3>
                    <p>Created as {roleLabel(game.creatorRole)} · You would play {roleLabel(game.openRole)}</p>
                  </div>
                  <button
                    type="button"
                    className="dashboard-game-link games-join-button"
                    onClick={() => void handleJoin(game.gameId)}
                    disabled={joiningGameId !== null}
                  >
                    {joiningGameId === game.gameId ? 'Joining...' : 'Join Game'}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
