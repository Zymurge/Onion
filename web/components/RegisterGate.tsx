import { ErrorOverlay } from './ErrorOverlay'
import { ConnectField } from './ConnectField'
import type { WebRuntimeConfig } from '../lib/appBootstrap'
import { useRegistrationGate } from '../lib/useRegistrationGate'

type RegisterGateProps = {
  runtimeConfig?: WebRuntimeConfig
}

export function RegisterGate({ runtimeConfig }: RegisterGateProps) {
  const {
    registrationDraft,
    registrationError,
    registeredUsername,
    handleRegistration,
    setRegistrationDraft,
    setRegistrationError,
  } = useRegistrationGate({ runtimeConfig })

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
            <a className="primary-action" href="/user/login">Continue to Sign In</a>
          </div>
        ) : (
          <>
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