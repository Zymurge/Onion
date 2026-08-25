import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { UserSideMenu } from './UserSideMenu'
import './UserDashboard.css'

type UserDashboardProps = {
  navigate?: (path: string) => void
}

const placeholderGames = [
  {
    id: 42,
    name: 'Swamp Siege',
    scenario: 'Swamp Siege',
    status: 'Waiting for opponent',
    role: 'The Onion',
    opponent: 'Open lobby',
  },
  {
    id: 37,
    name: 'The Long Retreat',
    scenario: 'Smoke on the Causeway',
    status: 'Your turn',
    role: 'Defenders',
    opponent: 'Marmalade-7',
  },
]

export function UserDashboard({ navigate }: UserDashboardProps) {
  const session = getAuthSession()

  function handleSignOut() {
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.assign(path)))('/user/login')
  }

  return (
    <div className="shell dashboard-shell">
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
                <span className="dashboard-count">{placeholderGames.length} active</span>
              </div>
              <div className="dashboard-game-list">
                {placeholderGames.map((game) => (
                  <article className="dashboard-game-row" key={game.id}>
                    <div>
                      <p className="dashboard-game-kicker">Game {game.id} · {game.status}</p>
                      <h3>{game.name}</h3>
                      <p>{game.scenario} · {game.role} · {game.opponent}</p>
                    </div>
                    <a className="dashboard-game-link" href={`/game/${game.id}`}>Open Game</a>
                  </article>
                ))}
              </div>
          </section>
        </main>
      </div>
    </div>
  )
}