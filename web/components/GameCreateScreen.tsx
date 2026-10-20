import { useEffect, useState, type FormEvent } from 'react'
import { ErrorOverlay } from './ErrorOverlay'
import type { WebRuntimeConfig } from '../lib/appBootstrap'
import { clearAuthSession, getAuthSession } from '../lib/authSession'
import { requestJson } from '../../shared/apiProtocol'
import { UserSideMenu } from './UserSideMenu'
import { ScenarioDescription, ScenarioForceManifest, ScenarioVictoryConditions } from './ScenarioBriefingContent'
import { buildScenarioInfoData, type ScenarioDetailResponse } from '../lib/scenarioInfo'
import './GameCreateScreen.css'

type ScenarioSummary = {
  id: string
  name: string
  displayName: string
  description: string
}

type GameCreateScreenProps = {
  runtimeConfig?: WebRuntimeConfig
  navigate?: (path: string) => void
}

export function GameCreateScreen({ runtimeConfig, navigate }: GameCreateScreenProps) {
  const apiBaseUrl = runtimeConfig?.apiBaseUrl ?? 'http://localhost:3000'
  const session = getAuthSession()
  const [scenarios, setScenarios] = useState<ScenarioSummary[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState('')
  const [selectedScenarioDetail, setSelectedScenarioDetail] = useState<ScenarioDetailResponse | null>(null)
  const [role, setRole] = useState<'onion' | 'defender'>('onion')
  const [loadingScenarios, setLoadingScenarios] = useState(true)
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
    void requestJson<ScenarioDetailResponse>({
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
    })

    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, scenarios, selectedScenarioId])

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

      (navigate ?? ((path: string) => window.location.assign(path)))('/user/dashboard')
    } catch {
      setError('Unable to create the game.')
    } finally {
      setWorking(false)
    }
  }

  function handleSignOut() {
    clearAuthSession()
    ;(navigate ?? ((path: string) => window.location.assign(path)))('/user/login')
  }

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null
  const selectedDetail = selectedScenarioDetail?.id === selectedScenarioId ? selectedScenarioDetail : null
  const previewData = buildScenarioInfoData(null, selectedDetail, null)
  const deploymentCount = selectedDetail?.initialState?.deployments
    ? Object.keys(selectedDetail.initialState.deployments).length
    : null

  return (
    <div className="shell create-game-shell">
      {error ? <ErrorOverlay message={error} className="error-overlay-connect" onDismiss={() => setError(null)} /> : null}
      <div className="user-page-layout create-game-page-layout">
        <UserSideMenu activeItem="create-game" onSignOut={handleSignOut} />
        <main className="create-game-layout">
          <header className="create-game-header">
            <div>
              <p className="eyebrow">New match</p>
              <h1>Create a game</h1>
              <p className="create-game-intro">Choose the battlefield and your side. The other player can join after the game is created.</p>
            </div>
          </header>

          <div className="create-game-columns">
          <section className="panel create-game-options">
            <div className="card-head">
              <div>
                <p className="eyebrow">Match setup</p>
                <h2>Choose your opening position</h2>
              </div>
            </div>

            <form className="create-game-form" onSubmit={handleCreateGame}>
                <div className="create-game-signed-in">
                  <span className="stat-label">Signed in as</span>
                  <strong>{session?.username ?? 'current player'}</strong>
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
                  {working ? 'Creating game...' : 'Create Game'}
                </button>
            </form>
          </section>

          <aside className="panel create-game-preview" aria-live="polite">
            <div className="card-head">
              <div>
                <p className="eyebrow">Scenario preview</p>
                <h2>{selectedScenario?.displayName ?? 'Select a scenario'}</h2>
              </div>
            </div>
            <ScenarioDescription
              className="create-game-description"
              text={previewData.description ?? selectedScenario?.description ?? 'Choose a scenario to see its objective and battlefield summary.'}
            />
            {selectedScenario ? (
              <div className="create-game-preview-details">
                <div className="preview-stat"><span>Map cells</span><strong>{selectedDetail?.map?.cells?.length ?? 'n/a'}</strong></div>
                <div className="preview-stat"><span>Deployments</span><strong>{deploymentCount ?? 'n/a'}</strong></div>
                <div className="preview-stat"><span>Objectives</span><strong>{previewData.objectives.length || 'n/a'}</strong></div>
              </div>
            ) : null}
            {selectedDetail ? (
              <section className="create-game-objectives">
                <p className="eyebrow">Victory conditions</p>
                <ScenarioVictoryConditions
                  objectives={previewData.objectives}
                />
              </section>
            ) : null}
            {selectedDetail ? (
              <section className="create-game-forces">
                <p className="eyebrow">Forces</p>
                <ScenarioForceManifest manifest={previewData.manifest} />
              </section>
            ) : null}
          </aside>
          </div>
        </main>
      </div>
    </div>
  )
}
