import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'
import { useEffect, useState } from 'react'
import { ErrorOverlay } from './ErrorOverlay'
import { UserSideMenu } from './UserSideMenu'
import './UserDashboard.css'

type UserDashboardProps = {
  navigate?: (path: string) => void
}

type GameSummary = {
  gameId: number
  scenarioDisplayName: string
  phase: string
  turnNumber: number
  winner: string | null
  status?: 'waiting' | 'ready' | 'completed'
  ready?: boolean
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
  const status = game.status ?? (game.ready === true ? 'ready' : 'waiting')
  if (status === 'waiting') {
    return 'Waiting for opponent'
  }

  if (status === 'completed' || game.winner !== null) {
    return game.winner === userId ? 'You won' : 'You lost'
  }

  const yourTurn = game.role === 'onion'
    ? game.phase.startsWith('ONION_')
    : game.phase.startsWith('DEFENDER_') || game.phase === 'GEV_SECOND_MOVE'
  return yourTurn ? 'Your turn' : 'Opponent turn'
}

export function UserDashboard({ navigate }: UserDashboardProps) {
  const session = getAuthSession()
  const [games, setGames] = useState<GameSummary[]>([])
  const [loading, setLoading] = useState(session !== null)
  const [error, setError] = useState<string | null>(null)
  const apiBaseUrl = session?.apiBaseUrl
  const token = session?.token

  useEffect(() => {
    if (apiBaseUrl === undefined || token === undefined) {
      return
    }

    let cancelled = false
    void requestJson<{ games: GameSummary[] }>({
      baseUrl: apiBaseUrl,
      path: 'games',
      method: 'GET',
      token,
    }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
        return
      }
      setGames(result.data.games)
    }).catch(() => {
      if (!cancelled) setError('Unable to load your games.')
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, token])

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
                <span className="dashboard-count">{games.length} active</span>
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
                    {(game.status ?? (game.ready === true ? 'ready' : 'waiting')) !== 'waiting' ? (
                      <a className="dashboard-game-link" href={`/game/${game.gameId}`}>Open Game</a>
                    ) : (
                      <span className="dashboard-game-link dashboard-game-link-disabled">Waiting</span>
                    )}
                  </article>
                ))}
              </div>
          </section>
        </main>
      </div>
    </div>
  )
}