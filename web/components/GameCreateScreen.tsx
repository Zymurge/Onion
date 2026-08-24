import { useEffect, useState, type FormEvent } from 'react'
import { ErrorOverlay } from './ErrorOverlay'
import { ConnectField } from './ConnectField'
import type { WebRuntimeConfig } from '../lib/appBootstrap'
import { getAuthSession, saveAuthSession, type AuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'
import './GameCreateScreen.css'

type ScenarioSummary = {
  id: string
  name: string
  displayName: string
  description: string
}

type ScenarioDetail = ScenarioSummary & {
  map?: { cells?: unknown[] }
  initialState?: { deployments?: Record<string, unknown> }
  victoryConditions?: { objectives?: Array<{ label?: string }> }
}

type AuthResponse = {
  userId: string
  token: string
}

type GameCreateScreenProps = {
  runtimeConfig?: WebRuntimeConfig
  navigate?: (path: string) => void
}

export function GameCreateScreen({ runtimeConfig, navigate }: GameCreateScreenProps) {
  const apiBaseUrl = runtimeConfig?.apiBaseUrl ?? 'http://localhost:3000'
  const [session, setSession] = useState<AuthSession | null>(() => getAuthSession())
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<ScenarioDetail | null>(null)
  const [role, setRole] = useState<'onion' | 'defender'>('onion')
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void requestJson<ScenarioSummary[]>({
      baseUrl: apiBaseUrl,
      path: 'scenarios',
      method: 'GET',
    }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
        return
      }
      setScenarios(result.data)
      setSelectedScenarioId((current) => current || result.data[0]?.id || '')
    }).catch(() => {
      if (!cancelled) setError('Unable to load scenarios.')
    }).finally(() => {
      if (!cancelled) setLoadingScenarios(false)
    })

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl])

  useEffect(() => {
    if (!selectedScenarioId) {
      return
    }

    let cancelled = false
    void requestJson<ScenarioDetail>({
      baseUrl: apiBaseUrl,
      path: `scenarios/${selectedScenarioId}`,
      method: 'GET',
    }).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSelectedScenarioDetail(result.data)
    }).catch(() => {
      if (!cancelled) setError('Unable to load the scenario preview.')
    }).finally(() => {
      if (!cancelled) setLoadingPreview(false)
    })

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, scenarios, selectedScenarioId])

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
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

      const nextSession: AuthSession = {
        apiBaseUrl,
        username: username.trim(),
        userId: result.data.userId,
        token: result.data.token,
      }
      saveAuthSession(nextSession)
      setSession(nextSession)
      setPassword('')
    } catch {
      setError('Unable to connect to the backend.')
    } finally {
      setWorking(false)
    }
  }

  async function handleCreateGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!session || !selectedScenarioId) return

    setError(null)
    setWorking(true)
    try {
      const result = await requestJson<{ gameId: number; role: 'onion' | 'defender' }>({
        baseUrl: session.apiBaseUrl,
        path: 'games',
        method: 'POST',
        token: session.token,
        body: { scenarioId: selectedScenarioId, role },
      })
      if (!result.ok) {
        setError(result.message)
        return
      }

      (navigate ?? ((path: string) => window.location.assign(path)))(`/game/${result.data.gameId}`)
    } catch {
      setError('Unable to create the game.')
    } finally {
      setWorking(false)
    }
  }

  const selectedScenario = selectedScenarioDetail?.id === selectedScenarioId
    ? selectedScenarioDetail
    : scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null
  const deploymentCount = selectedScenario?.initialState?.deployments
    ? Object.keys(selectedScenario.initialState.deployments).length
    : null
  const objectiveLabels = selectedScenario?.victoryConditions?.objectives
    ?.map((objective) => objective.label)
    .filter((label): label is string => Boolean(label)) ?? []

  return (
    <div className="shell create-game-shell">
      {error ? <ErrorOverlay message={error} className="error-overlay-connect" onDismiss={() => setError(null)} /> : null}
      <main className="create-game-layout">
        <header className="create-game-header">
          <div>
            <p className="eyebrow">New match</p>
            <h1>Create a game lobby</h1>
            <p className="create-game-intro">Choose the battlefield and your side. The other player can join after the lobby is created.</p>
          </div>
          <a className="gate-secondary-action create-game-back" href="/user/login">Back to sign in</a>
        </header>

        <div className="create-game-columns">
          <section className="panel create-game-options">
            <div className="card-head">
              <div>
                <p className="eyebrow">Match setup</p>
                <h2>Choose your opening position</h2>
              </div>
            </div>

            {!session ? (
              <form className="create-game-auth" onSubmit={handleSignIn}>
                <p className="create-game-section-copy">Sign in to create a lobby.</p>
                <ConnectField label="Username" value={username} placeholder="swamp walker" onChange={setUsername} />
                <ConnectField label="Password" value={password} placeholder="••••••••" type="password" onChange={setPassword} />
                <button type="submit" className="primary-action" disabled={working}>
                  {working ? 'Signing in...' : 'Sign In'}
                </button>
                <a className="gate-secondary-action" href="/user/create">Create an account</a>
              </form>
            ) : (
              <form className="create-game-form" onSubmit={handleCreateGame}>
                <div className="create-game-signed-in">
                  <span className="stat-label">Signed in as</span>
                  <strong>{session.username}</strong>
                </div>
                <label className="connect-field">
                  <span className="stat-label">Scenario</span>
                  <select value={selectedScenarioId} onChange={(event) => setSelectedScenarioId(event.target.value)} disabled={loadingScenarios || working}>
                    {loadingScenarios ? <option value="">Loading scenarios...</option> : null}
                    {scenarios.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.displayName}</option>)}
                  </select>
                </label>
                <label className="connect-field">
                  <span className="stat-label">Your side</span>
                  <select value={role} onChange={(event) => setRole(event.target.value as 'onion' | 'defender')} disabled={working}>
                    <option value="onion">The Onion</option>
                    <option value="defender">Defenders</option>
                  </select>
                </label>
                <button type="submit" className="primary-action" disabled={working || !selectedScenarioId || loadingScenarios}>
                  {working ? 'Creating lobby...' : 'Create Lobby'}
                </button>
              </form>
            )}
          </section>

          <aside className="panel create-game-preview" aria-live="polite">
            <div className="card-head">
              <div>
                <p className="eyebrow">Scenario preview</p>
                <h2>{selectedScenario?.displayName ?? 'Select a scenario'}</h2>
              </div>
              {loadingPreview ? <span className="preview-loading">Loading...</span> : null}
            </div>
            <p className="create-game-description">
              {selectedScenario?.description ?? 'Choose a scenario to see its objective and battlefield summary.'}
            </p>
            {selectedScenario ? (
              <div className="create-game-preview-details">
                <div className="preview-stat"><span>Map cells</span><strong>{selectedScenario.map?.cells?.length ?? 'n/a'}</strong></div>
                <div className="preview-stat"><span>Deployments</span><strong>{deploymentCount ?? 'n/a'}</strong></div>
                <div className="preview-stat"><span>Objectives</span><strong>{objectiveLabels.length || 'n/a'}</strong></div>
              </div>
            ) : null}
            {objectiveLabels.length > 0 ? (
              <div className="create-game-objectives">
                <span className="stat-label">Victory objectives</span>
                <ul>{objectiveLabels.map((label) => <li key={label}>{label}</li>)}</ul>
              </div>
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  )
}
