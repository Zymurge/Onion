import { ErrorOverlay } from './ErrorOverlay'
import { ConnectField } from './ConnectField'
import type { WebRuntimeConfig } from '../lib/appBootstrap'
import { useRegistrationGate } from '../lib/useRegistrationGate'
import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { getSafeReturnTo } from '../lib/authRouting'

type RegisterGateProps = {
  runtimeConfig?: WebRuntimeConfig
  navigate?: (path: string) => void
}

export function RegisterGate({ navigate, runtimeConfig }: RegisterGateProps) {
  const {
    registrationDraft,
    registrationError,
    registeredUsername,
    handleRegistration,
    setRegistrationDraft,
    setRegistrationError,
  } = useRegistrationGate({ runtimeConfig })
  const session = getAuthSession()
  const requestedReturnTo = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('returnTo')
  const loginPath = requestedReturnTo === null
    ? '/user/login'
    : `/user/login?returnTo=${encodeURIComponent(getSafeReturnTo(requestedReturnTo))}`

  function handleSignOut() {
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.assign(path)))('/user/login')
  }

  return (
    <div className="shell connect-shell">
      {registrationError ? (
        <ErrorOverlay
          message={registrationError}
          className="error-overlay-connect"
          onDismiss={() => setRegistrationError(null)}
        />
      ) : null}
      <section className="panel connect-panel">
        {registeredUsername ? (
          <div className="account-created-state">
            <p className="eyebrow">Account ready</p>
            <h1>Welcome, {registeredUsername}</h1>
            <p>Your player account has been created.</p>
            <a className="primary-action" href={loginPath}>Continue to Sign In</a>
          </div>
        ) : (
          <>
              {session ? (
                <div className="register-session-info">
                  <div>
                    <p className="eyebrow">Current session</p>
                    <h2>Signed in as {session.username}</h2>
                    <p>Player ID: {session.userId}</p>
                  </div>
                  <button type="button" className="gate-secondary-action" onClick={handleSignOut}>Sign Out</button>
                </div>
              ) : null}
            <div className="card-head">
              <div>
                <p className="eyebrow">New player</p>
                <h1>Create your player account</h1>
              </div>
            </div>
            <form className="connect-form" noValidate onSubmit={handleRegistration}>
              <ConnectField
                label="Username"
                value={registrationDraft.username}
                placeholder="swamp walker"
                onChange={(value) => setRegistrationDraft((draft) => ({ ...draft, username: value }))}
              />
              <ConnectField
                label="Email"
                value={registrationDraft.email}
                placeholder="player@example.com"
                type="email"
                onChange={(value) => setRegistrationDraft((draft) => ({ ...draft, email: value }))}
              />
              <ConnectField
                label="Password"
                value={registrationDraft.password}
                placeholder="••••••••"
                type="password"
                onChange={(value) => setRegistrationDraft((draft) => ({ ...draft, password: value }))}
              />
              <button type="submit" className="primary-action">Create Account</button>
              <a className="gate-secondary-action" href="/user/login">Sign In Instead</a>
            </form>
          </>
        )}
      </section>
    </div>
  )
}