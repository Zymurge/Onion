import { ErrorOverlay } from './ErrorOverlay'
import { ConnectField } from './ConnectField'
import type { WebRuntimeConfig } from '../lib/appBootstrap'
import { useConnectionGate } from '../lib/useConnectionGate'
import type { SessionBinding } from '../lib/sessionBinding'

type ConnectGateProps = {
  runtimeConfig?: WebRuntimeConfig
  onConnectedSession: (binding: SessionBinding) => void
}

export function ConnectGate({ runtimeConfig, onConnectedSession }: ConnectGateProps) {
  const { connectDraft, connectError, handleConnect, setConnectDraft, setConnectError, submitConnectDraft } = useConnectionGate({
    runtimeConfig,
    onConnectedSession,
  })

  return (
    <div className="shell connect-shell">
      {connectError ? <ErrorOverlay message={connectError} className="error-overlay-connect" onDismiss={() => setConnectError(null)} /> : null}
      <section className="panel connect-panel">
        <div className="card-head">
          <div>
            <p className="eyebrow">Connect</p>
            <h1>Open a live game session</h1>
          </div>
        </div>
        <form className="connect-form" onSubmit={handleConnect}>
          <ConnectField
            label="API base URL"
            value={connectDraft.apiBaseUrl}
            placeholder="http://localhost:3000"
            onChange={(value) => setConnectDraft((draft) => ({ ...draft, apiBaseUrl: value }))}
          />
          <ConnectField
            label="Username"
            value={connectDraft.username}
            placeholder="player-1"
            onChange={(value) => setConnectDraft((draft) => ({ ...draft, username: value }))}
          />
          <ConnectField
            label="Password"
            value={connectDraft.password}
            placeholder="••••••••"
            type="password"
            onChange={(value) => setConnectDraft((draft) => ({ ...draft, password: value }))}
          />
          <ConnectField
            label="Game ID"
            value={connectDraft.gameId}
            placeholder="123"
            onChange={(value) => setConnectDraft((draft) => ({ ...draft, gameId: value }))}
          />
          <button type="submit" className="primary-action">Load Game</button>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
            <button
              type="button"
              style={{ minWidth: 36, fontWeight: 600, fontSize: 18, borderRadius: 8, padding: '4px 0' }}
              aria-label="Login as test user 1"
              onClick={() => {
                const nextDraft = { ...connectDraft, username: 'user1', password: 'user1P4ss' }
                setConnectDraft(nextDraft)
                void submitConnectDraft(nextDraft)
              }}
            >
              1
            </button>
            <button
              type="button"
              style={{ minWidth: 36, fontWeight: 600, fontSize: 18, borderRadius: 8, padding: '4px 0' }}
              aria-label="Login as test user 2"
              onClick={() => {
                const nextDraft = { ...connectDraft, username: 'user2', password: 'user2P4ss' }
                setConnectDraft(nextDraft)
                void submitConnectDraft(nextDraft)
              }}
            >
              2
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
