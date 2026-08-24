import { useEffect, useState, type FormEvent } from 'react'
import { ConnectField } from './ConnectField'
import { ErrorOverlay } from './ErrorOverlay'
import type { WebRuntimeConfig } from '../lib/appBootstrap'
import { getSafeReturnTo, DEFAULT_AUTH_RETURN_TO } from '../lib/authRouting'
import { getAuthSession, saveAuthSession, type AuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'

type LoginScreenProps = {
  runtimeConfig?: WebRuntimeConfig
  navigate?: (path: string) => void
}

type AuthResponse = {
  userId: string
  token: string
}

function redirectTo(path: string): void {
  window.location.replace(path)
}

function getReturnTo(runtimeConfig?: WebRuntimeConfig): string {
  if (typeof window === 'undefined') {
    return DEFAULT_AUTH_RETURN_TO
  }

  const requestedReturnTo = new URLSearchParams(window.location.search).get('returnTo')
  if (requestedReturnTo !== null) {
    return getSafeReturnTo(requestedReturnTo)
  }

  return runtimeConfig?.gameId === null || runtimeConfig?.gameId === undefined
    ? DEFAULT_AUTH_RETURN_TO
    : `/game/${runtimeConfig.gameId}`
}

export function LoginScreen({ runtimeConfig, navigate }: LoginScreenProps) {
  const apiBaseUrl = runtimeConfig?.apiBaseUrl ?? 'http://localhost:3000'
  const [returnTo] = useState(() => getReturnTo(runtimeConfig))
  const [existingSession] = useState<AuthSession | null>(() => getAuthSession())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const redirect = navigate ?? redirectTo

  useEffect(() => {
    if (existingSession === null) {
      return
    }

    redirect(returnTo)
  }, [existingSession, redirect, returnTo])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Username and password are required.')
      return
    }

    setWorking(true)
    try {
      const result = await requestJson<AuthResponse>({
        baseUrl: apiBaseUrl,
        path: 'auth/login',
        method: 'POST',
        body: { username: username.trim(), password },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }

      saveAuthSession({
        apiBaseUrl,
        username: username.trim(),
        userId: result.data.userId,
        token: result.data.token,
      })
      redirect(returnTo)
    } catch {
      setError('Unable to connect to the backend.')
    } finally {
      setWorking(false)
    }
  }

  if (existingSession !== null) {
    return (
      <div className="shell connect-shell" data-testid="auth-redirecting">
        <section className="panel connect-panel">
          <p className="eyebrow">Already signed in</p>
          <h1>Returning to your match</h1>
        </section>
      </div>
    )
  }

  return (
    <div className="shell connect-shell">
      {error ? <ErrorOverlay message={error} className="error-overlay-connect" onDismiss={() => setError(null)} /> : null}
      <section className="panel connect-panel">
        <div className="card-head">
          <div>
            <p className="eyebrow">Welcome back</p>
            <h1>Sign in to continue</h1>
          </div>
        </div>
        <form className="connect-form" noValidate onSubmit={handleLogin}>
          <ConnectField label="Username" value={username} placeholder="swamp walker" onChange={setUsername} />
          <ConnectField label="Password" value={password} placeholder="••••••••" type="password" onChange={setPassword} />
          <button type="submit" className="primary-action" disabled={working}>
            {working ? 'Signing in...' : 'Sign In'}
          </button>
          <a className="gate-secondary-action" href={`/user/create?returnTo=${encodeURIComponent(returnTo)}`}>Create an account</a>
        </form>
      </section>
    </div>
  )
}
