import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { UserSideMenu } from './UserSideMenu'
import './UserDashboard.css'
import './AccountScreen.css'

type AccountScreenProps = {
  navigate?: (path: string) => void
}

export function AccountScreen({ navigate }: AccountScreenProps) {
  const session = getAuthSession()

  function handleSignOut() {
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.assign(path)))('/user/login')
  }

  return (
    <div className="shell account-shell">
      <div className="user-page-layout account-page-layout">
        <UserSideMenu activeItem="account" onSignOut={handleSignOut} />
        <main className="account-main">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">Player account</p>
              <h1>Account</h1>
              <p className="dashboard-intro">Account management tools will be available here soon.</p>
            </div>
          </header>

          <section className="panel account-placeholder-panel">
            <p className="eyebrow">Profile settings</p>
            <h2>{session?.username ?? 'Current player'}</h2>
            <p>There are no account settings to manage yet.</p>
          </section>
        </main>
      </div>
    </div>
  )
}
